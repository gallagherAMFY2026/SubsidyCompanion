import { z } from 'zod';
import * as cheerio from 'cheerio';
import { storage } from '../storage.js';
import type { InsertSubsidyProgram } from '@shared/schema';

// Chile-specific interfaces
interface ChileCompraLicitacion {
  CodigoExterno: string;
  Numero: string;
  Nombre: string;
  Descripcion: string;
  Estado: string;
  FechaCreacion: string;
  FechaCierre?: string;
  Monto: number;
  Moneda: string;
  RutUnidadCompradora: string;
  NombreUnidadCompradora: string;
  Link?: string;
}

interface ChileCompraResponse {
  Listado: ChileCompraLicitacion[];
  Cantidad: number;
}

interface PresupuestoAbiertoItem {
  id: string;
  codigo_institucion: string;
  nombre_institucion: string;
  codigo_programa: string;
  nombre_programa: string;
  mes: number;
  anio: number;
  monto_devengado: number;
  monto_comprometido: number;
}

interface MinagriNewsItem {
  title: string;
  href: string;
  summary?: string;
  pubDate?: string;
  guid?: string;
}

interface FiaCallItem {
  title: string;
  href: string;
  status?: string;
  deadline?: string;
  description?: string;
}

// Validation schemas
const chileCompraSchema = z.object({
  CodigoExterno: z.string(),
  Numero: z.string(),
  Nombre: z.string(),
  Descripcion: z.string(),
  Estado: z.string(),
  FechaCreacion: z.string(),
  FechaCierre: z.string().optional(),
  Monto: z.number(),
  Moneda: z.string(),
  RutUnidadCompradora: z.string(),
  NombreUnidadCompradora: z.string(),
  Link: z.string().optional()
});

const presupuestoAbiertoSchema = z.object({
  id: z.string(),
  codigo_institucion: z.string(),
  nombre_institucion: z.string(),
  codigo_programa: z.string(),
  nombre_programa: z.string(),
  mes: z.number(),
  anio: z.number(),
  monto_devengado: z.number(),
  monto_comprometido: z.number()
});

/**
 * Chile Agricultural Funding Service
 * Integrates MINAGRI, INDAP, FIA, ChileCompra API, and Presupuesto Abierto
 */
export class ChileService {
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 1000;
  private readonly MAX_CONCURRENT_REQUESTS = 3;
  
  private chileCompraTicket: string | null = null;

  constructor() {
    this.chileCompraTicket = process.env.CHILECOMPRA_TICKET || null;
  }

  /**
   * Initialize the service and validate API access
   */
  async initialize(): Promise<boolean> {
    try {
      // Test network connectivity with basic endpoints
      await this.testConnectivity();
      console.log('Chile service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Chile service:', error);
      return false;
    }
  }

  /**
   * Test basic connectivity to Chilean endpoints
   */
  private async testConnectivity(): Promise<void> {
    // Test MINAGRI website accessibility
    try {
      const response = await fetch('https://minagri.gob.cl/', {
        method: 'HEAD',
        headers: {
          'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)'
        }
      });
      
      if (!response.ok) {
        throw new Error(`MINAGRI connectivity test failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('MINAGRI connectivity test failed:', error);
    }
  }

  /**
   * Fetch agriculture-related tenders from ChileCompra API
   */
  async fetchChileCompraTenders(searchTerms: string[] = ['agricultura', 'INDAP', 'FIA', 'MINAGRI']): Promise<ChileCompraLicitacion[]> {
    if (!this.chileCompraTicket) {
      console.warn('ChileCompra API ticket not provided, skipping API calls');
      return [];
    }

    const allTenders: ChileCompraLicitacion[] = [];

    for (const term of searchTerms) {
      try {
        const url = new URL('https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json');
        url.searchParams.set('ticket', this.chileCompraTicket);
        url.searchParams.set('estado', 'Publicada');
        url.searchParams.set('texto', term);

        const response = await this.retryWithBackoff(async () => {
          const res = await fetch(url.toString(), {
            headers: {
              'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)'
            }
          });

          if (!res.ok) {
            throw new Error(`ChileCompra API error: ${res.status} ${res.statusText}`);
          }

          return res;
        });

        const data: ChileCompraResponse = await response.json();
        
        if (data.Listado && data.Listado.length > 0) {
          // Validate each tender
          const validatedTenders = data.Listado.map(tender => 
            chileCompraSchema.parse(tender)
          );

          allTenders.push(...validatedTenders);
          console.log(`ChileCompra: Found ${validatedTenders.length} tenders for "${term}"`);
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error fetching ChileCompra tenders for "${term}":`, error);
      }
    }

    // Remove duplicates based on CodigoExterno
    const uniqueTenders = allTenders.filter((tender, index, self) => 
      index === self.findIndex(t => t.CodigoExterno === tender.CodigoExterno)
    );

    console.log(`ChileCompra fetch completed: ${uniqueTenders.length} unique tenders found`);
    return uniqueTenders;
  }

