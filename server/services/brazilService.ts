import { z } from 'zod';
import * as cheerio from 'cheerio';
import { storage } from '../storage.js';
import type { InsertSubsidyProgram } from '@shared/schema';

// Brazil-specific interfaces
interface PortalTransparenciaTransfer {
  id: string;
  programa: string;
  codigo: string;
  data: string;
  valor: number;
  municipio: string;
  orgao: string;
  beneficiario?: string;
  documento?: string;
}

interface PortalTransparenciaResponse {
  data: PortalTransparenciaTransfer[];
  pagination?: {
    current_page: number;
    total_pages: number;
    total_items: number;
  };
}

interface MapaNewsItem {
  title: string;
  href: string;
  summary?: string;
  pubDate?: string;
  guid?: string;
}

interface BndesNewsItem {
  title: string;
  href: string;
  pubDate?: string;
  summary?: string;
}

// Validation schemas
const portalTransparenciaSchema = z.object({
  id: z.string(),
  programa: z.string(),
  codigo: z.string(),
  data: z.string(),
  valor: z.number(),
  municipio: z.string(),
  orgao: z.string(),
  beneficiario: z.string().optional(),
  documento: z.string().optional()
});

const mapaNewsSchema = z.object({
  title: z.string(),
  href: z.string(),
  summary: z.string().optional(),
  pubDate: z.string().optional(),
  guid: z.string().optional()
});

/**
 * Brazil Agricultural Funding Service
 * Integrates MAPA Gov.br, Portal da Transparência API, and BNDES
 */
export class BrazilService {
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 1000;
  private readonly MAX_CONCURRENT_REQUESTS = 3;
  
  // Rate limits per Portal da Transparência documentation
  private readonly DAY_RATE_LIMIT = 90; // requests per minute during day
  private readonly NIGHT_RATE_LIMIT = 300; // requests per minute during night
  
  private apiToken: string | null = null;

  constructor() {
    this.apiToken = process.env.PORTAL_TRANSPARENCIA_TOKEN || null;
  }

  /**
   * Initialize the service and validate API token
   */
  async initialize(): Promise<boolean> {
    if (!this.apiToken) {
      console.warn('Portal da Transparência API token not provided');
      return false;
    }
    
    try {
      // Test API connectivity
      await this.testApiConnection();
      console.log('Brazil service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Brazil service:', error);
      return false;
    }
  }

