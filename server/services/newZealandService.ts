import { z } from 'zod';
import * as cheerio from 'cheerio';
import { storage } from '../storage.js';
import type { InsertSubsidyProgram, SubsidyProgram } from '@shared/schema';

// New Zealand-specific interfaces
interface MpiRssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

interface BeehiveRssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

interface GetsTender {
  rfxId: string;
  title: string;
  organisation: string;
  closeDate?: string;
  tenderType?: string;
  link: string;
}

interface MpiFundingPage {
  title: string;
  href: string;
  status?: string;
  funding?: string;
  deadline?: string;
}

export class NewZealandService {
  private readonly USER_AGENT = 'SubsidyCompanion/1.0 (agricultural-funding-monitor)';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  // New Zealand agricultural funding keywords
  private readonly AGRICULTURE_KEYWORDS = [
    'farm', 'farming', 'agriculture', 'agricultural', 'dairy', 'livestock',
    'cattle', 'sheep', 'goat', 'deer', 'equine', 'pig', 'poultry',
    'PSGF', 'Primary Sector Growth Fund', 'SFF', 'Sustainable Food and Fibre',
    'catchment', 'water', 'freshwater', 'emissions', 'methane', 'nitrate',
    'rural', 'producer', 'co-investment', 'contestable', 'wellbeing'
  ];

  /**
   * Initialize the service (currently no setup required)
   */
  async initialize(): Promise<boolean> {
    console.log('New Zealand service initialized');
    return true;
  }

  /**
   * Sync all New Zealand agricultural funding sources
   */
  async syncAllSources(maxPages?: number): Promise<{ mpiRss: number; beehiveRss: number; getsExamples: number; mpiFunding: number }> {
    console.log('Starting comprehensive New Zealand sync...');

    const [mpiRss, beehiveRss, getsExamples, mpiFunding] = await Promise.all([
      this.syncMpiRss(),
      this.syncBeehiveRss(),
      this.syncGetsExamples(),
      this.syncMpiFundingPages()
    ]);

    console.log(`New Zealand sync completed: MPI RSS ${mpiRss}, Beehive RSS ${beehiveRss}, GETS ${getsExamples}, MPI Pages ${mpiFunding}`);

    return {
      mpiRss,
      beehiveRss,
      getsExamples,
      mpiFunding
    };
  }

  /**
   * Sync MPI RSS feed for agricultural funding news
   */
  async syncMpiRss(): Promise<number> {
    console.log('Syncing MPI RSS feed...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.mpi.govt.nz/news/media-releases/rss.xml', {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`MPI RSS fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const xmlText = await response.text();
      const items = this.parseMpiRss(xmlText);
      
      let processed = 0;
      for (const item of items) {
        if (this.isAgriculturalContent(item.title, item.description)) {
          const program = this.convertMpiRssToProgram(item);
          
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

      console.log(`MPI RSS sync completed: ${processed} agricultural items processed`);
      return processed;

    } catch (error) {
      console.error('Error syncing MPI RSS:', error);
      return 0;
    }
  }

  /**
   * Sync Beehive RSS feed for government announcements
   */
  async syncBeehiveRss(): Promise<number> {
    console.log('Syncing Beehive RSS feed...');

    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch('https://www.beehive.govt.nz/rss.xml', {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
        });

        if (!res.ok) {
          throw new Error(`Beehive RSS fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const xmlText = await response.text();
      const items = this.parseBeehiveRss(xmlText);
      
      let processed = 0;
      for (const item of items) {
        if (this.isAgriculturalContent(item.title, item.description)) {
          const program = this.convertBeehiveRssToProgram(item);
          
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

      console.log(`Beehive RSS sync completed: ${processed} agricultural items processed`);
      return processed;

    } catch (error) {
      console.error('Error syncing Beehive RSS:', error);
      return 0;
    }
  }

  /**
   * Sync GETS tender examples for procurement opportunities
   */
  async syncGetsExamples(): Promise<number> {
    console.log('Syncing GETS tender examples...');

    const exampleIds = ['31880904', '25528669']; // Rural Wellbeing Fund and SFF Futures audit examples
    let processed = 0;

    for (const id of exampleIds) {
      try {
        const response = await this.retryWithBackoff(async () => {
          const res = await fetch(`https://www.gets.govt.nz/MPI/ExternalTenderDetails.htm?id=${id}`, {
            headers: {
              'User-Agent': this.USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
          });

          if (!res.ok) {
            throw new Error(`GETS fetch error: ${res.status} ${res.statusText}`);
          }

          return res;
        });

        const html = await response.text();
        const tender = this.parseGetsTender(html, id);
        
        if (tender && this.isAgriculturalContent(tender.title)) {
          const program = this.convertGetsTenderToProgram(tender);
          
          // Check for existing program
          const existing = await storage.getSubsidyProgramByDedupeKey(program.dedupeKey);
          if (existing) {
            await storage.updateSubsidyProgram(existing.id, program);
          } else {
            await storage.createSubsidyProgram(program);
          }
          processed++;
        }

      } catch (error) {
        console.error(`Error syncing GETS tender ${id}:`, error);
      }
    }

    console.log(`GETS examples sync completed: ${processed} tenders processed`);
    return processed;
  }

  /**
   * Sync MPI funding pages for current opportunities
   */
  async syncMpiFundingPages(): Promise<number> {
    console.log('Syncing MPI funding pages...');

    const fundingUrls = [
      'https://www.mpi.govt.nz/funding-rural-support/',
      'https://www.mpi.govt.nz/funding-rural-support/farming-funds-and-programmes/',
      'https://www.mpi.govt.nz/funding-rural-support/sustainable-food-fibre-futures/'
    ];

    let processed = 0;

    for (const url of fundingUrls) {
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
            throw new Error(`MPI page fetch error: ${res.status} ${res.statusText}`);
          }

          return res;
        });

        const html = await response.text();
        const opportunities = this.parseMpiFundingPage(html, url);
        
        for (const opportunity of opportunities) {
          if (this.isAgriculturalContent(opportunity.title)) {
            const program = this.convertMpiFundingToProgram(opportunity);
            
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

      } catch (error) {
        console.error(`Error syncing MPI page ${url}:`, error);
      }
    }

    console.log(`MPI funding pages sync completed: ${processed} opportunities processed`);
    return processed;
  }

  /**
   * Parse MPI RSS XML using cheerio
   */
  private parseMpiRss(xml: string): MpiRssItem[] {
    const items: MpiRssItem[] = [];
    
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
      console.error('Error parsing MPI RSS with cheerio:', error);
    }

    return items;
  }

  /**
   * Parse Beehive RSS XML using cheerio
   */
  private parseBeehiveRss(xml: string): BeehiveRssItem[] {
    const items: BeehiveRssItem[] = [];
    
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
      console.error('Error parsing Beehive RSS with cheerio:', error);
    }

    return items;
  }