  /**
   * Fetch MINAGRI budget execution from Presupuesto Abierto API
   */
  async fetchPresupuestoAbierto(): Promise<PresupuestoAbiertoItem[]> {
    console.log('Fetching Presupuesto Abierto data for agriculture...');

    try {
      const url = 'https://api.presupuestoabierto.gob.cl/api/v1/institutions?search=agricultura';

      const response = await this.retryWithBackoff(async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)'
          }
        });

        if (!res.ok) {
          throw new Error(`Presupuesto Abierto API error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const data: PresupuestoAbiertoItem[] = await response.json();
      
      // Validate each item
      const validatedItems = data.map(item => 
        presupuestoAbiertoSchema.parse(item)
      );

      console.log(`Presupuesto Abierto fetch completed: ${validatedItems.length} items found`);
      return validatedItems;

    } catch (error) {
      console.error('Error fetching Presupuesto Abierto data:', error);
      return [];
    }
  }

  /**
   * Scrape MINAGRI news with respectful polling
   */
  async scrapeMinagriNews(): Promise<MinagriNewsItem[]> {
    console.log('Scraping MINAGRI news...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://minagri.gob.cl/noticias-minagri/', {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) {
          throw new Error(`MINAGRI scraping error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const newsItems = this.parseMinagriHtml(html);
      
      console.log(`MINAGRI news scraping completed: ${newsItems.length} items found`);
      return newsItems;

    } catch (error) {
      console.error('Error scraping MINAGRI news:', error);
      return [];
    }
  }

  /**
   * Scrape FIA calls and announcements
   */
  async scrapeFiaCalls(): Promise<FiaCallItem[]> {
    console.log('Scraping FIA calls...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.fia.cl/', {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (agricultural-funding-monitor)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) {
          throw new Error(`FIA scraping error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const calls = this.parseFiaHtml(html);
      
      console.log(`FIA calls scraping completed: ${calls.length} items found`);
      return calls;

    } catch (error) {
      console.error('Error scraping FIA calls:', error);
      return [];
    }
  }

  /**
   * Parse MINAGRI HTML to extract news items using cheerio
   */
  private parseMinagriHtml(html: string): MinagriNewsItem[] {
    const items: MinagriNewsItem[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for articles, news items, or content structures
      $('article, .noticia, .news-item, .post, .content-item').each((_, element) => {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find('h1, h2, h3, h4, .title, .titulo').first();
        const title = titleEl.text().trim();
        
        if (!title) return;
        
        // Filter for agricultural content
        if (!this.isAgriculturalContent(title)) return;
        
        // Extract link
        const linkEl = $element.find('a').first();
        const href = linkEl.attr('href');
        
        if (!href) return;
        
        // Extract date
        const dateEl = $element.find('time, .date, .fecha, .published');
        const pubDate = dateEl.attr('datetime') || dateEl.text().trim();
        
        // Extract summary
        const summaryEl = $element.find('p, .summary, .resumen, .excerpt').first();
        const summary = summaryEl.text().trim();
        
        const item: MinagriNewsItem = {
          title,
          href: this.normalizeUrl(href, 'https://minagri.gob.cl'),
          pubDate: pubDate || undefined,
          summary: summary || undefined,
          guid: this.generateGuid(href, title)
        };

        items.push(item);
      });
      
      // If no specific items found, try broader search
      if (items.length === 0) {
        $('div, section, li').each((_, element) => {
          const $element = $(element);
          const title = $element.find('h1, h2, h3, h4, a').first().text().trim();
          const href = $element.find('a').first().attr('href');
          
          if (title && href && this.isAgriculturalContent(title)) {
            items.push({
              title,
              href: this.normalizeUrl(href, 'https://minagri.gob.cl'),
              guid: this.generateGuid(href, title)
            });
          }
        });
      }
      
    } catch (error) {
      console.error('Error parsing MINAGRI HTML with cheerio:', error);
    }

    return items;
  }

  /**
   * Parse FIA HTML to extract call items using cheerio
   */
  private parseFiaHtml(html: string): FiaCallItem[] {
    const items: FiaCallItem[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for convocatorias, cards, calls, or similar structures
      $('.convocatoria, .card, .call, .convocatorias, .proyecto, .concurso').each((_, element) => {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find('h1, h2, h3, h4, .card-title, .title, .titulo').first();
        const title = titleEl.text().trim();
        
        if (!title) return;
        
        // Filter for FIA relevant content
        if (!this.isFiaRelevantContent(title)) return;
        
        // Extract link
        const linkEl = $element.find('a').first();
        const href = linkEl.attr('href');
        
        if (!href) return;
        
        // Extract status
        const statusEl = $element.find('.estado, .status, .state, .vigencia');
        const status = statusEl.text().trim();
        
        // Extract deadline/fecha
        const deadlineEl = $element.find('.fecha, .deadline, .cierre, .vencimiento, .plazo');
        const deadline = deadlineEl.text().trim();
        
        // Extract description
        const descEl = $element.find('p, .description, .descripcion, .resumen').first();
        const description = descEl.text().trim();
        
        const item: FiaCallItem = {
          title,
          href: this.normalizeUrl(href, 'https://www.fia.cl'),
          status: status || undefined,
          deadline: deadline || undefined,
          description: description || undefined
        };

        items.push(item);
      });
      
      // If no specific calls found, try broader search
      if (items.length === 0) {
        $('div, section, article, li').each((_, element) => {
          const $element = $(element);
          const title = $element.find('h1, h2, h3, h4, a').first().text().trim();
          const href = $element.find('a').first().attr('href');
          
          if (title && href && this.isFiaRelevantContent(title)) {
            items.push({
              title,
              href: this.normalizeUrl(href, 'https://www.fia.cl'),
              description: $element.find('p').first().text().trim() || undefined
            });
          }
        });
      }
      
    } catch (error) {
      console.error('Error parsing FIA HTML with cheerio:', error);
    }

    return items;
  }

  /**
   * Convert ChileCompra tender to SubsidyProgram
   */
  private convertChileCompraTenderToProgram(tender: ChileCompraLicitacion): InsertSubsidyProgram {
    const id = `chilecompra-${tender.CodigoExterno || tender.Numero}`;
    
    return {
      id,
      title: tender.Nombre,
      summary: tender.Descripcion,
      category: 'Public Procurement',
      publishedDate: new Date(tender.FechaCreacion),
      url: tender.Link || `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${tender.CodigoExterno}`,
      fundingAmount: `${tender.Monto.toLocaleString('es-CL')} ${tender.Moneda}`,
      deadline: tender.FechaCierre ? new Date(tender.FechaCierre) : null,
      location: 'Chile',
      program: 'ChileCompra Public Procurement',
      dataSource: 'chilecompra_api',
      sourceUrl: tender.Link || `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${tender.CodigoExterno}`,
      sourceAgency: tender.NombreUnidadCompradora,
      country: 'CL',
      region: 'National',
      opportunityNumber: tender.CodigoExterno,
      eligibilityTypes: ['organization', 'company'],
      fundingTypes: ['procurement', 'contract'],
      mergedFromSources: ['chilecompra_api']
    };
  }

  /**
   * Convert Presupuesto Abierto item to SubsidyProgram
   */
  private convertPresupuestoAbiertoToProgram(item: PresupuestoAbiertoItem): InsertSubsidyProgram {
    const id = `presupuesto-abierto-${item.id || this.generateGuid(item.codigo_institucion + item.codigo_programa, item.nombre_programa)}`;
    
    return {
      id,
      title: `${item.nombre_programa} - ${item.nombre_institucion}`,
      summary: `Budget execution for ${item.nombre_programa}. Institution: ${item.nombre_institucion}.`,
      category: 'Budget Execution',
      publishedDate: new Date(item.anio, item.mes - 1, 1), // First day of the month
      url: `https://www.presupuestoabierto.gob.cl/presupuesto/${item.codigo_institucion}`,
      fundingAmount: `CLP ${item.monto_devengado.toLocaleString('es-CL')} executed, ${item.monto_comprometido.toLocaleString('es-CL')} committed`,
      deadline: null,
      location: 'Chile',
      program: item.nombre_programa,
      dataSource: 'presupuesto_abierto',
      sourceUrl: `https://www.presupuestoabierto.gob.cl/presupuesto/${item.codigo_institucion}`,
      sourceAgency: item.nombre_institucion,
      country: 'CL',
      region: 'National',
      opportunityNumber: item.codigo_programa,
      eligibilityTypes: ['government', 'organization'],
      fundingTypes: ['budget-execution'],
      mergedFromSources: ['presupuesto_abierto']
    };
  }

  /**
   * Convert MINAGRI news to SubsidyProgram
   */
  private convertMinagriNewsToProgram(news: MinagriNewsItem): InsertSubsidyProgram {
    const id = `minagri-news-${news.guid || this.generateGuid(news.href, news.title)}`;
    
    return {
      id,
      title: news.title,
      summary: news.summary || `MINAGRI announcement: ${news.title}`,
      category: 'Government Announcement',
      publishedDate: news.pubDate ? new Date(news.pubDate) : new Date(),
      url: news.href,
      fundingAmount: 'Amount to be determined',
      deadline: null,
      location: 'Chile',
      program: 'MINAGRI Announcements',
      dataSource: 'minagri_news',
      sourceUrl: news.href,
      sourceAgency: 'Ministerio de Agricultura (MINAGRI)',
      country: 'CL',
      region: 'National',
      opportunityNumber: null,
      eligibilityTypes: ['farm', 'rural-enterprise'],
      fundingTypes: ['grant', 'support'],
      mergedFromSources: ['minagri_news']
    };
  }

  /**
   * Convert FIA call to SubsidyProgram
   */
  private convertFiaCallToProgram(call: FiaCallItem): InsertSubsidyProgram {
    const id = `fia-call-${this.generateGuid(call.href, call.title)}`;
    
    return {
      id,
      title: call.title,
      summary: call.description || `FIA innovation call: ${call.title}`,
      category: 'Innovation Call',
      publishedDate: new Date(),
      url: call.href,
      fundingAmount: 'Variable funding amounts',
      deadline: call.deadline ? this.parseChileanDate(call.deadline) : null,
      location: 'Chile',
      program: 'FIA Innovation Calls',
      dataSource: 'fia_calls',
      sourceUrl: call.href,
      sourceAgency: 'Fundación para la Innovación Agraria (FIA)',
      country: 'CL',
      region: 'National',
      opportunityNumber: null,
      eligibilityTypes: ['farm', 'research-institution', 'company'],
      fundingTypes: ['innovation-grant'],
      mergedFromSources: ['fia_calls']
    };
  }

  /**
   * Sync all Chile sources to storage
   */
  async syncAllSources(): Promise<{ tenders: number; budget: number; minagriNews: number; fiaCalls: number }> {
    console.log('Starting Chile multi-source sync...');
    
    const results = {
      tenders: 0,
      budget: 0,
      minagriNews: 0,
      fiaCalls: 0
    };

    try {
      // Sync ChileCompra tenders
      const tenders = await this.fetchChileCompraTenders();
      for (const tender of tenders) {
        try {
          const program = this.convertChileCompraTenderToProgram(tender);
          await this.upsertProgram(program);
          results.tenders++;
        } catch (error) {
          console.error(`Error processing tender ${tender.CodigoExterno}:`, error);
        }
      }

      // Sync Presupuesto Abierto data
      const budgetItems = await this.fetchPresupuestoAbierto();
      for (const item of budgetItems) {
        try {
          const program = this.convertPresupuestoAbiertoToProgram(item);
          await this.upsertProgram(program);
          results.budget++;
        } catch (error) {
          console.error(`Error processing budget item ${item.id}:`, error);
        }
      }

      // Sync MINAGRI news
      const minagriNews = await this.scrapeMinagriNews();
      for (const news of minagriNews) {
        try {
          const program = this.convertMinagriNewsToProgram(news);
          await this.upsertProgram(program);
          results.minagriNews++;
        } catch (error) {
          console.error(`Error processing MINAGRI news ${news.title}:`, error);
        }
      }

      // Sync FIA calls
      const fiaCalls = await this.scrapeFiaCalls();
      for (const call of fiaCalls) {
        try {
          const program = this.convertFiaCallToProgram(call);
          await this.upsertProgram(program);
          results.fiaCalls++;
        } catch (error) {
          console.error(`Error processing FIA call ${call.title}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in Chile sync:', error);
    }

    console.log(`Chile sync completed: ${results.tenders} tenders, ${results.budget} budget items, ${results.minagriNews} MINAGRI news, ${results.fiaCalls} FIA calls`);
    return results;
  }

  /**
   * Upsert program with conflict resolution
   */
  private async upsertProgram(program: InsertSubsidyProgram): Promise<void> {
    const existing = await storage.getSubsidyProgramById(program.id);
    
    if (existing) {
      // Apply Chile conflict resolution policy
      const merged = this.mergeWithConflictResolution(existing, program);
      await storage.updateSubsidyProgram(program.id, merged);
      console.log(`Updated Chile program: ${program.title}`);
    } else {
      await storage.createSubsidyProgram(program);
      console.log(`Created Chile program: ${program.title}`);
    }
  }

  /**
   * Merge programs using Chile-specific conflict resolution
   */
  private mergeWithConflictResolution(existing: any, incoming: InsertSubsidyProgram): Partial<InsertSubsidyProgram> {
    const merged = { ...incoming };

    // Apply Chile precedence: chilecompra > presupuesto_abierto > fia_calls > minagri_news
    const precedence = ['chilecompra_api', 'presupuesto_abierto', 'fia_calls', 'minagri_news'];
    const existingPrecedence = precedence.indexOf(existing.dataSource);
    const incomingPrecedence = precedence.indexOf(incoming.dataSource);

    // Use highest precedence source for conflicting fields
    if (existingPrecedence < incomingPrecedence) {
      merged.title = existing.title;
      merged.fundingAmount = existing.fundingAmount;
      merged.summary = existing.summary;
    }

    // Merge sources array
    const existingSources = existing.mergedFromSources || [existing.dataSource];
    const incomingSources = incoming.mergedFromSources || [incoming.dataSource];
    merged.mergedFromSources = Array.from(new Set([...existingSources, ...incomingSources]));

    // Use earliest deadline
    if (existing.deadline && incoming.deadline) {
      merged.deadline = existing.deadline < incoming.deadline ? existing.deadline : incoming.deadline;
    } else {
      merged.deadline = existing.deadline || incoming.deadline;
    }

    // Store conflict resolution audit
    merged.conflictResolution = JSON.stringify({
      timestamp: new Date().toISOString(),
      resolvedBy: 'chile_precedence_rules',
      sources: merged.mergedFromSources
    });

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

  private generateGuid(input1: string, input2: string): string {
    const content = `${input1}|${input2}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private isAgriculturalContent(title: string): boolean {
    const keywords = [
      'agricultura', 'agropecuario', 'rural', 'campesino', 'productor',
      'indap', 'fia', 'innovación agraria', 'riego', 'semilla',
      'ganadería', 'silvicultura', 'pesca', 'acuicultura'
    ];
    
    return keywords.some(keyword => 
      title.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private isFiaRelevantContent(title: string): boolean {
    const keywords = [
      'convocatoria', 'concurso', 'innovación', 'tecnología',
      'investigación', 'desarrollo', 'proyecto', 'financiamiento'
    ];
    
    return keywords.some(keyword => 
      title.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private parseChileanDate(dateStr: string): Date | null {
    try {
      // Handle common Chilean date formats
      const cleanDate = dateStr.replace(/[^\d\/\-\.]/g, '').trim();
      
      // Try DD/MM/YYYY format
      const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleanDate);
      if (ddmmyyyy) {
        return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
      }
      
      // Try DD-MM-YYYY format
      const ddmmyyyy2 = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(cleanDate);
      if (ddmmyyyy2) {
        return new Date(parseInt(ddmmyyyy2[3]), parseInt(ddmmyyyy2[2]) - 1, parseInt(ddmmyyyy2[1]));
      }
      
      // Fallback to standard parsing
      return new Date(dateStr);
    } catch {
      return null;
    }
  }
}

export const chileService = new ChileService();