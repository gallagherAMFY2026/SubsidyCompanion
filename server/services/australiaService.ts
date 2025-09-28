import { z } from 'zod';
import * as cheerio from 'cheerio';
import { storage } from '../storage.js';
import type { InsertSubsidyProgram, SubsidyProgram } from '@shared/schema';

// Australia-specific interfaces
interface DaffRssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

interface NswDpiRssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

interface GrantConnectOpportunity {
  title: string;
  href: string;
  status?: string;
  closeDate?: string;
  amount?: string;
}

interface PirsaProgram {
  title: string;
  href: string;
  summary?: string;
}

export class AustraliaService {
  private readonly USER_AGENT = 'SubsidyCompanion/1.0 (australian-agricultural-funding-monitor)';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  // Australian agricultural funding news URLs (user-provided comprehensive list)
  private readonly AUSTRALIA_NEWS_URLS = [
    // National Government Grant and News Sources
    'https://www.agriculture.gov.au/about/news-and-media',
    'https://www.agriculture.gov.au/biosecurity/partnerships/nbc/grants',
    'https://www.agriculture.gov.au/about/drought',
    'https://www.agriculture.gov.au/sites/default/files/sitecollectiondocuments/biosecurity/grants-funding.pdf',
    
    // Sector- and State-Specific Programs
    'https://www.dairyaustralia.com.au/news-and-events',
    'https://www.dairyaustralia.com.au/farm/business-tools/grants-and-funding',
    'https://agriculture.vic.gov.au/support-and-resources/emergency-management/drought',
    'https://agriculture.vic.gov.au/livestock-and-animals/animal-health/livestock-biosecurity',
    'https://pir.sa.gov.au/grants_and_funding',
    'https://pir.sa.gov.au/news',
    'https://recfit.com.au/news/',
    'https://recfit.com.au/projects/',
    
    // Sustainable Agriculture and Climate-Smart Farming
    'https://www.landcareaustralia.org.au/news-events/',
    'https://www.landcareaustralia.org.au/project/',
    'https://www.mla.com.au/news-and-events/industry-news/',
    'https://www.mla.com.au/research-and-development/Environment-and-sustainability/',
    
    // Technology and Equipment Support
    'https://www.agriculture.gov.au/sites/default/files/documents/on-farm-connectivity-program.pdf',
    'https://www.communications.gov.au/what-we-do/internet/mobile-coverage-and-capacity/mobile-black-spot-program',
    
    // Recent Funding News Articles
    'https://www.miragenews.com/tag/agriculture/',
    'https://www.miragenews.com/tag/grants/',
    'https://arena.gov.au/news/',
    'https://arena.gov.au/funding/',
    'https://www.argusmedia.com/en/news/agriculture',
    'https://www.argusmedia.com/en/news/fertilizer'
  ];
  
  // Enhanced funding opportunity keywords (user-focused)
  private readonly FUNDING_OPPORTUNITY_KEYWORDS = [
    'grant', 'grants', 'funding', 'fund', 'subsidy', 'subsidies',
    'rebate', 'application', 'applications', 'apply', 'deadline',
    'round', 'opportunity', 'opportunities', 'scheme', 'program',
    'assistance', 'support', 'initiative', 'eligibility', 'eligible'
  ];
  
  // Australian agricultural context keywords
  private readonly AGRICULTURE_KEYWORDS = [
    'agriculture', 'agricultural', 'farm', 'farming', 'livestock', 'dairy',
    'cattle', 'sheep', 'beef', 'goat', 'pig', 'poultry', 'aquaculture',
    'biosecurity', 'drought', 'primary producer', 'rural', 'pastoral',
    'sustainability', 'climate-smart', 'landcare', 'soil health'
  ];

  /**
   * Initialize the service (currently no setup required)
   */
  async initialize(): Promise<boolean> {
    console.log('Australia service initialized');
    return true;
  }