  /**
   * Test API connection with a lightweight request
   */
  private async testApiConnection(): Promise<void> {
    if (!this.apiToken) throw new Error('API token required');

    const response = await fetch('https://api.portaldatransparencia.gov.br/api-de-dados/transferencias?pagina=1', {
      headers: {
        'chave-api-dados': this.apiToken,
        'User-Agent': 'AgFundingMonitor/1.0 (subsidycompanion@example.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`API test failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Get current rate limit based on time of day (São Paulo timezone)
   */
  private getCurrentRateLimit(): number {
    const now = new Date();
    const hour = now.getUTCHours() - 3; // Convert to São Paulo time (UTC-3)
    
    // Night time: 00:00-05:59 (300 rpm), Day time: 06:00-23:59 (90 rpm)
    return (hour >= 0 && hour < 6) ? this.NIGHT_RATE_LIMIT : this.DAY_RATE_LIMIT;
  }

  /**
   * Fetch transfers from Portal da Transparência with pagination
   */
  async fetchPortalTransfers(program?: string, maxPages: number = 50): Promise<PortalTransparenciaTransfer[]> {
    if (!this.apiToken) {
      throw new Error('Portal da Transparência API token required');
    }

    const allTransfers: PortalTransparenciaTransfer[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    console.log(`Fetching Portal da Transparência transfers${program ? ` for program: ${program}` : ''}...`);

    while (hasMorePages && currentPage <= maxPages) {
      try {
        const url = new URL('https://api.portaldatransparencia.gov.br/api-de-dados/transferencias');
        url.searchParams.set('pagina', currentPage.toString());
        if (program) {
          url.searchParams.set('programa', program);
        }

        const response = await this.retryWithBackoff(async () => {
          const res = await fetch(url.toString(), {
            headers: {
              'chave-api-dados': this.apiToken!,
              'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)'
            }
          });

          if (!res.ok) {
            throw new Error(`Portal API error: ${res.status} ${res.statusText}`);
          }

          return res;
        });

        const data: PortalTransparenciaTransfer[] = await response.json();
        
        if (data.length === 0) {
          hasMorePages = false;
          break;
        }

        // Validate each transfer
        const validatedTransfers = data.map(transfer => 
          portalTransparenciaSchema.parse(transfer)
        );

        allTransfers.push(...validatedTransfers);
        console.log(`Fetched page ${currentPage}: ${data.length} transfers`);

        currentPage++;

        // Rate limiting delay based on time of day
        const delayMs = (60 * 1000) / this.getCurrentRateLimit();
        await new Promise(resolve => setTimeout(resolve, delayMs));

      } catch (error) {
        console.error(`Error fetching page ${currentPage}:`, error);
        if (currentPage === 1) throw error; // Fail fast on first page
        break; // Continue with partial data on subsequent pages
      }
    }

    console.log(`Portal da Transparência fetch completed: ${allTransfers.length} total transfers`);
    return allTransfers;
  }

  /**
   * Scrape MAPA Gov.br news with respectful polling
   */
  async scrapeMapaNews(): Promise<MapaNewsItem[]> {
    console.log('Scraping MAPA Gov.br news...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.gov.br/agricultura/pt-br/noticias', {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) {
          throw new Error(`MAPA scraping error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const newsItems = this.parseMapaHtml(html);
      
      console.log(`MAPA news scraping completed: ${newsItems.length} items found`);
      return newsItems;

    } catch (error) {
      console.error('Error scraping MAPA news:', error);
      return [];
    }
  }

  /**
   * Parse MAPA HTML to extract news items using cheerio
   */
  private parseMapaHtml(html: string): MapaNewsItem[] {
    const items: MapaNewsItem[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for articles, news items, or similar content structures
      $('article, .noticia, .news-item, .post').each((_, element) => {
        const $element = $(element);
        
        // Extract title from various possible selectors
        const titleEl = $element.find('h1, h2, h3, h4, .title, .titulo').first();
        const title = titleEl.text().trim();
        
        if (!title) return;
        
        // Extract link
        const linkEl = $element.find('a').first();
        const href = linkEl.attr('href');
        
        if (!href) return;
        
        // Extract date
        const dateEl = $element.find('time, .date, .data, .fecha');
        const pubDate = dateEl.attr('datetime') || dateEl.text().trim();
        
        // Extract summary
        const summaryEl = $element.find('p, .summary, .resumo, .excerpt').first();
        const summary = summaryEl.text().trim();
        
        const item: MapaNewsItem = {
          title,
          href: this.normalizeUrl(href, 'https://www.gov.br'),
          pubDate: pubDate || undefined,
          summary: summary || undefined,
          guid: this.generateGuid(href, title)
        };

        // Filter for agriculture-related content
        if (this.isAgriculturalContent(item.title)) {
          items.push(item);
        }
      });
      
      // If no articles found, try broader selectors
      if (items.length === 0) {
        $('div, section, li').each((_, element) => {
          const $element = $(element);
          const title = $element.find('h1, h2, h3, h4, a').first().text().trim();
          const href = $element.find('a').first().attr('href');
          
          if (title && href && this.isAgriculturalContent(title)) {
            items.push({
              title,
              href: this.normalizeUrl(href, 'https://www.gov.br'),
              guid: this.generateGuid(href, title)
            });
          }
        });
      }
      
    } catch (error) {
      console.error('Error parsing MAPA HTML with cheerio:', error);
    }

    return items;
  }

  /**
   * Scrape BNDES news for rural credit announcements
   */
  async scrapeBndesNews(): Promise<BndesNewsItem[]> {
    console.log('Scraping BNDES news...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.bndes.gov.br/wps/portal/site/home/conhecimento/noticias', {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) {
          throw new Error(`BNDES scraping error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const newsItems = this.parseBndesHtml(html);
      
      console.log(`BNDES news scraping completed: ${newsItems.length} rural credit items found`);
      return newsItems;

    } catch (error) {
      console.error('Error scraping BNDES news:', error);
      return [];
    }
  }

  /**
   * Parse BNDES HTML to extract rural credit news using cheerio
   */
  private parseBndesHtml(html: string): BndesNewsItem[] {
    const items: BndesNewsItem[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for news items, articles, or content structures
      $('.noticia, .news, .post, article, .content-item').each((_, element) => {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find('h1, h2, h3, h4, .title, .titulo').first();
        const title = titleEl.text().trim();
        
        if (!title) return;
        
        // Filter for rural/agricultural credit content early
        if (!this.isRuralCreditContent(title)) return;
        
        // Extract link
        const linkEl = $element.find('a').first();
        const href = linkEl.attr('href');
        
        if (!href) return;
        
        // Extract date
        const dateEl = $element.find('.data, .date, .fecha, time, .published');
        const pubDate = dateEl.attr('datetime') || dateEl.text().trim();
        
        // Extract summary
        const summaryEl = $element.find('p, .summary, .resumo, .excerpt').first();
        const summary = summaryEl.text().trim();
        
        const item: BndesNewsItem = {
          title,
          href: this.normalizeUrl(href, 'https://www.bndes.gov.br'),
          pubDate: pubDate || undefined,
          summary: summary || undefined
        };
        
        items.push(item);
      });
      
      // If no specific news items found, try broader search
      if (items.length === 0) {
        $('div, section, li').each((_, element) => {
          const $element = $(element);
          const title = $element.find('h1, h2, h3, h4, a').first().text().trim();
          const href = $element.find('a').first().attr('href');
          
          if (title && href && this.isRuralCreditContent(title)) {
            items.push({
              title,
              href: this.normalizeUrl(href, 'https://www.bndes.gov.br'),
              summary: $element.find('p').first().text().trim() || undefined
            });
          }
        });
      }
      
    } catch (error) {
      console.error('Error parsing BNDES HTML with cheerio:', error);
    }

    return items;
  }

  /**
   * Convert Portal da Transparência transfer to SubsidyProgram
   */
  private convertTransferToProgram(transfer: PortalTransparenciaTransfer): InsertSubsidyProgram {
    const id = `portal-transparencia-${transfer.id || this.generateTransferId(transfer)}`;
    
    return {
      id,
      title: `${transfer.programa} - ${transfer.municipio}`,
      summary: `Federal transfer program: ${transfer.programa}. Managed by ${transfer.orgao}. Location: ${transfer.municipio}.`,
      category: 'Federal Transfer',
      publishedDate: new Date(transfer.data),
      url: `https://portaldatransparencia.gov.br/transferencias/${transfer.id}`,
      fundingAmount: `R$ ${transfer.valor.toLocaleString('pt-BR')}`,
      deadline: null, // Transfer records don't have application deadlines
      location: transfer.municipio,
      program: transfer.programa,
      dataSource: 'portal_transparencia',
      sourceUrl: `https://portaldatransparencia.gov.br/transferencias/${transfer.id}`,
      sourceAgency: transfer.orgao,
      country: 'BR',
      region: transfer.municipio,
      opportunityNumber: transfer.codigo,
      eligibilityTypes: ['farm', 'rural-business'],
      fundingTypes: ['transfer'],
      mergedFromSources: ['portal_transparencia']
    };
  }

  /**
   * Convert MAPA news to SubsidyProgram
   */
  private convertMapaNewsToProgram(news: MapaNewsItem): InsertSubsidyProgram {
    const id = `mapa-news-${news.guid || this.generateGuid(news.href, news.title)}`;
    
    return {
      id,
      title: news.title,
      summary: news.summary || `MAPA announcement: ${news.title}`,
      category: 'Government Announcement',
      publishedDate: news.pubDate ? new Date(news.pubDate) : new Date(),
      url: news.href,
      fundingAmount: 'Amount to be determined',
      deadline: null,
      location: 'Brazil',
      program: 'MAPA Announcements',
      dataSource: 'mapa_news',
      sourceUrl: news.href,
      sourceAgency: 'Ministério da Agricultura, Pecuária e Abastecimento (MAPA)',
      country: 'BR',
      region: 'Federal',
      opportunityNumber: null,
      eligibilityTypes: ['farm', 'rural-enterprise'],
      fundingTypes: ['grant', 'support'],
      mergedFromSources: ['mapa_news']
    };
  }

  /**
   * Convert BNDES news to SubsidyProgram
   */
  private convertBndesNewsToProgram(news: BndesNewsItem): InsertSubsidyProgram {
    const id = `bndes-news-${this.generateGuid(news.href, news.title)}`;
    
    return {
      id,
      title: news.title,
      summary: news.summary || `BNDES rural credit announcement: ${news.title}`,
      category: 'Rural Credit',
      publishedDate: news.pubDate ? new Date(news.pubDate) : new Date(),
      url: news.href,
      fundingAmount: 'Variable credit lines',
      deadline: null,
      location: 'Brazil',
      program: 'BNDES Rural Credit',
      dataSource: 'bndes_news',
      sourceUrl: news.href,
      sourceAgency: 'Banco Nacional de Desenvolvimento Econômico e Social (BNDES)',
      country: 'BR',
      region: 'Federal',
      opportunityNumber: null,
      eligibilityTypes: ['farm', 'rural-enterprise', 'cooperative'],
      fundingTypes: ['loan', 'credit'],
      mergedFromSources: ['bndes_news']
    };
  }

  /**
   * Sync all Brazil sources to storage
   */
  async syncAllSources(): Promise<{ transfers: number; mapaNews: number; bndesNews: number }> {
    console.log('Starting Brazil multi-source sync...');
    
    const results = {
      transfers: 0,
      mapaNews: 0,
      bndesNews: 0
    };

    try {
      // Sync Portal da Transparência transfers
      const transfers = await this.fetchPortalTransfers();
      for (const transfer of transfers) {
        try {
          const program = this.convertTransferToProgram(transfer);
          await this.upsertProgram(program);
          results.transfers++;
        } catch (error) {
          console.error(`Error processing transfer ${transfer.id}:`, error);
        }
      }

      // Sync MAPA news
      const mapaNews = await this.scrapeMapaNews();
      for (const news of mapaNews) {
        try {
          const program = this.convertMapaNewsToProgram(news);
          await this.upsertProgram(program);
          results.mapaNews++;
        } catch (error) {
          console.error(`Error processing MAPA news ${news.title}:`, error);
        }
      }

      // Sync BNDES news
      const bndesNews = await this.scrapeBndesNews();
      for (const news of bndesNews) {
        try {
          const program = this.convertBndesNewsToProgram(news);
          await this.upsertProgram(program);
          results.bndesNews++;
        } catch (error) {
          console.error(`Error processing BNDES news ${news.title}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in Brazil sync:', error);
    }

    console.log(`Brazil sync completed: ${results.transfers} transfers, ${results.mapaNews} MAPA news, ${results.bndesNews} BNDES news`);
    return results;
  }

  /**
   * Upsert program with conflict resolution
   */
  private async upsertProgram(program: InsertSubsidyProgram): Promise<void> {
    const existing = await storage.getSubsidyProgramById(program.id);
    
    if (existing) {
      // Apply Brazil conflict resolution policy
      const merged = this.mergeWithConflictResolution(existing, program);
      await storage.updateSubsidyProgram(program.id, merged);
      console.log(`Updated Brazil program: ${program.title}`);
    } else {
      await storage.createSubsidyProgram(program);
      console.log(`Created Brazil program: ${program.title}`);
    }
  }

  /**
   * Merge programs using Brazil-specific conflict resolution
   */
  private mergeWithConflictResolution(existing: any, incoming: InsertSubsidyProgram): Partial<InsertSubsidyProgram> {
    const conflicts: any = {};
    const merged = { ...incoming };

    // Apply Brazil precedence: portal_transparencia > mapa_news > bndes_news
    const precedence = ['portal_transparencia', 'mapa_news', 'bndes_news'];
    const existingPrecedence = precedence.indexOf(existing.dataSource);
    const incomingPrecedence = precedence.indexOf(incoming.dataSource);

    // Use highest precedence source for conflicting fields
    if (existingPrecedence < incomingPrecedence) {
      // Existing has higher precedence, keep its values for key fields
      merged.title = existing.title;
      merged.fundingAmount = existing.fundingAmount;
      merged.summary = existing.summary;
    }

    // Merge sources array
    const existingSources = existing.mergedFromSources || [existing.dataSource];
    const incomingSources = incoming.mergedFromSources || [incoming.dataSource];
    merged.mergedFromSources = Array.from(new Set([...existingSources, ...incomingSources]));

    // Use earliest published date
    if (existing.publishedDate && incoming.publishedDate) {
      merged.publishedDate = existing.publishedDate < incoming.publishedDate ? 
        existing.publishedDate : incoming.publishedDate;
    } else {
      merged.publishedDate = existing.publishedDate || incoming.publishedDate;
    }

    // Store conflict resolution audit
    if (Object.keys(conflicts).length > 0) {
      merged.conflictResolution = JSON.stringify({
        timestamp: new Date().toISOString(),
        conflicts,
        resolvedBy: 'brazil_precedence_rules'
      });
    }

    return merged;
  }

  // Helper methods
  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.MAX_RETRIES - 1) {
          const delay = this.BASE_DELAY * Math.pow(2, attempt);
          console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private normalizeUrl(url: string, baseUrl?: string): string {
    try {
      if (url.startsWith('/') && baseUrl) {
        return new URL(url, baseUrl).toString();
      }
      return new URL(url).toString();
    } catch {
      return url;
    }
  }

  private generateGuid(href: string, title: string): string {
    const content = `${href}|${title}`;
    // Simple hash function for consistent GUIDs
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private generateTransferId(transfer: PortalTransparenciaTransfer): string {
    return this.generateGuid(
      `${transfer.programa}|${transfer.codigo}|${transfer.data}|${transfer.valor}`,
      transfer.municipio
    );
  }

  private isAgriculturalContent(title: string): boolean {
    const keywords = [
      'agricultura', 'rural', 'agropecuária', 'safra', 'plantio', 'colheita',
      'pronaf', 'pronamp', 'garantia-safra', 'seguro', 'crédito rural',
      'cooperativa', 'pecuária', 'irrigação', 'fertilizante', 'semente'
    ];
    
    return keywords.some(keyword => 
      title.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private isRuralCreditContent(title: string): boolean {
    const keywords = [
      'rural', 'crédito', 'financiamento', 'agropecuário', 'agricultura',
      'safra', 'investimento', 'custeio', 'bndes', 'pronaf'
    ];
    
    return keywords.some(keyword => 
      title.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private inferPracticesFromProgram(program: string): string[] {
    const practices: string[] = [];
    const programLower = program.toLowerCase();
    
    if (programLower.includes('garantia-safra')) {
      practices.push('Crop insurance', 'Risk management');
    }
    if (programLower.includes('seguro')) {
      practices.push('Agricultural insurance', 'Risk protection');
    }
    if (programLower.includes('crédito') || programLower.includes('pronaf')) {
      practices.push('Agricultural credit', 'Rural financing');
    }
    if (programLower.includes('irrigação')) {
      practices.push('Irrigation', 'Water management');
    }
    
    return practices.length > 0 ? practices : ['General agricultural support'];
  }

  private inferPracticesFromTitle(title: string): string[] {
    const practices: string[] = [];
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('tecnologia')) {
      practices.push('Agricultural technology', 'Innovation');
    }
    if (titleLower.includes('sustentável')) {
      practices.push('Sustainable agriculture', 'Environmental conservation');
    }
    if (titleLower.includes('exportação')) {
      practices.push('Export promotion', 'Market access');
    }
    
    return practices.length > 0 ? practices : ['Agricultural development'];
  }

  private generateTagsFromTransfer(transfer: PortalTransparenciaTransfer): string[] {
    return [
      'brazil',
      'federal-transfer',
      transfer.programa.toLowerCase().replace(/\s+/g, '-'),
      transfer.orgao.toLowerCase().replace(/\s+/g, '-'),
      transfer.municipio.toLowerCase().replace(/\s+/g, '-')
    ];
  }

  private generateTagsFromNews(news: MapaNewsItem): string[] {
    const tags = ['brazil', 'mapa', 'announcement'];
    
    // Add tags based on title content
    if (news.title.toLowerCase().includes('safra')) tags.push('safra');
    if (news.title.toLowerCase().includes('pronaf')) tags.push('pronaf');
    if (news.title.toLowerCase().includes('crédito')) tags.push('credito-rural');
    
    return tags;
  }

  private generateTagsFromBndes(news: BndesNewsItem): string[] {
    const tags = ['brazil', 'bndes', 'rural-credit'];
    
    // Add tags based on title content
    if (news.title.toLowerCase().includes('financiamento')) tags.push('financiamento');
    if (news.title.toLowerCase().includes('investimento')) tags.push('investimento');
    if (news.title.toLowerCase().includes('cooperativa')) tags.push('cooperativa');
    
    return tags;
  }
}

export const brazilService = new BrazilService();