  /**
   * Parse GETS tender page using cheerio
   */
  private parseGetsTender(html: string, id: string): GetsTender | null {
    try {
      const $ = cheerio.load(html);
      
      const title = $('#main h1, .heading-title').first().text().trim() || 
                   $('h1').first().text().trim();
      
      if (!title) return null;
      
      // Extract tender details from table rows
      const getTableValue = (label: string): string => {
        const row = $(`td:contains('${label}')`).parent();
        return row.find('td').last().text().trim();
      };
      
      const closeDate = getTableValue('Close Date');
      const organisation = getTableValue('Organisation');
      const tenderType = getTableValue('Tender Type');
      
      return {
        rfxId: id,
        title,
        organisation: organisation || 'Ministry for Primary Industries',
        closeDate: closeDate || undefined,
        tenderType: tenderType || undefined,
        link: `https://www.gets.govt.nz/MPI/ExternalTenderDetails.htm?id=${id}`
      };
      
    } catch (error) {
      console.error('Error parsing GETS tender HTML with cheerio:', error);
      return null;
    }
  }

  /**
   * Parse MPI funding page using cheerio
   */
  private parseMpiFundingPage(html: string, baseUrl: string): MpiFundingPage[] {
    const opportunities: MpiFundingPage[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for funding opportunities, cards, links, and articles
      $('a, article, .card, .funding-item, .programme').each((_, element) => {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find('h1, h2, h3, h4, .title').first();
        const title = titleEl.text().trim() || $element.text().trim();
        
        if (!title || title.length < 10) return;
        
        // Extract link
        let href = $element.attr('href') || $element.find('a').first().attr('href');
        if (href && !href.startsWith('http')) {
          href = new URL(href, baseUrl).toString();
        }
        
        if (!href) return;
        
        // Extract status indicators
        const statusText = $element.find('*').toArray()
          .map(el => $(el).text().toLowerCase())
          .join(' ');
        
        const status = statusText.includes('open') || statusText.includes('applications open') ? 'open' :
                      statusText.includes('closed') || statusText.includes('applications closed') ? 'closed' :
                      undefined;
        
        // Extract funding amount
        const fundingMatch = statusText.match(/\$\s?([0-9][0-9,\.]+)/);
        const funding = fundingMatch ? fundingMatch[0] : undefined;
        
        // Extract deadline
        const deadlineMatch = statusText.match(/(\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})/);
        const deadline = deadlineMatch ? deadlineMatch[0] : undefined;
        
        opportunities.push({
          title,
          href,
          status,
          funding,
          deadline
        });
      });
      
    } catch (error) {
      console.error('Error parsing MPI funding page with cheerio:', error);
    }