  /**
   * Sync all Australian agricultural funding sources using enhanced news scraping
   */
  async syncAllSources(): Promise<{ newsPrograms: number; totalPrograms: number }> {
    console.log('🇦🇺 Starting enhanced Australia agricultural funding sync...');
    const startTime = Date.now();

    const newsPrograms = await this.syncAustraliaNewsUrls();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`🇦🇺 Australia sync completed in ${duration}s: ${newsPrograms} programs processed`);

    return {
      newsPrograms,
      totalPrograms: newsPrograms
    };
  }

  /**
   * Sync Australian agricultural funding news URLs with enhanced processing
   */
  async syncAustraliaNewsUrls(): Promise<number> {
    console.log('🌾 Syncing Australian agricultural funding sources...');
    
    let totalPrograms = 0;
    const allPrograms: InsertSubsidyProgram[] = [];
    
    for (const url of this.AUSTRALIA_NEWS_URLS) {
      try {
        console.log(`Scraping: ${url}`);
        const programs = await this.scrapeAustraliaNewsPage(url);
        allPrograms.push(...programs);
        console.log(`Found ${programs.length} programs from ${url}`);
      } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        // Continue with other URLs even if one fails
      }
    }
    
    // Apply cross-source deduplication
    const deduplicatedPrograms = this.deduplicateAustraliaPrograms(allPrograms);
    console.log(`Deduplicated ${allPrograms.length} Australia programs to ${deduplicatedPrograms.length}`);
    
    // Store programs
    for (const program of deduplicatedPrograms) {
      try {
        const existing = await storage.getSubsidyProgramByDedupeKey(program.dedupeKey);
        if (existing) {
          await storage.updateSubsidyProgram(existing.id, program);
        } else {
          await storage.createSubsidyProgram(program);
        }
        totalPrograms++;
      } catch (error) {
        console.error('Error storing Australia program:', error);
      }
    }
    
    console.log(`Australia news sync completed: ${totalPrograms} programs processed`);
    return totalPrograms;
  }

  /**
   * Scrape a single Australian news page for agricultural funding programs
   */
  private async scrapeAustraliaNewsPage(url: string): Promise<InsertSubsidyProgram[]> {
    const programs: InsertSubsidyProgram[] = [];
    
    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`Australia news page fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      const domain = new URL(url).hostname;
      const selectors = this.getAustraliaSelectors(domain);
      
      // Extract program items using domain-specific selectors
      for (const selector of selectors) {
        for (let i = 0; i < $(selector).length; i++) {
          try {
            const element = $(selector)[i];
            const program = await this.extractAustraliaProgramFromElement($, element, url, domain);
            if (program && this.isValidAustraliaProgram(program)) {
              programs.push(program);
            }
          } catch (error) {
            console.warn('Error extracting Australia program from element:', error);
          }
        }
      }
      
      return programs;
      
    } catch (error) {
      console.error(`Error scraping Australia ${url}:`, error);
      return [];
    }
  }

  /**
   * Legacy DAFF RSS sync (deprecated - keeping for reference)
   */
  private async syncDaffRss(): Promise<number> {
    console.log('Syncing DAFF RSS feed...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.agriculture.gov.au/about/news/stay-informed/rss', {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`DAFF RSS fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const xmlText = await response.text();
      const items = this.parseDaffRss(xmlText);
      
      let processed = 0;
      for (const item of items) {
        if (this.isAgriculturalContent(item.title, item.description)) {
          const program = this.convertDaffRssToProgram(item);
          
          // Check for existing program
          const existing = await storage.getSubsidyProgramByDedupeKey(program.dedupeKey);
          if (existing) {
            await storage.updateSubsidyProgram(existing.id, program);
          } else {
            await storage.createSubsidyProgram(program);
          }
          processed++;
        }
      }

      console.log(`DAFF RSS sync completed: ${processed} agricultural items processed`);
      return processed;

    } catch (error) {
      console.error('Error syncing DAFF RSS:', error);
      return 0;
    }
  }

  /**
   * Sync NSW DPI RSS feed for state-level agricultural announcements
   */
  private async syncNswDpiRss(): Promise<number> {
    console.log('Syncing NSW DPI RSS feed...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.dpi.nsw.gov.au/about-us/media-centre/releases/rss-feeds', {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`NSW DPI RSS fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const xmlText = await response.text();
      const items = this.parseNswDpiRss(xmlText);
      
      let processed = 0;
      for (const item of items) {
        if (this.isAgriculturalContent(item.title, item.description)) {
          const program = this.convertNswDpiRssToProgram(item);
          
          // Check for existing program
          const existing = await storage.getSubsidyProgramByDedupeKey(program.dedupeKey);
          if (existing) {
            await storage.updateSubsidyProgram(existing.id, program);
          } else {
            await storage.createSubsidyProgram(program);
          }
          processed++;
        }
      }

      console.log(`NSW DPI RSS sync completed: ${processed} agricultural items processed`);
      return processed;

    } catch (error) {
      console.error('Error syncing NSW DPI RSS:', error);
      return 0;
    }
  }

  /**
   * Sync GrantConnect for Commonwealth agricultural opportunities
   */
  async syncGrantConnect(): Promise<number> {
    console.log('Syncing GrantConnect opportunities...');

    const keywords = ['agriculture', 'traceability', 'livestock', 'dairy', 'water', 'connectivity'];
    let totalProcessed = 0;

    for (const keyword of keywords) {
      try {
        const response = await this.retryWithBackoff(async () => {
          const res = await fetch(`https://www.communitygrants.gov.au/grants?keyword=${keyword}`, {
            headers: {
              'User-Agent': this.USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
          });

          if (!res.ok) {
            throw new Error(`GrantConnect fetch error: ${res.status} ${res.statusText}`);
          }

          return res;
        });

        const html = await response.text();
        const opportunities = this.parseGrantConnect(html);
        
        for (const opportunity of opportunities) {
          if (this.isAgriculturalContent(opportunity.title)) {
            const program = this.convertGrantConnectToProgram(opportunity);
            
            // Check for existing program
            const existing = await storage.getSubsidyProgramByDedupeKey(program.dedupeKey);
            if (existing) {
              await storage.updateSubsidyProgram(existing.id, program);
            } else {
              await storage.createSubsidyProgram(program);
            }
            totalProcessed++;
          }
        }

        // Delay between keyword searches
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error syncing GrantConnect keyword '${keyword}':`, error);
      }
    }

    console.log(`GrantConnect sync completed: ${totalProcessed} opportunities processed`);
    return totalProcessed;
  }

  /**
   * Sync PIRSA state programs for South Australian opportunities
   */
  async syncPirsaPrograms(): Promise<number> {
    console.log('Syncing PIRSA state programs...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://pir.sa.gov.au/funding', {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`PIRSA fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const programs = this.parsePirsaPrograms(html);
      
      let processed = 0;
      for (const program of programs) {
        if (this.isAgriculturalContent(program.title, program.summary)) {
          const subsidyProgram = this.convertPirsaToProgram(program);
          
          // Check for existing program
          const existing = await storage.getSubsidyProgramByDedupeKey(subsidyProgram.dedupeKey);
          if (existing) {
            await storage.updateSubsidyProgram(existing.id, subsidyProgram);
          } else {
            await storage.createSubsidyProgram(subsidyProgram);
          }
          processed++;
        }
      }

      console.log(`PIRSA programs sync completed: ${processed} programs processed`);
      return processed;

    } catch (error) {
      console.error('Error syncing PIRSA programs:', error);
      return 0;
    }
  }

  /**
   * Parse DAFF RSS XML using cheerio
   */
  private parseDaffRss(xml: string): DaffRssItem[] {
    const items: DaffRssItem[] = [];
    
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      
      $('item').each((_, element) => {
        const $item = $(element);
        
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = $item.find('description').text().trim();
        const pubDate = $item.find('pubDate').text().trim();
        const guid = $item.find('guid').text().trim();
        
        if (title && link) {
          items.push({
            title,
            link,
            description: description || undefined,
            pubDate: pubDate || undefined,
            guid: guid || undefined
          });
        }
      });
      
    } catch (error) {
      console.error('Error parsing DAFF RSS with cheerio:', error);
    }

    return items;
  }

  /**
   * Parse NSW DPI RSS XML using cheerio
   */
  private parseNswDpiRss(xml: string): NswDpiRssItem[] {
    const items: NswDpiRssItem[] = [];
    
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      
      $('item').each((_, element) => {
        const $item = $(element);
        
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = $item.find('description').text().trim();
        const pubDate = $item.find('pubDate').text().trim();
        const guid = $item.find('guid').text().trim();
        
        if (title && link) {
          items.push({
            title,
            link,
            description: description || undefined,
            pubDate: pubDate || undefined,
            guid: guid || undefined
          });
        }
      });
      
    } catch (error) {
      console.error('Error parsing NSW DPI RSS with cheerio:', error);
    }

    return items;
  }

  /**
   * Parse GrantConnect HTML using cheerio
   */
  private parseGrantConnect(html: string): GrantConnectOpportunity[] {
    const opportunities: GrantConnectOpportunity[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      $('.search-result, article, li, .grant-item').each((_, element) => {
        const $element = $(element);
        
        // Extract title and link
        const titleEl = $element.find('a, h3 a, .title a').first();
        const title = titleEl.text().trim();
        const href = titleEl.attr('href');
        
        if (!title || !href) return;
        
        // Make URL absolute
        const absoluteHref = href.startsWith('http') ? href : `https://www.communitygrants.gov.au${href}`;
        
        // Extract status
        const status = $element.find('.status, .badge, .tag').text().trim() || undefined;
        
        // Extract close date
        const closeDateText = $element.find('*').toArray()
          .map(el => $(el).text())
          .join(' ')
          .match(/(close|closing|deadline).{0,20}(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}-\d{2}-\d{2})/i);
        const closeDate = closeDateText ? closeDateText[2] : undefined;
        
        // Extract funding amount
        const amountText = $element.find('*').toArray()
          .map(el => $(el).text())
          .join(' ')
          .match(/\$\s?([0-9][0-9,\.]+)/);
        const amount = amountText ? amountText[0] : undefined;
        
        opportunities.push({
          title,
          href: absoluteHref,
          status,
          closeDate,
          amount
        });
      });
      
    } catch (error) {
      console.error('Error parsing GrantConnect HTML with cheerio:', error);
    }

    return opportunities;
  }

  /**
   * Parse PIRSA programs HTML using cheerio
   */
  private parsePirsaPrograms(html: string): PirsaProgram[] {
    const programs: PirsaProgram[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      $('main a, .card, li, .program-item').each((_, element) => {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find('a, h3, .title').first();
        const title = titleEl.text().trim() || $element.text().trim();
        
        if (!title || title.length < 10) return;
        
        // Extract link
        let href = $element.attr('href') || $element.find('a').first().attr('href');
        if (href && !href.startsWith('http')) {
          href = new URL(href, 'https://pir.sa.gov.au').toString();
        }
        
        if (!href) return;
        
        // Extract summary
        const summary = $element.find('p, .description').text().trim() || undefined;
        
        programs.push({
          title,
          href,
          summary
        });
      });
      
    } catch (error) {
      console.error('Error parsing PIRSA programs HTML with cheerio:', error);
    }

    return programs;
  }

  /**
   * Check if content is related to agriculture
   */
  private isAgriculturalContent(title: string, description?: string): boolean {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    return this.AGRICULTURE_KEYWORDS.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  /**
   * Convert DAFF RSS item to SubsidyProgram
   */
  private convertDaffRssToProgram(item: DaffRssItem): InsertSubsidyProgram {
    const id = `au-daff-${this.generateIdFromUrl(item.link)}`;
    
    return {
      id,
      title: item.title,
      summary: item.description || 'Agricultural funding opportunity from DAFF',
      category: 'Commonwealth Agriculture Program',
      publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      url: item.link,
      fundingAmount: null,
      deadline: null,
      location: 'Australia',
      program: 'Department of Agriculture, Fisheries and Forestry',
      dataSource: 'au_daff_rss',
      sourceUrl: item.link,
      sourceAgency: 'Department of Agriculture, Fisheries and Forestry (DAFF)',
      country: 'AU',
      region: 'National',
      eligibilityTypes: ['primary_producer', 'research_org', 'industry_body'],
      fundingTypes: ['grant', 'rebate', 'program'],
      dedupeKey: this.generateDedupeKey(item.title, item.link, 'au_daff_rss'),
      mergedFromSources: ['au_daff_rss']
    };
  }

  /**
   * Convert NSW DPI RSS item to SubsidyProgram
   */
  private convertNswDpiRssToProgram(item: NswDpiRssItem): InsertSubsidyProgram {
    const id = `au-nsw-dpi-${this.generateIdFromUrl(item.link)}`;
    
    return {
      id,
      title: item.title,
      summary: item.description || 'NSW agricultural program or announcement',
      category: 'NSW State Agriculture Program',
      publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      url: item.link,
      fundingAmount: null,
      deadline: null,
      location: 'New South Wales, Australia',
      program: 'NSW Department of Primary Industries',
      dataSource: 'au_nsw_dpi_rss',
      sourceUrl: item.link,
      sourceAgency: 'NSW Department of Primary Industries (NSW DPI)',
      country: 'AU',
      region: 'New South Wales',
      eligibilityTypes: ['primary_producer', 'farm_business'],
      fundingTypes: ['grant', 'rebate', 'support'],
      dedupeKey: this.generateDedupeKey(item.title, item.link, 'au_nsw_dpi_rss'),
      mergedFromSources: ['au_nsw_dpi_rss']
    };
  }

  /**
   * Convert GrantConnect opportunity to SubsidyProgram
   */
  private convertGrantConnectToProgram(opportunity: GrantConnectOpportunity): InsertSubsidyProgram {
    const id = `au-grantconnect-${this.generateIdFromUrl(opportunity.href)}`;
    
    return {
      id,
      title: opportunity.title,
      summary: 'Commonwealth agricultural funding opportunity via GrantConnect',
      category: 'Commonwealth Grant Opportunity',
      publishedDate: new Date(),
      url: opportunity.href,
      fundingAmount: opportunity.amount || null,
      deadline: opportunity.closeDate ? new Date(opportunity.closeDate) : null,
      location: 'Australia',
      program: 'GrantConnect - Commonwealth Grants',
      dataSource: 'au_grantconnect',
      sourceUrl: opportunity.href,
      sourceAgency: 'Department of Agriculture, Fisheries and Forestry (DAFF)',
      country: 'AU',
      region: 'National',
      eligibilityTypes: ['primary_producer', 'research_org', 'industry_body', 'incorporated_association'],
      fundingTypes: ['grant', 'partnership'],
      dedupeKey: this.generateDedupeKey(opportunity.title, opportunity.href, 'au_grantconnect'),
      mergedFromSources: ['au_grantconnect']
    };
  }

  /**
   * Convert PIRSA program to SubsidyProgram
   */
  private convertPirsaToProgram(program: PirsaProgram): InsertSubsidyProgram {
    const id = `au-pirsa-${this.generateIdFromUrl(program.href)}`;
    
    return {
      id,
      title: program.title,
      summary: program.summary || 'South Australian agricultural funding program via PIRSA',
      category: 'SA State Agriculture Program',
      publishedDate: new Date(),
      url: program.href,
      fundingAmount: null,
      deadline: null,
      location: 'South Australia, Australia',
      program: 'Primary Industries and Regions SA',
      dataSource: 'au_pirsa',
      sourceUrl: program.href,
      sourceAgency: 'Primary Industries and Regions SA (PIRSA)',
      country: 'AU',
      region: 'South Australia',
      eligibilityTypes: ['primary_producer', 'farm_business'],
      fundingTypes: ['rebate', 'grant', 'recovery', 'infrastructure'],
      dedupeKey: this.generateDedupeKey(program.title, program.href, 'au_pirsa'),
      mergedFromSources: ['au_pirsa']
    };
  }

  /**
   * Utility functions
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retries: number = this.MAX_RETRIES,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries <= 0) {
        throw error;
      }

      // Determine if error is retryable
      const isRetryable = 
        error.name === 'TypeError' && error.message.includes('fetch') ||
        error.name === 'AbortError' ||
        (error.status && error.status >= 500);

      if (!isRetryable) {
        throw error;
      }

      console.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }

  private generateIdFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname.split('/').filter(Boolean).join('-').replace(/[^a-zA-Z0-9-]/g, '') || 'unknown';
    } catch {
      return url.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
    }
  }

  private generateDedupeKey(title: string, url: string, source: string): string {
    const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalizedUrl = url.toLowerCase().trim();
    const keyData = `${normalizedTitle}|${normalizedUrl}|${source}`;
    
    // Simple hash function for deduplication key
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Get domain-specific selectors for Australian sources
   */
  private getAustraliaSelectors(domain: string): string[] {
    const domainSelectors: { [key: string]: string[] } = {
      'agriculture.gov.au': ['article, .news-item', '.media-release', '.content-item'],
      'dairyaustralia.com.au': ['.news-item', 'article', '.funding-item'],
      'agriculture.vic.gov.au': ['.news-item', 'article', '.program-item'],
      'pir.sa.gov.au': ['.grant-item', 'article', '.news-item'],
      'recfit.com.au': ['.project-item', 'article', '.news-item'],
      'landcareaustralia.org.au': ['.project-item', 'article', '.funding-item'],
      'mla.com.au': ['.news-item', 'article', '.sustainability-item'],
      'arena.gov.au': ['.news-item', 'article', '.grant-opportunity'],
      'miragenews.com': ['article', '.news-item', '.content-item'],
      'argusmedia.com': ['article', '.story', '.news-item']
    };
    
    return domainSelectors[domain] || ['article', '.news-item', '.content-item'];
  }

  /**
   * Extract program details from Australian news element
   */
  private async extractAustraliaProgramFromElement($: any, element: any, sourceUrl: string, domain: string): Promise<InsertSubsidyProgram | null> {
    const $el = $(element);
    
    const title = $el.find('h1, h2, h3, .title').first().text().trim() || $el.text().trim().split('\n')[0];
    const summary = $el.find('.summary, .excerpt, p').first().text().trim() || $el.text().trim().substring(0, 200);
    const href = $el.find('a').first().attr('href') || '';
    const url = href.startsWith('http') ? href : new URL(href, sourceUrl).toString();
    
    if (!title || title.length < 10) return null;
    
    const fullText = `${title} ${summary}`.toLowerCase();
    const hasFunding = this.FUNDING_OPPORTUNITY_KEYWORDS.some(k => fullText.includes(k));
    const hasAgriculture = this.AGRICULTURE_KEYWORDS.some(k => fullText.includes(k));
    
    if (!hasFunding || !hasAgriculture) return null;
    
    const attribution = this.getAustraliaSourceAttribution(domain);
    
    return {
      id: `aus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      summary: summary.trim(),
      category: 'Agricultural Support',
      publishedDate: new Date(),
      url: url || sourceUrl,
      dataSource: attribution.dataSource,
      sourceUrl,
      sourceAgency: attribution.sourceAgency,
      country: 'Australia',
      region: 'Australia',
      fundingAmount: null,
      deadline: null,
      location: 'Australia',
      program: 'Australian Agricultural Program',
      opportunityNumber: null,
      awardNumber: null,
      eligibilityTypes: ['farmer'],
      fundingTypes: ['grant'],
      isHighPriority: null,
      alertReason: null,
      sourceLastModified: null,
      sourceEtag: null,
      mergedFromSources: [attribution.dataSource],
      conflictResolution: null,
      dedupeKey: this.generateAustraliaDedupeKey(title, url || sourceUrl, attribution.dataSource)
    };
  }

  /**
   * Cross-source deduplication for Australian programs
   */
  private deduplicateAustraliaPrograms(programs: InsertSubsidyProgram[]): InsertSubsidyProgram[] {
    const dedupeMap = new Map<string, InsertSubsidyProgram>();
    
    for (const program of programs) {
      const existing = dedupeMap.get(program.dedupeKey);
      if (!existing) {
        dedupeMap.set(program.dedupeKey, program);
      } else {
        const merged = this.mergeAustraliaPrograms(existing, program);
        dedupeMap.set(program.dedupeKey, merged);
      }
    }
    
    return Array.from(dedupeMap.values());
  }

  /**
   * Validate extracted Australian program
   */
  private isValidAustraliaProgram(program: InsertSubsidyProgram): boolean {
    return program.title.length >= 10 &&
           program.summary.length >= 20 &&
           program.url.length > 0;
  }

  private getAustraliaSourceAttribution(domain: string): { dataSource: string; sourceAgency: string } {
    const attributions: { [key: string]: { dataSource: string; sourceAgency: string } } = {
      'agriculture.gov.au': { dataSource: 'australia_daff', sourceAgency: 'Department of Agriculture, Fisheries and Forestry' },
      'dairyaustralia.com.au': { dataSource: 'australia_dairy', sourceAgency: 'Dairy Australia' },
      'agriculture.vic.gov.au': { dataSource: 'australia_vic', sourceAgency: 'Agriculture Victoria' },
      'pir.sa.gov.au': { dataSource: 'australia_pirsa', sourceAgency: 'PIRSA South Australia' },
      'recfit.com.au': { dataSource: 'australia_recfit', sourceAgency: 'ReCFIT Tasmania' },
      'landcareaustralia.org.au': { dataSource: 'australia_landcare', sourceAgency: 'Landcare Australia' },
      'mla.com.au': { dataSource: 'australia_mla', sourceAgency: 'Meat & Livestock Australia' },
      'arena.gov.au': { dataSource: 'australia_arena', sourceAgency: 'Australian Renewable Energy Agency' },
      'miragenews.com': { dataSource: 'australia_mirage', sourceAgency: 'Mirage News' },
      'argusmedia.com': { dataSource: 'australia_argus', sourceAgency: 'Argus Media' }
    };
    
    return attributions[domain] || { dataSource: 'australia_news', sourceAgency: 'Australian Agricultural News' };
  }

  private generateAustraliaDedupeKey(title: string, url: string, source: string): string {
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const domain = new URL(url).hostname;
    return `${normalizedTitle}-${domain}-${source}`.replace(/\s+/g, '-');
  }

  private mergeAustraliaPrograms(existing: InsertSubsidyProgram, newProgram: InsertSubsidyProgram): InsertSubsidyProgram {
    return {
      ...existing,
      summary: newProgram.summary.length > existing.summary.length ? newProgram.summary : existing.summary,
      mergedFromSources: Array.from(new Set([...(existing.mergedFromSources || []), ...(newProgram.mergedFromSources || [])])),
      sourceLastModified: new Date()
    };
  }
}

// Export singleton instance
export const australiaService = new AustraliaService();