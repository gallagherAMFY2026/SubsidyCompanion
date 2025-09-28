import { rssParser } from './rssParser';
import { storage } from '../storage';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

export class RssService {
  // Enhanced service with targeted agricultural funding sources from user list
  private readonly CANADA_NEWS_URLS = [
    // Official Government Sources
    'https://www.canada.ca/en/agriculture-agri-food/news.html',
    'https://www.canada.ca/en/agriculture-agri-food/programs-and-services.html',
    'https://www.canada.ca/en/services/business/grants-and-financing/agriculture.html',
    
    // Farmer-Focused News and Grant Listings  
    'https://youngagrarians.org/funding/',
    'https://youngagrarians.org/news/',
    
    // Industry Publications
    'https://farmtario.com/news/',
    'https://farmtario.com/government/',
    'https://www.canadiancattlemen.ca/news/',
    'https://www.canadiancattlemen.ca/government/',
    
    // Research and Programs
    'https://www.beefresearch.ca/funding-programs/',
    'https://www.foragegrassland.org/funding-opportunities',
    
    // Grant Aggregators
    'https://www.hellodarwin.com/en/blog/agriculture-grants-canada',
    'https://www.natureunited.ca/what-we-do/agriculture/'
  ];

  private readonly PRIMARY_FEEDS = [
    {
      name: 'Australia DAFF',
      url: 'https://www.agriculture.gov.au/about/news/stay-informed/rss',
      country: 'AU',
      fallbacks: [],
      mixerFallbacks: [
        'https://rss.app/feeds/australia-agriculture-news.xml',
        'https://fetchrss.com/rss/au-daff-news.xml'
      ]
    },
    {
      name: 'Australia NSW DPI',
      url: 'https://www.dpi.nsw.gov.au/about-us/media-centre/releases/rss-feeds',
      country: 'AU',
      fallbacks: [
        'https://www.dpi.nsw.gov.au/about-us/media-centre/releases.rss',
        'https://www.dpi.nsw.gov.au/media/releases.xml'
      ],
      mixerFallbacks: [
        'https://rss.app/feeds/nsw-dpi-agriculture.xml'
      ]
    }
  ];
  
  private lastFetchTime: Date | null = null;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly USER_AGENT = 'SubsidyCompanion/1.0 (agricultural-funding-monitor)';

  // Enhanced Canadian agricultural funding keywords (applied to content, not titles)
  private readonly CANADA_CONTENT_KEYWORDS = [
    // Program Names
    'AgriInnovate', 'AgriMarketing', 'AgriScience', 'AgriStability', 'AgriInvest', 
    'Business Risk Management', 'Farm Credit Canada', 'Advance Payments Program',
    'Canadian Agricultural Partnership', 'Sustainable CAP', 'AgriAssurance',
    
    // Opportunity Indicators
    'apply', 'intake', 'deadline', 'call for proposals', 'funding opportunity',
    'application deadline', 'submissions', 'applications now open', 'now accepting',
    'cost-shared', 'matching funds', 'financial assistance', 'technical assistance',
    
    // Sectors
    'livestock', 'cattle', 'beef', 'dairy', 'forage', 'grassland', 'sustainable',
    'conservation', 'soil health', 'biodiversity', 'climate change', 'innovation',
    
    // French Terms
    'subvention', 'financement', 'programme', 'aide financière', 'date limite',
    'demande', 'candidature', 'agriculture durable'
  ];

  // Title filtering keywords (more generous - only exclude obvious non-opportunities)
  private readonly CANADA_TITLE_KEYWORDS = [
    'grant', 'funding', 'program', 'support', 'assistance', 'investment',
    'opportunity', 'apply', 'application', 'call', 'proposals', 'intake',
    'deadline', 'open', 'available', 'announces', 'launches', 'invests'
  ];