    return opportunities;
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
   * Convert MPI RSS item to SubsidyProgram
   */
  private convertMpiRssToProgram(item: MpiRssItem): InsertSubsidyProgram {
    const id = `nz-mpi-${this.generateIdFromUrl(item.link)}`;
    
    return {
      id,
      title: item.title,
      summary: item.description || 'Agricultural funding opportunity from MPI',
      category: 'Primary Sector Funding',
      publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      url: item.link,
      fundingAmount: null,
      deadline: null,
      location: 'New Zealand',
      program: 'Ministry for Primary Industries',
      dataSource: 'nz_mpi_rss',
      sourceUrl: item.link,
      sourceAgency: 'Ministry for Primary Industries (MPI)',
      country: 'NZ',
      region: 'National',
      eligibilityTypes: ['farm', 'producer', 'organization'],
      fundingTypes: ['grant', 'partnership', 'co-investment'],
      dedupeKey: this.generateDedupeKey(item.title, item.link, 'nz_mpi_rss'),
      mergedFromSources: ['nz_mpi_rss']
    };
  }

  /**
   * Convert Beehive RSS item to SubsidyProgram
   */
  private convertBeehiveRssToProgram(item: BeehiveRssItem): InsertSubsidyProgram {
    const id = `nz-beehive-${this.generateIdFromUrl(item.link)}`;
    
    return {
      id,
      title: item.title,
      summary: item.description || 'Government announcement related to primary sector',
      category: 'Government Announcement',
      publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      url: item.link,
      fundingAmount: null,
      deadline: null,
      location: 'New Zealand',
      program: 'Government Announcements',
      dataSource: 'nz_beehive_rss',
      sourceUrl: item.link,
      sourceAgency: 'New Zealand Government',
      country: 'NZ',
      region: 'National',
      eligibilityTypes: ['farm', 'producer', 'organization', 'community'],
      fundingTypes: ['announcement', 'policy'],
      dedupeKey: this.generateDedupeKey(item.title, item.link, 'nz_beehive_rss'),
      mergedFromSources: ['nz_beehive_rss']
    };
  }

  /**
   * Convert GETS tender to SubsidyProgram
   */
  private convertGetsTenderToProgram(tender: GetsTender): InsertSubsidyProgram {
    const id = `nz-gets-${tender.rfxId}`;
    
    return {
      id,
      title: tender.title,
      summary: `${tender.tenderType || 'Procurement opportunity'} from ${tender.organisation}`,
      category: 'Procurement',
      publishedDate: new Date(),
      url: tender.link,
      fundingAmount: null,
      deadline: tender.closeDate ? new Date(tender.closeDate) : null,
      location: 'New Zealand',
      program: 'Government Electronic Tenders Service',
      dataSource: 'nz_gets',
      sourceUrl: tender.link,
      sourceAgency: tender.organisation,
      country: 'NZ',
      region: 'National',
      opportunityNumber: tender.rfxId,
      eligibilityTypes: ['organization', 'company'],
      fundingTypes: ['procurement', 'contract'],
      dedupeKey: this.generateDedupeKey(tender.title, tender.link, 'nz_gets'),
      mergedFromSources: ['nz_gets']
    };
  }

  /**
   * Convert MPI funding page item to SubsidyProgram
   */
  private convertMpiFundingToProgram(item: MpiFundingPage): InsertSubsidyProgram {
    const id = `nz-mpi-funding-${this.generateIdFromUrl(item.href)}`;
    
    return {
      id,
      title: item.title,
      summary: 'Agricultural funding opportunity from MPI funding pages',
      category: 'Primary Sector Funding',
      publishedDate: new Date(),
      url: item.href,
      fundingAmount: item.funding || null,
      deadline: item.deadline ? new Date(item.deadline) : null,
      location: 'New Zealand',
      program: 'MPI Funding and Rural Support',
      dataSource: 'nz_mpi_pages',
      sourceUrl: item.href,
      sourceAgency: 'Ministry for Primary Industries (MPI)',
      country: 'NZ',
      region: 'National',
      eligibilityTypes: ['farm', 'producer', 'organization', 'community'],
      fundingTypes: ['grant', 'partnership', 'support'],
      dedupeKey: this.generateDedupeKey(item.title, item.href, 'nz_mpi_pages'),
      mergedFromSources: ['nz_mpi_pages']
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
}

// Export singleton instance
export const newZealandService = new NewZealandService();