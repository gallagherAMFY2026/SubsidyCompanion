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

  // New Zealand agricultural funding news page URLs (user-provided list)
  private readonly NZ_NEWS_URLS = [
    // Official Government and Program Sites (Priority)
    'https://www.mpi.govt.nz/news-and-resources/media-releases/',
    'https://www.mpi.govt.nz/funding-and-programmes/',
    'https://www.mpi.govt.nz/funding-and-programmes/sustainable-food-and-fibre-futures/',
    'https://www.doc.govt.nz/about-us/our-role/funding/',
    'https://www.doc.govt.nz/news/',
    
    // Government Press Releases and Policy Updates
    'https://www.beehive.govt.nz/release/agriculture',
    'https://www.beehive.govt.nz/release/primary-industries',
    'https://www.beehive.govt.nz/release/environment',
    
    // Grant Announcements and Industry News
    'https://ecosmart.nz/news/',
    'https://ecosmart.nz/grants/',
    'https://www.rfsi.nz/news/',
    'https://www.rfsi.nz/funding/',
    
    // Sustainable Farming and Land Management
    'https://www.mpi.govt.nz/funding-and-programmes/sustainable-food-and-fibre-futures/funding-rounds/',
    'https://www.doc.govt.nz/our-work/funding/',
    
    // Additional Policy Commentary and Reviews
    'https://www.developmentaid.org/news/donors/new-zealand/',
    'https://news.mongabay.com/series/new-zealand/'
  ];

  // Enhanced funding opportunity keywords (primary filter)
  private readonly FUNDING_OPPORTUNITY_KEYWORDS = [
    'grant', 'grants', 'funding', 'fund', 'subsidy', 'subsidies',
    'application', 'applications', 'apply', 'deadline', 'closes',
    'intake', 'round', 'opportunity', 'opportunities', 'scheme',
    'support', 'assistance', 'investment', 'co-investment',
    'contestable', 'programme', 'program', 'initiative',
    'eligibility', 'eligible', 'criteria', 'requirements'
  ];
  
  // Agricultural sector keywords (secondary filter)
  private readonly AGRICULTURE_KEYWORDS = [
    'farm', 'farming', 'agriculture', 'agricultural', 'dairy', 'livestock',
    'cattle', 'sheep', 'goat', 'deer', 'equine', 'pig', 'poultry',
    'PSGF', 'Primary Sector Growth Fund', 'SFF', 'Sustainable Food and Fibre',
    'catchment', 'water', 'freshwater', 'emissions', 'methane', 'nitrate',
    'rural', 'producer', 'sustainable', 'conservation', 'environment',
    'land management', 'soil health', 'biodiversity', 'climate'
  ];

  /**
   * Initialize the service (currently no setup required)
   */
  async initialize(): Promise<boolean> {
    console.log('New Zealand service initialized');
    return true;
  }

  /**
   * Sync all New Zealand agricultural funding sources via news page scraping
   */
  async syncAllSources(maxPages?: number): Promise<{ newsPages: number; getsExamples: number; mpiFunding: number }> {
    console.log('Starting comprehensive New Zealand news page sync...');

    const [newsPages, getsExamples, mpiFunding] = await Promise.all([
      this.syncNewZealandNewsPages(),
      this.syncGetsExamples(),
      this.syncMpiFundingPages()
    ]);

    console.log(`New Zealand sync completed: News Pages ${newsPages}, GETS ${getsExamples}, MPI Pages ${mpiFunding}`);

    return {
      newsPages,
      getsExamples,
      mpiFunding
    };
  }

  /**
   * Sync New Zealand news pages for agricultural funding programs
   */
  async syncNewZealandNewsPages(): Promise<number> {
    console.log('Syncing New Zealand agricultural news pages...');
    
    let totalPrograms = 0;
    const allPrograms: InsertSubsidyProgram[] = [];
    
    for (const url of this.NZ_NEWS_URLS) {
      try {
        console.log(`Scraping: ${url}`);
        const programs = await this.scrapeNewsPage(url);
        allPrograms.push(...programs);
        console.log(`Found ${programs.length} programs from ${url}`);
      } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        // Continue with other URLs even if one fails
      }
    }
    
    // Apply cross-source deduplication
    const deduplicatedPrograms = this.deduplicatePrograms(allPrograms);
    console.log(`Deduplicated ${allPrograms.length} programs to ${deduplicatedPrograms.length}`);
    
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
        console.error('Error storing program:', error);
      }
    }
    
    console.log(`New Zealand news page sync completed: ${totalPrograms} agricultural programs processed`);
    return totalPrograms;
  }

  /**
   * Scrape a single news page for agricultural funding programs
   */
  private async scrapeNewsPage(url: string): Promise<InsertSubsidyProgram[]> {
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
          throw new Error(`News page fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      const domain = new URL(url).hostname;
      const selectors = this.getNZDomainSpecificSelectors(domain);
      
      // Extract program items using domain-specific selectors
      for (const selector of selectors) {
        for (let i = 0; i < $(selector).length; i++) {
          try {
            const element = $(selector)[i];
            const program = await this.extractNZProgramFromElement($, element, url, domain);
            if (program && this.isValidNZProgram(program)) {
              programs.push(program);
            }
          } catch (error) {
            console.warn('Error extracting program from element:', error);
          }
        }
      }
      
      return programs;
      
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return [];
    }
  }

  /**
   * Get domain-specific selectors for New Zealand sites
   */
  private getNZDomainSpecificSelectors(domain: string): string[] {
    const domainSelectors: { [key: string]: string[] } = {
      // MPI sites
      'mpi.govt.nz': [
        '.news-item, .media-release',
        '.funding-item, .programme-item',
        'article, .content-item',
        '.views-row .field-content',
        '.page-content .item'
      ],
      
      // Beehive government releases
      'beehive.govt.nz': [
        '.release-item, .media-release',
        'article, .content-wrap',
        '.views-row, .release-content',
        '.page-item .field-content'
      ],
      
      // Regional development
      'growregions.govt.nz': [
        '.news-item, .funding-item',
        'article, .post',
        '.content-item, .programme-item'
      ],
      
      // Media sources
      'stuff.co.nz': [
        'article, .story-item',
        '.farming-news .item',
        '.business-farming .content'
      ],
      
      'nzherald.co.nz': [
        'article, .story',
        '.rural-news .item',
        '.business .content-item'
      ],
      
      // Innovation and research
      'callaghaninnovation.govt.nz': [
        '.news-item, .funding-opportunity',
        'article, .content-item',
        '.programme-item'
      ],
      
      'mbie.govt.nz': [
        '.funding-item, .opportunity-item',
        'article, .content-wrap',
        '.programme-details .item'
      ],
      
      // Environmental agencies  
      'doc.govt.nz': [
        '.funding-programme, .grant-item',
        'article, .content-item',
        '.conservation-funding .item'
      ],
      
      'mfe.govt.nz': [
        '.funding-opportunity, .grant-item',
        'article, .policy-item',
        '.environmental-funding .item'
      ]
    };
    
    return domainSelectors[domain] || [
      'article, .post, .entry',
      '.news-item, .content-item',
      '.funding-item, .opportunity-item',
      '.views-row, .list-group-item'
    ];
  }

  /**
   * Extract program details from HTML element
   */
  private async extractNZProgramFromElement($: any, element: any, sourceUrl: string, domain: string): Promise<InsertSubsidyProgram | null> {
    const $el = $(element);
    
    // Extract basic information
    const title = this.extractNZTitle($el);
    const summary = this.extractNZSummary($el);
    const url = this.extractNZUrl($el, sourceUrl);
    
    if (!title || title.length < 10) {
      return null;
    }
    
    // Primary filter: Must contain funding opportunity indicators
    const fullText = `${title} ${summary}`.toLowerCase();
    const hasFundingKeywords = this.FUNDING_OPPORTUNITY_KEYWORDS.some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    
    // Secondary filter: Must be agriculture-related
    const hasAgricultureKeywords = this.AGRICULTURE_KEYWORDS.some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    
    if (!hasFundingKeywords || !hasAgricultureKeywords) {
      return null;
    }
    
    // Fetch detail page for enhanced program information
    const detailData = await this.fetchDetailPage(url);
    
    const attribution = this.getNZSourceAttribution(domain);
    const publishedDate = this.extractNZDate($el) || new Date();
    
    // Combine listing and detail data for enhanced extraction
    const combinedText = `${fullText} ${detailData}`.toLowerCase();
    
    return {
      id: this.generateNZProgramId(title, url),
      title: title.trim(),
      summary: detailData ? this.extractEnhancedSummary(detailData) || summary.trim() : summary.trim(),
      category: this.extractNZProgramType(combinedText),
      publishedDate,
      url,
      dataSource: attribution.dataSource,
      sourceUrl,
      sourceAgency: attribution.sourceAgency,
      country: 'New Zealand',
      region: this.extractNZLocation(combinedText),
      fundingAmount: this.extractNZFundingAmount(combinedText),
      deadline: this.extractNZDeadline(combinedText),
      location: this.extractNZLocation(combinedText),
      program: this.extractNZProgramType(combinedText),
      opportunityNumber: this.extractOpportunityNumber(combinedText),
      awardNumber: null,
      eligibilityTypes: this.extractEligibilityTypes(combinedText),
      fundingTypes: this.extractFundingTypes(combinedText),
      isHighPriority: this.detectNZPriority(combinedText),
      alertReason: this.detectAlertReason(combinedText),
      sourceLastModified: null,
      sourceEtag: null,
      mergedFromSources: [attribution.dataSource],
      conflictResolution: null,
      dedupeKey: this.generateNZDedupeKey(title, url, attribution.dataSource)
    };
  }

  /**
   * Cross-source deduplication for New Zealand programs
   */
  private deduplicatePrograms(programs: InsertSubsidyProgram[]): InsertSubsidyProgram[] {
    const dedupeMap = new Map<string, InsertSubsidyProgram>();
    
    for (const program of programs) {
      const existing = dedupeMap.get(program.dedupeKey);
      
      if (!existing) {
        dedupeMap.set(program.dedupeKey, program);
      } else {
        // Merge sources and keep the program with more information
        const merged = this.mergeNZPrograms(existing, program);
        dedupeMap.set(program.dedupeKey, merged);
      }
    }
    
    return Array.from(dedupeMap.values());
  }

  /**
   * Fetch detail page content for enhanced program information
   */
  private async fetchDetailPage(url: string): Promise<string> {
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
          throw new Error(`Detail page fetch error: ${res.status} ${res.statusText}`);
        }

        return res;
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract main content from detail page
      const content = $('.content, .article-content, .post-content, .page-content, main, article')
        .first()
        .text()
        .trim();
        
      return content.substring(0, 2000); // Limit for processing efficiency
      
    } catch (error) {
      console.warn(`Error fetching detail page ${url}:`, error);
      return ''; // Return empty string if detail page fails
    }
  }

  /**
   * Extract enhanced summary from detail page content
   */
  private extractEnhancedSummary(detailContent: string): string | null {
    if (!detailContent) return null;
    
    // Extract first few sentences that contain funding-related terms
    const sentences = detailContent.split(/[.!?]+/).slice(0, 5);
    const relevantSentences = sentences.filter(sentence => 
      this.FUNDING_OPPORTUNITY_KEYWORDS.some(keyword => 
        sentence.toLowerCase().includes(keyword)
      )
    );
    
    return relevantSentences.length > 0 
      ? relevantSentences.join('. ').trim().substring(0, 300)
      : null;
  }

  /**
   * Extract opportunity number from content
   */
  private extractOpportunityNumber(content: string): string | null {
    const patterns = [
      /opportunity[\s#]+([A-Z0-9-]{5,15})/i,
      /reference[\s#:]+([A-Z0-9-]{5,15})/i,
      /grant[\s#:]+([A-Z0-9-]{5,15})/i,
      /SFF[\s-]*([0-9]{4,6})/i,
      /PSGF[\s-]*([0-9]{4,6})/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Extract eligibility types from content
   */
  private extractEligibilityTypes(content: string): string[] {
    const eligibilityMap = {
      'farm': ['farm', 'farmer', 'farming'],
      'producer': ['producer', 'grower', 'livestock owner'],
      'organization': ['organization', 'organisation', 'cooperative', 'association'],
      'rural': ['rural', 'rural community'],
      'iwi': ['iwi', 'māori', 'maori', 'indigenous'],
      'research': ['research', 'university', 'institute'],
      'community': ['community', 'group', 'collective']
    };
    
    const found: string[] = [];
    for (const [type, keywords] of Object.entries(eligibilityMap)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        found.push(type);
      }
    }
    
    return found.length > 0 ? found : ['farm', 'producer', 'organization'];
  }

  /**
   * Extract funding types from content
   */
  private extractFundingTypes(content: string): string[] {
    const fundingMap = {
      'grant': ['grant', 'grants'],
      'co-investment': ['co-investment', 'co-invest', 'matching fund'],
      'loan': ['loan', 'lending', 'finance'],
      'subsidy': ['subsidy', 'subsidies'],
      'support': ['support', 'assistance'],
      'partnership': ['partnership', 'collaboration'],
      'innovation': ['innovation', 'research', 'development']
    };
    
    const found: string[] = [];
    for (const [type, keywords] of Object.entries(fundingMap)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        found.push(type);
      }
    }
    
    return found.length > 0 ? found : ['grant', 'support'];
  }

  /**
   * Detect high priority programs
   */
  private detectNZPriority(content: string): string | null {
    const priorityTerms = [
      'urgent', 'immediate', 'priority', 'limited time', 
      'closing soon', 'deadline approaching', 'last call',
      'high priority', 'critical', 'essential'
    ];
    
    const foundTerm = priorityTerms.find(term => 
      content.toLowerCase().includes(term)
    );
    
    return foundTerm ? 'true' : null;
  }

  /**
   * Detect alert reason for high priority programs
   */
  private detectAlertReason(content: string): string | null {
    if (content.toLowerCase().includes('deadline') && content.toLowerCase().includes('approach')) {
      return 'Deadline approaching';
    }
    if (content.toLowerCase().includes('limited time')) {
      return 'Limited time offer';
    }
    if (content.toLowerCase().includes('last call')) {
      return 'Final call for applications';
    }
    return null;
  }

  /**
   * Extract title from HTML element
   */
  private extractNZTitle($el: any): string {
    return $el.find('h1, h2, h3, .title, .headline, .entry-title').first().text().trim() ||
           $el.find('a').first().text().trim() ||
           $el.text().split('\n')[0].trim();
  }

  /**
   * Extract summary from HTML element
   */
  private extractNZSummary($el: any): string {
    return $el.find('.summary, .description, .excerpt, .intro, p').first().text().trim() ||
           $el.find('.content').first().text().trim().substring(0, 300) ||
           $el.text().trim().substring(0, 300);
  }

  /**
   * Extract URL from HTML element
   */
  private extractNZUrl($el: any, baseUrl: string): string {
    const href = $el.find('a').first().attr('href') || $el.attr('href');
    if (!href) return baseUrl;
    
    return href.startsWith('http') ? href : new URL(href, baseUrl).toString();
  }

  /**
   * Extract publication date from HTML element
   */
  private extractNZDate($el: any): Date | null {
    const dateText = $el.find('.date, .published, .datetime, time').first().text().trim() ||
                     $el.find('[datetime]').first().attr('datetime');
    
    if (!dateText) return null;
    
    const date = new Date(dateText);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Extract funding amount from content
   */
  private extractNZFundingAmount(content: string): string | null {
    const patterns = [
      /NZ?\$([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|thousand|k))?)/i,
      /(\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|m|thousand|k))?)/i,
      /([\d,]+(?:\.\d{2})?\s*(?:million|thousand)\s*dollars?)/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1] || match[0];
    }
    return null;
  }

  /**
   * Extract deadline from content
   */
  private extractNZDeadline(content: string): Date | null {
    const patterns = [
      /deadline[:\s]+([^\n\.]{1,50}(?:\d{1,2}[\s,]+\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}))/i,
      /applications?\s+(?:close|due|by)[:\s]+([^\n\.]{1,50}(?:\d{1,2}[\s,]+\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}))/i,
      /by\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) return date;
      }
    }
    return null;
  }

  /**
   * Extract location/region from content
   */
  private extractNZLocation(content: string): string | null {
    const nzRegions = [
      'Auckland', 'Bay of Plenty', 'Canterbury', 'Gisborne', 'Hawke\'s Bay',
      'Manawatu-Wanganui', 'Marlborough', 'Nelson', 'Northland', 'Otago',
      'Southland', 'Taranaki', 'Tasman', 'Waikato', 'Wellington', 'West Coast'
    ];
    
    for (const region of nzRegions) {
      if (content.includes(region)) return region;
    }
    return null;
  }

  /**
   * Extract program type from content
   */
  private extractNZProgramType(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('sustainable food and fibre') || lowerContent.includes('sff')) return 'Sustainable Food and Fibre';
    if (lowerContent.includes('primary sector growth fund') || lowerContent.includes('psgf')) return 'Primary Sector Growth Fund';
    if (lowerContent.includes('rural wellbeing')) return 'Rural Wellbeing';
    if (lowerContent.includes('catchment') || lowerContent.includes('freshwater')) return 'Freshwater & Environment';
    if (lowerContent.includes('innovation') || lowerContent.includes('research')) return 'Research & Innovation';
    
    return 'Program';
  }


  /**
   * Get source attribution for New Zealand domains
   */
  private getNZSourceAttribution(domain: string): { dataSource: string; sourceAgency: string } {
    const attributions: { [key: string]: { dataSource: string; sourceAgency: string } } = {
      'mpi.govt.nz': {
        dataSource: 'nz_mpi_news',
        sourceAgency: 'Ministry for Primary Industries'
      },
      'beehive.govt.nz': {
        dataSource: 'nz_beehive_news', 
        sourceAgency: 'New Zealand Government'
      },
      'growregions.govt.nz': {
        dataSource: 'nz_regional_development',
        sourceAgency: 'Provincial Growth Fund'
      },
      'stuff.co.nz': {
        dataSource: 'nz_stuff_farming',
        sourceAgency: 'Stuff.co.nz'
      },
      'nzherald.co.nz': {
        dataSource: 'nz_herald_rural',
        sourceAgency: 'New Zealand Herald'
      },
      'callaghaninnovation.govt.nz': {
        dataSource: 'nz_callaghan_innovation',
        sourceAgency: 'Callaghan Innovation'
      },
      'mbie.govt.nz': {
        dataSource: 'nz_mbie_funding',
        sourceAgency: 'Ministry of Business, Innovation and Employment'
      },
      'doc.govt.nz': {
        dataSource: 'nz_doc_funding',
        sourceAgency: 'Department of Conservation'
      },
      'mfe.govt.nz': {
        dataSource: 'nz_mfe_funding',
        sourceAgency: 'Ministry for the Environment'
      }
    };
    
    return attributions[domain] || {
      dataSource: 'nz_agricultural_news',
      sourceAgency: 'New Zealand Agricultural Source'
    };
  }

  /**
   * Generate program ID
   */
  private generateNZProgramId(title: string, url: string): string {
    const hash = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const urlHash = Buffer.from(url).toString('base64').substring(0, 10);
    return `nz-${hash}-${urlHash}`;
  }

  /**
   * Generate deduplication key
   */
  private generateNZDedupeKey(title: string, url: string, source: string): string {
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const domain = new URL(url).hostname;
    return `${normalizedTitle}-${domain}-${source}`.replace(/\s+/g, '-');
  }

  /**
   * Merge two programs during deduplication
   */
  private mergeNZPrograms(existing: InsertSubsidyProgram, newProgram: InsertSubsidyProgram): InsertSubsidyProgram {
    return {
      ...existing,
      summary: newProgram.summary.length > existing.summary.length ? newProgram.summary : existing.summary,
      fundingAmount: newProgram.fundingAmount || existing.fundingAmount,
      deadline: newProgram.deadline || existing.deadline,
      location: newProgram.location || existing.location,
      mergedFromSources: Array.from(new Set([...(existing.mergedFromSources || []), ...(newProgram.mergedFromSources || [])])),
      sourceLastModified: new Date()
    };
  }

  /**
   * Validate extracted program
   */
  private isValidNZProgram(program: InsertSubsidyProgram): boolean {
    return program.title.length >= 10 &&
           program.summary.length >= 20 &&
           program.url.length > 0 &&
           (!!program.fundingAmount || !!program.deadline || 
            program.title.toLowerCase().includes('fund') ||
            program.summary.toLowerCase().includes('applications'));
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