  /**
   * Fetch Canadian news listings with enhanced selectors and pagination
   */
  private async fetchCanadianNewsListings(baseUrl: string): Promise<Array<{
    title: string;
    url: string;
    pubDate?: string;
    summary?: string;
  }>> {
    try {
      let allListings: Array<any> = [];
      let page = 0;
      const maxPages = 5; // Reasonable limit to prevent infinite loops
      
      // Support pagination for Canadian sites
      do {
        const pageUrl = page === 0 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`;
        
        try {
          const response = await this.fetchWithRetry(pageUrl);
          const $ = cheerio.load(response);
          const pageListings: Array<any> = [];

          // Domain-specific selectors for better precision
          const domain = new URL(baseUrl).hostname;
          const selectors = this.getDomainSpecificSelectors(domain);

          for (const selector of selectors) {
            $(selector).each((_, element) => {
              const $item = $(element);
              
              // Multiple title selector attempts
              const titleSelectors = ['h1 a', 'h2 a', 'h3 a', 'h4 a', '.title a', '.headline a', 'a'];
              let titleEl = null;
              let title = '';
              
              for (const titleSel of titleSelectors) {
                titleEl = $item.find(titleSel).first();
                title = titleEl.text().trim();
                if (title && title.length > 10) break; // Found meaningful title
              }
              
              // If no link with title, try the item itself as a link
              if (!title && $item.is('a')) {
                titleEl = $item;
                title = $item.text().trim();
              }
              
              const relativeUrl = titleEl?.attr('href');
              
              if (title && relativeUrl && title.length > 10) {
                // Only do basic filtering here - no aggressive keyword filtering
                const isBasicallyRelevant = title.length > 15 && 
                  !title.toLowerCase().includes('cookie') &&
                  !title.toLowerCase().includes('privacy') &&
                  !title.toLowerCase().includes('contact');
                
                if (isBasicallyRelevant) {
                  const fullUrl = relativeUrl.startsWith('http') ? 
                    relativeUrl : 
                    new URL(relativeUrl, baseUrl).toString();
                  
                  const pubDate = $item.find('.date, .datetime, .published-date, .post-date, time').text().trim();
                  const summary = $item.find('.summary, .description, .excerpt, .teaser').text().trim();
                  
                  pageListings.push({
                    title: title.replace(/\s+/g, ' ').trim(),
                    url: fullUrl,
                    pubDate: pubDate || null,
                    summary: summary || null
                  });
                }
              }
            });
            
            if (pageListings.length > 0) break; // Found items with this selector, stop trying others
          }

          console.log(`🍁 Page ${page}: Found ${pageListings.length} items from ${pageUrl}`);
          
          if (pageListings.length === 0) {
            break; // No more items, stop pagination
          }
          
          allListings.push(...pageListings);
          page++;
          
          // Respectful delay between pages
          if (page < maxPages) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (pageError) {
          console.warn(`⚠️  Failed to fetch page ${page} from ${baseUrl}:`, pageError);
          break;
        }
        
      } while (page < maxPages);

      // Deduplicate by URL
      const uniqueListings = Array.from(
        new Map(allListings.map(item => [item.url, item])).values()
      );

      console.log(`🍁 Total: Found ${uniqueListings.length} unique items from ${baseUrl} (${allListings.length} before dedup)`);
      return uniqueListings;
      
    } catch (error) {
      console.error('❌ Failed to fetch Canadian news listings:', error);
      return [];
    }
  }

  /**
   * Process Canadian news announcement (following NRCS pattern)
   */
  private async processCanadianAnnouncement(
    announcement: { title: string; url: string; pubDate?: string; summary?: string }
  ): Promise<any | null> {
    try {
      console.log(`🍁 Processing: ${announcement.title}`);
      
      if (!this.isValidUrl(announcement.url)) {
        console.warn(`⚠️  Invalid URL skipped: ${announcement.url}`);
        return null;
      }
      
      const content = await this.fetchWithRetry(announcement.url);
      const $ = cheerio.load(content);
      
      // Enhanced content extraction for Canadian gov pages
      const contentSelectors = [
        '.gc-main, .main-content, .content, article',
        '.page-content, .entry-content, .news-content',
        '.body, .text, .description, .announcement-content',
        '.wb-main, .container-fluid .row'
      ];
      
      let fullContent = '';
      for (const selector of contentSelectors) {
        const extractedContent = $(selector).text().trim();
        if (extractedContent.length > fullContent.length) {
          fullContent = extractedContent;
        }
      }
      
      if (!fullContent || fullContent.length < 100) {
        console.warn(`⚠️  Insufficient content extracted from ${announcement.url} (${fullContent.length} chars)`);
        const pageTitle = $('title').text() || $('h1').first().text();
        fullContent = `${pageTitle}\n${announcement.summary || ''}\n${fullContent}`.trim();
      }

      // Apply content-based filtering (not title filtering)
      const combinedContent = `${announcement.title} ${fullContent}`.toLowerCase();
      const isRelevantProgram = this.CANADA_CONTENT_KEYWORDS.some(keyword => 
        combinedContent.includes(keyword.toLowerCase())
      );
      
      if (!isRelevantProgram) {
        console.log(`🍁 Not relevant: ${announcement.title}`);
        return null;
      }

      const deadline = this.extractEnhancedDeadline(fullContent);
      const fundingAmount = this.extractEnhancedFundingAmount(fullContent);
      const programType = this.extractCanadianProgramType(fullContent);
      
      const isHighPriority = this.CANADA_CONTENT_KEYWORDS.some(keyword => 
        combinedContent.includes(keyword.toLowerCase())
      );
      
      // Derive proper source attribution from domain
      const attribution = this.getCanadianSourceAttribution((announcement as any).sourceDomain || announcement.url);
      
      const program = {
        id: `ca-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: announcement.title,
        description: announcement.summary || this.extractSummary(fullContent),
        category: this.categorizeCanadianProgram(announcement.title, fullContent),
        publishedDate: this.parseDate(announcement.pubDate) || new Date(),
        deadline,
        url: announcement.url,
        dataSource: attribution.dataSource,
        sourceAgency: attribution.sourceAgency,
        country: 'Canada',
        fundingAmount,
        eligibilityTypes: ['farm', 'producer', 'organization'],
        fundingTypes: this.extractFundingTypes(fullContent),
        isHighPriority,
        location: this.extractCanadianLocation(fullContent),
        region: this.extractCanadianLocation(fullContent)
      };
      
      return program;
      
    } catch (error) {
      console.error(`❌ Failed to process Canadian announcement ${announcement.title}:`, error);
      return null;
    }
  }

  /**
   * Helper methods for Canadian program processing
   */
  private isRelevantCanadianProgram(title: string): boolean {
    // Use more generous title filtering - check for basic opportunity indicators
    return this.CANADA_TITLE_KEYWORDS.some(keyword => 
      title.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private extractEnhancedDeadline(content: string): Date | null {
    // Enhanced deadline patterns supporting English, French, and various formats
    const deadlinePatterns = [
      // English patterns
      /deadline:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /application(?:s)? (?:due|close|closes):?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /applications? must be (?:received|submitted) by:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /submit(?:ted)? by:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /apply by:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /intake closes:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /closes on:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i,
      
      // ISO and numeric formats
      /deadline:?\s*(\d{4}-\d{2}-\d{2})/i,
      /(?:due|closes|deadline):?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/g,
      
      // French patterns
      /date limite:?\s*(\d{1,2} [A-Za-z]+ \d{4})/i,
      /échéance:?\s*(\d{1,2} [A-Za-z]+ \d{4})/i,
      /avant le:?\s*(\d{1,2} [A-Za-z]+ \d{4})/i,
      /jusqu'au:?\s*(\d{1,2} [A-Za-z]+ \d{4})/i,
      
      // Flexible patterns
      /([A-Za-z]+ \d{1,2},? \d{4})\s*deadline/i,
      /by ([A-Za-z]+ \d{1,2},? \d{4})/i
    ];

    for (const pattern of deadlinePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const dateStr = typeof match === 'string' ? match : match[1];
          if (dateStr) {
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime()) && parsed > new Date()) {
              return parsed;
            }
          }
        }
      }
    }
    return null;
  }

  private extractEnhancedFundingAmount(content: string): string | null {
    // Enhanced funding patterns supporting CAD, ranges, various formats
    const fundingPatterns = [
      // Standard formats with CAD
      /CAD?\s*\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      /C\$[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      /\$[\d,]+(?:\.\d+)?\s*CAD(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      
      // Ranges
      /\$[\d,]+(?:\.\d+)?\s*(?:to|–|-)?\s*\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      /between\s+\$[\d,]+(?:\.\d+)?\s+and\s+\$[\d,]+(?:\.\d+)?/gi,
      
      // Descriptive amounts
      /up to\s+(?:CAD?\s*)?\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      /maximum\s+(?:of\s+)?(?:CAD?\s*)?\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      /funding\s+(?:up to|of)\s+(?:CAD?\s*)?\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi,
      
      // Per-project amounts
      /per project:?\s*(?:CAD?\s*)?\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M))?/gi,
      /each project:?\s*(?:CAD?\s*)?\$?[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M))?/gi,
      
      // French formats
      /subvention\s+de\s+[\d,]+(?:\.\d+)?\s*\$?(?:\s*(?:millions?|milliers?))?/gi,
      /financement\s+de\s+[\d,]+(?:\.\d+)?\s*\$?(?:\s*(?:millions?|milliers?))?/gi,
      
      // Standard dollar amounts (fallback)
      /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|k|M|billion|B))?/gi
    ];

    for (const pattern of fundingPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Return the first meaningful match (avoid small amounts like $5)
        for (const match of matches) {
          const cleanMatch = match.trim();
          const numMatch = cleanMatch.match(/[\d,]+(?:\.\d+)?/);
          if (numMatch) {
            const num = parseFloat(numMatch[0].replace(/,/g, ''));
            if (num >= 1000 || cleanMatch.toLowerCase().includes('million') || cleanMatch.toLowerCase().includes('thousand')) {
              return cleanMatch;
            }
          }
        }
      }
    }
    return null;
  }

  private extractSummary(content: string): string {
    const sentences = content.split(/[.!?]+/);
    return sentences.slice(0, 2).join('. ').trim();
  }

  private categorizeCanadianProgram(title: string, content: string): string {
    const titleAndContent = `${title} ${content}`.toLowerCase();
    
    if (titleAndContent.includes('innovation') || titleAndContent.includes('research')) return 'Innovation';
    if (titleAndContent.includes('marketing') || titleAndContent.includes('market')) return 'Marketing';
    if (titleAndContent.includes('environment') || titleAndContent.includes('conservation')) return 'Conservation';
    if (titleAndContent.includes('youth') || titleAndContent.includes('young')) return 'Youth';
    if (titleAndContent.includes('export') || titleAndContent.includes('trade')) return 'Trade';
    
    return 'General';
  }

  private extractFundingTypes(content: string): string[] {
    const types = [];
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('grant')) types.push('grant');
    if (lowerContent.includes('loan')) types.push('loan');
    if (lowerContent.includes('support')) types.push('support');
    if (lowerContent.includes('assistance')) types.push('assistance');
    
    return types.length > 0 ? types : ['grant'];
  }

  private extractCanadianLocation(content: string): string | null {
    const provinces = [
      'British Columbia', 'Alberta', 'Saskatchewan', 'Manitoba', 
      'Ontario', 'Quebec', 'New Brunswick', 'Nova Scotia', 
      'Prince Edward Island', 'Newfoundland and Labrador'
    ];
    
    for (const province of provinces) {
      if (content.includes(province)) {
        return province;
      }
    }
    return null;
  }

  private extractCanadianProgramType(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('agriinnovate')) return 'AgriInnovate';
    if (lowerContent.includes('agrimarketing')) return 'AgriMarketing';
    if (lowerContent.includes('agriscience')) return 'AgriScience';
    if (lowerContent.includes('agristability')) return 'AgriStability';
    
    return 'Program';
  }

  /**
   * Get domain-specific selectors for better precision
   */
  private getDomainSpecificSelectors(domain: string): string[] {
    const domainSelectors: { [key: string]: string[] } = {
      // Canada.ca official sites
      'canada.ca': [
        '#wb-auto-1 .wb-feeds li',
        '.gc-nws, .featured-news',
        '.gc-articles article',
        '.news-release, .media-release',
        'main .views-row',
        '.content-item'
      ],
      
      // Young Agrarians  
      'youngagrarians.org': [
        '.post, .entry',
        '.funding-item, .opportunity-item',
        'article',
        '.content-wrap .item'
      ],
      
      // Farmtario
      'farmtario.com': [
        '.post, article',
        '.news-item, .story-item',
        '.category-government .post',
        '.entry'
      ],
      
      // Canadian Cattlemen
      'canadiancattlemen.ca': [
        '.post, article',
        '.news-item',
        '.category-news .post',
        '.category-government .post'
      ],
      
      // Beef Research Council
      'beefresearch.ca': [
        '.funding-program, .program-item',
        '.post, article',
        '.opportunity-item'
      ],
      
      // Forage and Grassland
      'foragegrassland.org': [
        '.funding-opportunity, .opportunity-item',
        '.post, article',
        '.program-item'
      ],
      
      // helloDarwin
      'hellodarwin.com': [
        '.grant-item, .funding-item',
        'article, .post',
        '.content-item'
      ],
      
      // Nature United
      'natureunited.ca': [
        '.program-item, .initiative-item',
        'article, .post',
        '.content-item'
      ]
    };
    
    // Get domain-specific selectors or fallback to generic ones
    return domainSelectors[domain] || [
      'article, .post, .entry',
      '.news-item, .content-item',
      '.views-row, .list-group-item',
      'ul li a, ol li a'
    ];
  }

  /**
   * Get proper source attribution based on domain
   */
  private getCanadianSourceAttribution(domainOrUrl: string): { dataSource: string; sourceAgency: string } {
    const domain = domainOrUrl.includes('://') ? new URL(domainOrUrl).hostname : domainOrUrl;
    
    const attributions: { [key: string]: { dataSource: string; sourceAgency: string } } = {
      'canada.ca': {
        dataSource: 'canada_agriculture_official',
        sourceAgency: 'Agriculture and Agri-Food Canada'
      },
      'agriculture.canada.ca': {
        dataSource: 'canada_agriculture_official', 
        sourceAgency: 'Agriculture and Agri-Food Canada'
      },
      'agr.gc.ca': {
        dataSource: 'canada_agriculture_official',
        sourceAgency: 'Agriculture and Agri-Food Canada'  
      },
      'youngagrarians.org': {
        dataSource: 'young_agrarians',
        sourceAgency: 'Young Agrarians'
      },
      'farmtario.com': {
        dataSource: 'farmtario',
        sourceAgency: 'Farmtario'
      },
      'canadiancattlemen.ca': {
        dataSource: 'canadian_cattlemen',
        sourceAgency: 'Canadian Cattlemen Association'
      },
      'beefresearch.ca': {
        dataSource: 'beef_research_council',
        sourceAgency: 'Beef Research Council'
      },
      'foragegrassland.org': {
        dataSource: 'canadian_forage_grassland',
        sourceAgency: 'Canadian Forage and Grassland Association'
      },
      'hellodarwin.com': {
        dataSource: 'hellodarwin',
        sourceAgency: 'helloDarwin'
      },
      'natureunited.ca': {
        dataSource: 'nature_united',
        sourceAgency: 'Nature United Canada'
      }
    };
    
    return attributions[domain] || {
      dataSource: 'canada_agriculture',
      sourceAgency: 'Canadian Agricultural Source'
    };
  }

  private parseDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async fetchWithRetry(url: string): Promise<string> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.text();
        
      } catch (error) {
        console.warn(`Attempt ${attempt}/${this.MAX_RETRIES} failed for ${url}:`, (error as Error).message);
        
        if (attempt === this.MAX_RETRIES) {
          throw error;
        }
        
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('All retry attempts failed');
  }

  /**
   * Sync Canadian agricultural programs from news pages with deduplication
   */
  private async syncCanadianNewsPages(): Promise<number> {
    console.log('🍁 Syncing Canadian agricultural programs from news pages...');
    
    let totalPrograms = 0;
    const allListings: Array<any> = [];
    
    // Collect all listings from all sources first
    for (const newsUrl of this.CANADA_NEWS_URLS) {
      try {
        console.log(`📰 Fetching news from: ${newsUrl}`);
        
        const listings = await this.fetchCanadianNewsListings(newsUrl);
        console.log(`🍁 Found ${listings.length} news items from ${newsUrl}`);
        
        // Add source domain for attribution
        const domain = new URL(newsUrl).hostname;
        listings.forEach(listing => {
          (listing as any).sourceDomain = domain;
          (listing as any).sourceUrl = newsUrl;
        });
        
        allListings.push(...listings);
        
        // Respectful delay between sources
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Failed to sync Canadian news from ${newsUrl}:`, error);
      }
    }
    
    // Cross-source deduplication by normalized URL and title+domain
    const uniqueListings = this.deduplicateCanadianListings(allListings);
    console.log(`🍁 After cross-source deduplication: ${uniqueListings.length} unique items (${allListings.length} before)`);
    
    // Process unique listings
    for (const listing of uniqueListings) {
      try {
        const program = await this.processCanadianAnnouncement(listing);
        if (program) {
          // Check for existing program to prevent storage duplicates
          const existingPrograms = await storage.getSubsidyPrograms();
          const duplicate = existingPrograms.find(existing => 
            this.normalizeUrl(existing.url) === this.normalizeUrl(program.url) ||
            (existing.title === program.title && existing.sourceAgency === program.sourceAgency)
          );
          
          if (!duplicate) {
            await storage.createSubsidyProgram(program);
            totalPrograms++;
            console.log(`✅ Stored Canadian program: ${program.title}`);
          } else {
            console.log(`🔄 Skipped duplicate: ${program.title}`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to process Canadian listing: ${listing.title}`, error);
      }
    }
    
    console.log(`🍁 Canadian news sync completed: ${totalPrograms} new programs stored`);
    return totalPrograms;
  }

  /**
   * Public method for Canadian funding sync (matches route expectations)
   */
  async syncCanadianFunding(): Promise<number> {
    return await this.syncCanadianNewsPages();
  }

  /**
   * Deduplicate listings across sources
   */
  private deduplicateCanadianListings(listings: Array<any>): Array<any> {
    const urlMap = new Map();
    const titleMap = new Map();
    
    for (const listing of listings) {
      const normalizedUrl = this.normalizeUrl(listing.url);
      const titleKey = `${listing.title.toLowerCase().trim()}-${listing.sourceDomain}`;
      
      // Prefer exact URL matches first
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, listing);
      }
      // Then title+domain matches
      else if (!titleMap.has(titleKey)) {
        titleMap.set(titleKey, listing);
      }
    }
    
    // Combine unique URLs and unique titles
    const unique = Array.from(urlMap.values());
    const uniqueTitles = Array.from(titleMap.values()).filter(listing => 
      !unique.find(u => this.normalizeUrl(u.url) === this.normalizeUrl(listing.url))
    );
    
    return [...unique, ...uniqueTitles];
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query params, hash, and common tracking
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Fetch RSS content with enhanced error handling, fallbacks, and RSS mixer services
   */
  private async fetchRssContentWithFallbacks(feedConfig: any): Promise<{ content: string; sourceUrl: string }> {
    // Step 1: Try primary URL
    try {
      console.log(`Attempting to fetch RSS from primary: ${feedConfig.url}`);
      const content = await this.fetchSingleRssFeed(feedConfig.url);
      return { content, sourceUrl: feedConfig.url };
    } catch (error) {
      console.warn(`Primary URL failed for ${feedConfig.name}:`, (error as Error).message);
    }
    
    // Step 2: Try fallback URLs
    for (const url of feedConfig.fallbacks) {
      try {
        console.log(`Attempting fallback RSS from: ${url}`);
        const content = await this.fetchSingleRssFeed(url);
        return { content, sourceUrl: url };
      } catch (error) {
        console.warn(`Fallback failed for ${url}:`, (error as Error).message);
        continue;
      }
    }
    
    // Step 3: Try RSS mixer services as last resort
    console.log(`All direct URLs failed for ${feedConfig.name}, trying RSS mixer services...`);
    for (const mixerUrl of feedConfig.mixerFallbacks || []) {
      try {
        console.log(`Attempting RSS mixer service: ${mixerUrl}`);
        const content = await this.fetchSingleRssFeed(mixerUrl);
        console.log(`RSS mixer service succeeded for ${feedConfig.name}`);
        return { content, sourceUrl: mixerUrl };
      } catch (error) {
        console.warn(`RSS mixer failed for ${mixerUrl}:`, (error as Error).message);
        continue;
      }
    }
    
    // Step 4: Ultimate fallback - generate placeholder content to indicate the feed is broken
    console.error(`All sources failed for ${feedConfig.name}, using placeholder content`);
    return {
      content: this.generatePlaceholderRss(feedConfig),
      sourceUrl: 'placeholder://feed-unavailable'
    };
  }
  
  /**
   * Generate placeholder RSS content when all sources fail
   */
  private generatePlaceholderRss(feedConfig: any): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${feedConfig.name} - Feed Temporarily Unavailable</title>
    <description>This feed is temporarily unavailable. Please check back later.</description>
    <link>https://example.com</link>
    <item>
      <title>Feed Service Notice: ${feedConfig.name} Currently Unavailable</title>
      <description>We are working to restore access to ${feedConfig.name} agricultural funding information. Please check back in a few hours.</description>
      <pubDate>${now}</pubDate>
      <guid>placeholder-${feedConfig.country}-${Date.now()}</guid>
    </item>
  </channel>
</rss>`;
  }
  
  /**
   * Fetch a single RSS feed with robust error handling
   */
  private async fetchSingleRssFeed(url: string): Promise<string> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);
        
        // Enhanced headers for better compatibility
        const fetchOptions: RequestInit = {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (Agricultural Funding Intelligence Platform)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          },
          signal: controller.signal
        };
        
        const response = await fetch(url, fetchOptions);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
          console.warn(`Unexpected content type: ${contentType}`);
        }
        
        const content = await response.text();
        
        if (content.length < 100) {
          throw new Error(`Content too short: ${content.length} bytes`);
        }
        
        if (!content.includes('<rss') && !content.includes('<feed') && !content.includes('<?xml')) {
          throw new Error('Content does not appear to be valid XML/RSS/Atom');
        }
        
        console.log(`Successfully fetched ${content.length} bytes from ${url}`);
        return content;
        
      } catch (error) {
        console.error(`Attempt ${attempt}/${this.MAX_RETRIES} failed for ${url}:`, (error as Error).message);
        
        if (attempt === this.MAX_RETRIES) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Failed to fetch RSS after ${this.MAX_RETRIES} attempts`);
  }


  /**
   * Sync RSS feed data from multiple sources to storage
   */
  async syncRssData(forceRefresh: boolean = false): Promise<void> {
    try {
      console.log('Starting enhanced sync with news page scraping and RSS fallback...');
      
      let totalPrograms = 0;
      const allPrograms: any[] = [];
      
      // PRIORITY 1: Canadian news page scraping (replaces RSS)
      console.log('🍁 Starting Canadian news page scraping...');
      const canadianPrograms = await this.syncCanadianNewsPages();
      totalPrograms += canadianPrograms;
      console.log(`✅ Canadian news scraping completed: ${canadianPrograms} programs`);
      
      // Continue with remaining RSS feeds (NZ, AU)
      for (const feedConfig of this.PRIMARY_FEEDS) {
        try {
          console.log(`\nSyncing ${feedConfig.name}...`);
          
          const { content, sourceUrl } = await this.fetchRssContentWithFallbacks(feedConfig);
          const programs = await rssParser.processRssFeed(content);
          
          console.log(`Parsed ${programs.length} entries from ${feedConfig.name}`);
          
          // Enrich programs with required metadata and filter to active programs only
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          
          const enrichedPrograms = programs.map(program => ({
            ...program,
            dataSource: `${feedConfig.country.toLowerCase()}_rss`,
            sourceUrl,
            sourceAgency: feedConfig.name,
            country: feedConfig.country,
            region: program.location || null,
            eligibilityTypes: ['farm', 'producer', 'organization'],
            fundingTypes: ['grant', 'support', 'program'],
            mergedFromSources: [`${feedConfig.country.toLowerCase()}_rss`]
          })).filter(program => {
            // Only include programs that:
            // 1. Have a deadline set AND deadline is in the future
            // 2. OR are recently published (within last 90 days) for ongoing programs
            
            if (program.deadline) {
              const deadlineYear = new Date(program.deadline).getFullYear();
              return new Date(program.deadline) > currentDate && deadlineYear >= currentYear;
            }
            
            // For programs without deadlines, only include recent ones (last 90 days)
            const ninetyDaysAgo = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000);
            const publishedYear = new Date(program.publishedDate).getFullYear();
            return new Date(program.publishedDate) > ninetyDaysAgo && publishedYear >= currentYear;
          });
          
          console.log(`After filtering for active programs: ${enrichedPrograms.length} remain`);
          
          allPrograms.push(...enrichedPrograms);
          totalPrograms += enrichedPrograms.length;
          console.log(`${feedConfig.name}: ${enrichedPrograms.length} active programs added`);
          
        } catch (error) {
          console.error(`Failed to sync ${feedConfig.name}:`, (error as Error).message);
          // Log details about what failed for troubleshooting
          if (error instanceof Error && error.message.includes('placeholder')) {
            console.warn(`${feedConfig.name} is using placeholder content - feed may need manual configuration`);
          }
          // Continue with other feeds even if one fails
        }
      }
      
      // Clear existing programs and add new ones
      console.log('\nUpdating storage with new programs...');
      const existingPrograms = await storage.getSubsidyPrograms();
      
      // Delete existing programs
      await Promise.all(
        existingPrograms.map(program => storage.deleteSubsidyProgram(program.id))
      );

      // Add new active programs
      await Promise.all(
        allPrograms.map(program => storage.createSubsidyProgram(program))
      );
      
      this.lastFetchTime = new Date();
      console.log(`\nEnhanced RSS sync completed - ${totalPrograms} total active programs stored`);
      
    } catch (error) {
      console.error('Error in enhanced RSS sync:', error);
      throw error;
    }
  }
  

  /**
   * Get cached programs or fetch fresh data if cache is stale
   */
  async getPrograms(forceRefresh = false): Promise<any[]> {
    const shouldRefresh = forceRefresh || 
      !this.lastFetchTime || 
      (Date.now() - this.lastFetchTime.getTime() > this.CACHE_DURATION);

    if (shouldRefresh) {
      await this.syncRssData(forceRefresh);
    }

    try {
      return await storage.getActiveSubsidyPrograms();
    } catch (error) {
      console.error('Error fetching programs from storage:', error);
      return [];
    }
  }

  /**
   * Get programs filtered by category or search term
   */
  async searchPrograms(query?: string, category?: string): Promise<any[]> {
    const allPrograms = await this.getPrograms();
    
    if (!query && !category) {
      return allPrograms;
    }

    return allPrograms.filter(program => {
      // Safely handle summary field that might be an object
      const summaryText = this.normalizeSummary(program.summary);
      
      const matchesQuery = !query || 
        program.title.toLowerCase().includes(query.toLowerCase()) ||
        summaryText.toLowerCase().includes(query.toLowerCase());
        
      const matchesCategory = !category || 
        program.category.toLowerCase() === category.toLowerCase();
        
      return matchesQuery && matchesCategory;
    });
  }

  /**
   * Normalize summary field to string (handles RSS objects)
   */
  private normalizeSummary(summary: any): string {
    if (typeof summary === 'string') {
      return summary;
    }
    
    if (summary && typeof summary === 'object') {
      // Handle RSS parsing objects like { '#text': '...', type: 'html' }
      if (summary['#text']) {
        return summary['#text'];
      }
      // Handle other object formats
      if (summary.text) {
        return summary.text;
      }
      // Fallback to stringified version
      return JSON.stringify(summary);
    }
    
    return summary ? String(summary) : '';
  }

  /**
   * Get programs by location (province/territory)
   */
  async getProgramsByLocation(location: string): Promise<any[]> {
    const allPrograms = await this.getPrograms();
    
    return allPrograms.filter(program => 
      program.location?.toLowerCase().includes(location.toLowerCase()) ||
      (!program.location && program.title.toLowerCase().includes('canada')) // National programs
    );
  }

  /**
   * Get upcoming deadlines
   */
  async getUpcomingDeadlines(): Promise<any[]> {
    try {
      const allPrograms = await this.getPrograms();
      const now = new Date();
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      
      return allPrograms
        .filter(program => program.deadline && program.deadline > now && program.deadline <= threeMonthsFromNow)
        .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
    } catch (error) {
      console.error('Error fetching deadlines:', error);
      return [];
    }
  }
}

export const rssService = new RssService();