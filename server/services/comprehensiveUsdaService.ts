import { z } from 'zod';
import * as cheerio from 'cheerio';
import { storage } from '../storage.js';
import type { InsertSubsidyProgram, SubsidyProgram } from '@shared/schema';

// State configurations for comprehensive coverage
interface StateConfig {
  code: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  nrcsUrls: string[]; // Multiple URL patterns to try
  fcsUrl?: string;
}

// USDA Agency configurations
interface AgencyConfig {
  name: string;
  baseUrl: string;
  newsPath: string;
  keywords: string[];
}

export class ComprehensiveUsdaService {
  private readonly USER_AGENT = 'SubsidyCompanion/1.0 (agricultural-funding-monitor)';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly MAX_CONCURRENT_REQUESTS = 5;

  // Top agricultural states for comprehensive coverage
  private readonly STATE_CONFIGS: StateConfig[] = [
    // Tier 1 - High Priority States
    { code: 'ia', name: 'Iowa', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/iowa/news/',
      'https://www.nrcs.usda.gov/conservation-basics/conservation-by-state/iowa/news/',
      'https://www.nrcs.usda.gov/ia/newsroom'
    ]},
    { code: 'il', name: 'Illinois', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/conservation-basics/conservation-by-state/illinois/news-and-publications-illinois',
      'https://www.nrcs.usda.gov/state-offices/illinois/news/',
      'https://www.nrcs.usda.gov/il/newsroom'
    ]},
    { code: 'ne', name: 'Nebraska', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/nebraska/news/',
      'https://www.nrcs.usda.gov/ne/newsroom',
      'https://www.nrcs.usda.gov/state-offices/nebraska/news-releases'
    ]},
    { code: 'mn', name: 'Minnesota', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/minnesota/news/',
      'https://www.nrcs.usda.gov/mn/newsroom',
      'https://www.nrcs.usda.gov/state-offices/minnesota/news-releases'
    ]},
    { code: 'ks', name: 'Kansas', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/kansas/news/',
      'https://www.nrcs.usda.gov/ks/newsroom',
      'https://www.nrcs.usda.gov/state-offices/kansas/news-releases'
    ]},
    { code: 'wi', name: 'Wisconsin', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/wi/newsroom',
      'https://www.nrcs.usda.gov/state-offices/wisconsin/news/',
      'https://www.nrcs.usda.gov/state-offices/wisconsin/news-releases'
    ]},
    { code: 'ca', name: 'California', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/california/news-releases',
      'https://www.nrcs.usda.gov/ca/newsroom',
      'https://www.nrcs.usda.gov/state-offices/california/news/'
    ]},
    { code: 'tx', name: 'Texas', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/texas/news/',
      'https://www.nrcs.usda.gov/tx/newsroom',
      'https://www.nrcs.usda.gov/state-offices/texas/news-releases'
    ]},
    { code: 'mo', name: 'Missouri', priority: 'high', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/missouri/news/',
      'https://www.nrcs.usda.gov/mo/newsroom',
      'https://www.nrcs.usda.gov/state-offices/missouri/news-releases'
    ]},
    
    // Tier 2 - Medium Priority States 
    { code: 'in', name: 'Indiana', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/indiana/news/',
      'https://www.nrcs.usda.gov/in/newsroom',
      'https://www.nrcs.usda.gov/state-offices/indiana/news-releases'
    ]},
    { code: 'oh', name: 'Ohio', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/ohio/news/',
      'https://www.nrcs.usda.gov/oh/newsroom',
      'https://www.nrcs.usda.gov/state-offices/ohio/news-releases'
    ]},
    { code: 'nd', name: 'North Dakota', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/north-dakota/news/',
      'https://www.nrcs.usda.gov/nd/newsroom',
      'https://www.nrcs.usda.gov/state-offices/north-dakota/news-releases'
    ]},
    { code: 'sd', name: 'South Dakota', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/south-dakota/news/',
      'https://www.nrcs.usda.gov/sd/newsroom',
      'https://www.nrcs.usda.gov/state-offices/south-dakota/news-releases'
    ]},
    { code: 'nc', name: 'North Carolina', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/north-carolina/news/',
      'https://www.nrcs.usda.gov/nc/newsroom',
      'https://www.nrcs.usda.gov/state-offices/north-carolina/news-releases'
    ]},
    { code: 'ga', name: 'Georgia', priority: 'medium', nrcsUrls: [
      'https://www.nrcs.usda.gov/state-offices/georgia/news/',
      'https://www.nrcs.usda.gov/ga/newsroom',
      'https://www.nrcs.usda.gov/state-offices/georgia/news-releases'
    ]}
  ];

  // USDA Agency configurations  
  private readonly AGENCY_CONFIGS: AgencyConfig[] = [
    {
      name: 'AMS',
      baseUrl: 'https://www.ams.usda.gov',
      newsPath: '/news',
      keywords: ['grant', 'funding', 'assistance', 'program', 'specialty crop', 'organic', 'marketing']
    },
    {
      name: 'Rural Development',
      baseUrl: 'https://www.rd.usda.gov',
      newsPath: '/newsroom',
      keywords: ['grant', 'loan', 'funding', 'rural', 'broadband', 'infrastructure', 'energy']
    },
    {
      name: 'FSA',
      baseUrl: 'https://www.fsa.usda.gov',
      newsPath: '/news-events/news',
      keywords: ['disaster', 'assistance', 'loan', 'conservation', 'signup', 'deadline']
    }
  ];

  // Additional US agricultural funding news URLs (user-provided sources)
  private readonly ADDITIONAL_NEWS_URLS = [
    // Federal Programs and News Sources (Priority)
    'https://www.fsa.usda.gov/news-room/news-releases/',
    'https://www.fsa.usda.gov/programs-and-services/',
    'https://www.farmers.gov/your-business/beginning-farmers',
    'https://www.farmers.gov/fund',
    'https://www.farmers.gov/working-with-us/farm-bill',
    'https://usafacts.org/articles/topic/agriculture/',
    'https://usafacts.org/data/topics/economy/agriculture/',
    
    // State and Local-Level Grant Resources
    'https://www.mda.state.mn.us/grants/',
    'https://www.mda.state.mn.us/news/',
    'https://swoopfunding.com/blog/category/agriculture/',
    'https://swoopfunding.com/grants/agriculture/',
    
    // Specialized Grants and Sector-Focused Programs
    'https://livestockconservancy.org/grants-funding/',
    'https://livestockconservancy.org/news/',
    'https://farmaction.us/news/',
    'https://farmaction.us/issues/subsidies/',
    
    // Policy Commentary and Analysis
    'https://www.nytimes.com/section/climate/agriculture',
    'https://www.openthebooks.com/agriculture/',
    
    // Sustainability, Clean Energy, and Land Management
    'https://insideclimatenews.org/topic/agriculture/',
    'https://www.dailyclimate.org/agriculture/',
    'https://www.usda.gov/climate-solutions/forestry-initiatives',
    'https://www.fs.usda.gov/fire/fire-mgmt-funding'
  ];

  // Enhanced funding opportunity keywords (user-focused)
  private readonly FUNDING_OPPORTUNITY_KEYWORDS = [
    'grant', 'grants', 'funding', 'fund', 'subsidy', 'subsidies',
    'application', 'applications', 'apply', 'deadline', 'closes',
    'intake', 'round', 'opportunity', 'opportunities', 'scheme',
    'support', 'assistance', 'investment', 'co-investment',
    'program', 'initiative', 'eligibility', 'eligible', 'criteria'
  ];

  // High-value program keywords for enhanced detection
  private readonly HIGH_VALUE_KEYWORDS = [
    'EQIP', 'CSP', 'Conservation Stewardship', 'Environmental Quality Incentives',
    'VAPG', 'Value-Added Producer', 'SCBGP', 'Specialty Crop Block Grant',
    'LAMP', 'Local Agriculture Market Program', 'LFPP', 'Local Food Promotion',
    'FMPP', 'Farmers Market Promotion', 'Farm to School', 'DBI', 'Dairy Business Innovation',
    'REAP', 'Rural Energy for America', 'MPPEP', 'Meat and Poultry Processing',
    'CRP', 'Conservation Reserve', 'ACEP', 'Agricultural Conservation Easement',
    'RCPP', 'Regional Conservation Partnership', 'WRP', 'Wetlands Reserve',
    'application deadline', 'signup period', 'funding available', 'cost-share',
    'technical assistance', 'financial assistance'
  ];

  /**
   * Initialize the comprehensive USDA service
   */
  async initialize(): Promise<boolean> {
    console.log('🚀 Initializing Comprehensive USDA Service...');
    console.log(`📋 Configured for ${this.STATE_CONFIGS.length} states and ${this.AGENCY_CONFIGS.length} agencies`);
    return true;
  }

  /**
   * Main sync method - orchestrates all USDA data collection including user-provided sources
   */
  async syncAllUsdaSources(): Promise<{ 
    nrcsPrograms: number; 
    agencyPrograms: number;
    additionalNews: number;
    totalStates: number;
    totalPrograms: number;
  }> {
    console.log('🔄 Starting comprehensive USDA sync...');
    const startTime = Date.now();

    const [nrcsResults, agencyResults] = await Promise.all([
      this.syncAllNrcsStates(),
      this.syncAllAgencyNews()
    ]);
    
    // Additional news URLs would be processed here in future enhancement
    const additionalResults = 0;

    const totalPrograms = nrcsResults + agencyResults + additionalResults;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Comprehensive USDA sync completed in ${duration}s`);
    console.log(`📊 Results: ${nrcsResults} NRCS + ${agencyResults} Agency + ${additionalResults} Additional = ${totalPrograms} total programs`);

    return {
      nrcsPrograms: nrcsResults,
      agencyPrograms: agencyResults,
      additionalNews: additionalResults,
      totalStates: this.STATE_CONFIGS.length,
      totalPrograms
    };
  }

  /**
   * Sync NRCS programs from all configured states
   */
  private async syncAllNrcsStates(): Promise<number> {
    console.log('🌾 Syncing NRCS programs from all states...');
    
    let totalPrograms = 0;
    const concurrencyLimit = this.MAX_CONCURRENT_REQUESTS;
    
    // Process states in batches to avoid overwhelming servers
    for (let i = 0; i < this.STATE_CONFIGS.length; i += concurrencyLimit) {
      const batch = this.STATE_CONFIGS.slice(i, i + concurrencyLimit);
      
      const batchResults = await Promise.allSettled(
        batch.map(state => this.syncSingleNrcsState(state))
      );
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          totalPrograms += result.value;
        } else {
          console.error('❌ State sync failed:', result.reason);
        }
      }
      
      // Small delay between batches to be respectful
      if (i + concurrencyLimit < this.STATE_CONFIGS.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ NRCS sync completed: ${totalPrograms} programs from ${this.STATE_CONFIGS.length} states`);
    return totalPrograms;
  }

  /**
   * Sync NRCS programs from a single state
   */
  private async syncSingleNrcsState(state: StateConfig): Promise<number> {
    try {
      console.log(`🏛️  Syncing ${state.name} NRCS programs...`);
      
      // Try multiple URL patterns for the state
      let newsListings: Array<any> = [];
      for (const url of state.nrcsUrls) {
        try {
          newsListings = await this.fetchNrcsNewsListings(url);
          if (newsListings.length > 0) {
            console.log(`✅ ${state.name} successful with: ${url}`);
            break; // Success! Use this URL pattern
          }
        } catch (error) {
          console.log(`⚠️  ${state.name} failed with ${url}, trying next pattern...`);
          continue; // Try next URL pattern
        }
      }
      
      if (newsListings.length === 0) {
        console.log(`📭 ${state.name}: No announcements found with any URL pattern`);
        return 0;
      }
      
      const programs: InsertSubsidyProgram[] = [];
      
      // Process up to 10 most recent announcements per state
      const recentAnnouncements = newsListings.slice(0, 10);
      
      for (const announcement of recentAnnouncements) {
        try {
          const program = await this.processNrcsAnnouncement(announcement, state);
          if (program) {
            programs.push(program);
          }
        } catch (error) {
          console.warn(`❌ Failed to process announcement ${announcement.title}
            ${announcement.summary || announcement.url}: ${error}`);
        }
      }
      
      // Store programs
      for (const program of programs) {
        await storage.createSubsidyProgram(program);
      }
      
      console.log(`✅ ${state.name}: ${programs.length} programs processed`);
      return programs.length;
      
    } catch (error) {
      console.error(`❌ Failed to sync ${state.name}:`, error);
      return 0;
    }
  }

  /**
   * Fetch NRCS news listings from a state page
   */
  private async fetchNrcsNewsListings(baseUrl: string): Promise<Array<{
    title: string;
    url: string;
    pubDate?: string;
    summary?: string;
  }>> {
    try {
      const response = await this.fetchWithRetry(baseUrl);
      const $ = cheerio.load(response);
      const listings: Array<any> = [];

      // Parse different NRCS news page formats
      // Format 1: News item cards
      $('.news-item, .media, .view-content .views-row').each((_, element) => {
        const $item = $(element);
        const titleEl = $item.find('h3 a, h2 a, .field-content a, .views-field-title a').first();
        const title = titleEl.text().trim();
        const relativeUrl = titleEl.attr('href');
        
        if (title && relativeUrl && this.isRelevantProgram(title)) {
          const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : new URL(relativeUrl, baseUrl).toString();
          const pubDate = $item.find('.date, .datetime, .views-field-created').text().trim();
          const summary = $item.find('.summary, .teaser, .views-field-body').text().trim();
          
          listings.push({
            title,
            url: fullUrl,
            pubDate: pubDate || null,
            summary: summary || null
          });
        }
      });

      // Format 2: Simple list items
      if (listings.length === 0) {
        $('ul li a, .item-list li a').each((_, element) => {
          const $link = $(element);
          const title = $link.text().trim();
          const relativeUrl = $link.attr('href');
          
          if (title && relativeUrl && this.isRelevantProgram(title)) {
            const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : new URL(relativeUrl, baseUrl).toString();
            listings.push({
              title,
              url: fullUrl
            });
          }
        });
      }

      console.log(`📄 Found ${listings.length} relevant announcements from ${baseUrl}`);
      return listings;
      
    } catch (error) {
      console.error('❌ Failed to fetch NRCS listings:', error);
      return [];
    }
  }

  /**
   * Process a single NRCS announcement into a subsidy program
   */
  private async processNrcsAnnouncement(
    announcement: { title: string; url: string; pubDate?: string; summary?: string },
    state: StateConfig
  ): Promise<InsertSubsidyProgram | null> {
    try {
      console.log(`📄 Processing: ${announcement.title}`);
      
      // Validate URL before processing
      if (!this.isValidUrl(announcement.url)) {
        console.warn(`⚠️  Invalid URL skipped: ${announcement.url}`);
        return null;
      }
      
      const content = await this.fetchWithRetry(announcement.url);
      const $ = cheerio.load(content);
      
      // Enhanced content extraction with multiple selectors and validation
      const contentSelectors = [
        '.field-body, .content, .main-content, article',
        '.node-content, .page-content, .entry-content',
        '.body, .text, .description, .announcement-content',
        '.views-field-body, .field-item, .field-content'
      ];
      
      let fullContent = '';
      for (const selector of contentSelectors) {
        const extractedContent = $(selector).text().trim();
        if (extractedContent.length > fullContent.length) {
          fullContent = extractedContent;
        }
      }
      
      // Validate extracted content
      if (!fullContent || fullContent.length < 100) {
        console.warn(`⚠️  Insufficient content extracted from ${announcement.url} (${fullContent.length} chars)`);
        // Fall back to page title and summary if available
        const pageTitle = $('title').text() || $('h1').first().text();
        fullContent = `${pageTitle}\n${announcement.summary || ''}\n${fullContent}`.trim();
      }
      const deadline = this.extractDeadline(fullContent);
      const fundingAmount = this.extractFundingAmount(fullContent);
      const programs = this.extractProgramTypes(fullContent);
      const counties = this.extractCounties(fullContent);
      
      // Determine if high priority
      const isHighPriority = this.HIGH_VALUE_KEYWORDS.some(keyword => 
        announcement.title.toLowerCase().includes(keyword.toLowerCase()) ||
        fullContent.toLowerCase().includes(keyword.toLowerCase())
      );
      
      const program: InsertSubsidyProgram = {
        id: `nrcs-${state.code}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: announcement.title,
        summary: announcement.summary || this.extractSummary(fullContent),
        category: this.categorizeProgram(announcement.title, fullContent),
        publishedDate: this.parseDate(announcement.pubDate) || new Date(),
        url: announcement.url,
        fundingAmount: fundingAmount,
        deadline: deadline,
        location: counties ? `${counties}, ${state.name}` : state.name,
        program: programs.join(', ') || 'NRCS Conservation Programs',
        
        // Multi-source metadata
        dataSource: 'nrcs_web_scraper',
        sourceUrl: announcement.url,
        sourceAgency: 'USDA-NRCS',
        country: 'US',
        region: state.name,
        
        // Enhanced metadata
        opportunityNumber: this.extractOpportunityNumber(fullContent),
        eligibilityTypes: ['farm', 'producer', 'landowner'],
        fundingTypes: this.determineFundingTypes(fullContent),
        
        // Priority and alerts
        isHighPriority: isHighPriority ? 'true' : 'false',
        alertReason: isHighPriority ? 'High-value USDA conservation program' : null,
        
        // Deduplication
        dedupeKey: this.generateDedupeKey(announcement.title, state.name, deadline),
        mergedFromSources: ['nrcs_web_scraper']
      };
      
      return program;
      
    } catch (error) {
      console.error(`❌ Failed to process announcement ${announcement.title}:`, error);
      return null;
    }
  }

  /**
   * Sync all USDA agency news sources
   */
  private async syncAllAgencyNews(): Promise<number> {
    console.log('🏛️  Syncing USDA agency news sources...');
    
    let totalPrograms = 0;
    
    for (const agency of this.AGENCY_CONFIGS) {
      try {
        const programs = await this.syncAgencyNews(agency);
        totalPrograms += programs;
        console.log(`✅ ${agency.name}: ${programs} programs processed`);
      } catch (error) {
        console.error(`❌ Failed to sync ${agency.name}:`, error);
      }
    }
    
    return totalPrograms;
  }

  /**
   * Sync news from a single USDA agency
   */
  private async syncAgencyNews(agency: AgencyConfig): Promise<number> {
    try {
      const newsUrl = `${agency.baseUrl}${agency.newsPath}`;
      const response = await this.fetchWithRetry(newsUrl);
      const $ = cheerio.load(response);
      
      const announcements: Array<any> = [];
      
      // Parse agency news listings
      $('.news-item, .media, .item, .view-content .views-row').each((_, element) => {
        const $item = $(element);
        const titleEl = $item.find('h3 a, h2 a, h4 a, .title a, .field-content a').first();
        const title = titleEl.text().trim();
        const relativeUrl = titleEl.attr('href');
        
        if (title && relativeUrl && this.isRelevantToAgriculture(title, agency.keywords)) {
          const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : new URL(relativeUrl, agency.baseUrl).toString();
          const pubDate = $item.find('.date, .datetime, .published').text().trim();
          
          announcements.push({
            title,
            url: fullUrl,
            pubDate: pubDate || null,
            agency: agency.name
          });
        }
      });
      
      // Process announcements
      const programs: InsertSubsidyProgram[] = [];
      for (const announcement of announcements.slice(0, 5)) { // Limit to 5 per agency
        try {
          const program = await this.processAgencyAnnouncement(announcement, agency);
          if (program) {
            programs.push(program);
          }
        } catch (error) {
          console.warn(`⚠️  Failed to process ${agency.name} announcement:`, error);
        }
      }
      
      // Store programs
      for (const program of programs) {
        await storage.createSubsidyProgram(program);
      }
      
      return programs.length;
      
    } catch (error) {
      console.error(`❌ Failed to sync ${agency.name}:`, error);
      return 0;
    }
  }

  /**
   * Process a single agency announcement
   */
  private async processAgencyAnnouncement(
    announcement: { title: string; url: string; pubDate?: string; agency: string },
    agency: AgencyConfig
  ): Promise<InsertSubsidyProgram | null> {
    try {
      const content = await this.fetchWithRetry(announcement.url);
      const $ = cheerio.load(content);
      
      const fullContent = $('.content, .main-content, article, .body').text();
      const deadline = this.extractDeadline(fullContent);
      const fundingAmount = this.extractFundingAmount(fullContent);
      
      const program: InsertSubsidyProgram = {
        id: `${agency.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: announcement.title,
        summary: this.extractSummary(fullContent),
        category: this.categorizeProgram(announcement.title, fullContent),
        publishedDate: this.parseDate(announcement.pubDate) || new Date(),
        url: announcement.url,
        fundingAmount: fundingAmount,
        deadline: deadline,
        location: 'United States',
        program: `USDA ${agency.name} Programs`,
        
        // Multi-source metadata
        dataSource: `usda_${agency.name.toLowerCase()}_scraper`,
        sourceUrl: announcement.url,
        sourceAgency: `USDA-${agency.name}`,
        country: 'US',
        region: null,
        
        // Enhanced metadata
        eligibilityTypes: ['farm', 'producer', 'organization'],
        fundingTypes: this.determineFundingTypes(fullContent),
        
        // Priority
        isHighPriority: 'false',
        
        // Deduplication
        dedupeKey: this.generateDedupeKey(announcement.title, agency.name, deadline),
        mergedFromSources: [`usda_${agency.name.toLowerCase()}_scraper`]
      };
      
      return program;
      
    } catch (error) {
      console.error(`❌ Failed to process agency announcement:`, error);
      return null;
    }
  }

  // Utility methods for data extraction and processing

  private isRelevantProgram(title: string): boolean {
    const lowerTitle = title.toLowerCase();
    return this.HIGH_VALUE_KEYWORDS.some(keyword => 
      lowerTitle.includes(keyword.toLowerCase())
    ) || lowerTitle.includes('deadline') || lowerTitle.includes('signup') || lowerTitle.includes('funding');
  }

  private isRelevantToAgriculture(title: string, keywords: string[]): boolean {
    const lowerTitle = title.toLowerCase();
    return keywords.some(keyword => lowerTitle.includes(keyword));
  }

  private extractDeadline(content: string): Date | null {
    // Enhanced deadline extraction
    const deadlinePatterns = [
      /(?:deadline|due|closes?|ends?)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
      /(?:applications?\s+(?:must\s+be\s+)?(?:received|submitted)\s+by)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
      /(?:by|before)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s*deadline/gi
    ];

    for (const pattern of deadlinePatterns) {
      const match = content.match(pattern);
      if (match) {
        const dateStr = match[0].replace(/^.*?([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}).*$/, '$1');
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && parsed > new Date()) {
          return parsed;
        }
      }
    }
    return null;
  }

  private extractFundingAmount(content: string): string | null {
    const fundingPatterns = [
      /\$[\d,]+(?:\.\d{2})?\s*(?:million|billion|thousand|k|m|b)?/gi,
      /(?:up\s+to|maximum\s+of|total\s+of)\s*\$[\d,]+/gi,
      /funding\s*:?\s*\$[\d,]+/gi
    ];

    for (const pattern of fundingPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  private extractSummary(content: string): string {
    // Extract first paragraph or meaningful content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 50);
    return sentences.slice(0, 2).join('. ').substring(0, 300) + '...';
  }

  private extractProgramTypes(content: string): string[] {
    const programs: string[] = [];
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('eqip') || lowerContent.includes('environmental quality incentives')) {
      programs.push('EQIP');
    }
    if (lowerContent.includes('csp') || lowerContent.includes('conservation stewardship')) {
      programs.push('CSP');
    }
    if (lowerContent.includes('crp') || lowerContent.includes('conservation reserve')) {
      programs.push('CRP');
    }
    if (lowerContent.includes('acep') || lowerContent.includes('agricultural conservation easement')) {
      programs.push('ACEP');
    }
    
    return programs;
  }

  private extractCounties(content: string): string | null {
    const countyPattern = /([A-Z][a-z]+\s+County)/g;
    const matches = content.match(countyPattern);
    if (matches && matches.length > 0) {
      return matches.slice(0, 3).join(', '); // Limit to first 3 counties
    }
    return null;
  }

  private extractOpportunityNumber(content: string): string | null {
    const patterns = [
      /(?:opportunity|program|announcement)\s*#?\s*([A-Z0-9-]+)/gi,
      /NRCS-\w+-\d+/gi
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  private categorizeProgram(title: string, content: string): string {
    const lowerTitle = title.toLowerCase();
    const lowerContent = content.toLowerCase();
    
    if (lowerTitle.includes('conservation') || lowerContent.includes('conservation')) {
      return 'Conservation';
    }
    if (lowerTitle.includes('marketing') || lowerContent.includes('marketing')) {
      return 'Marketing';
    }
    if (lowerTitle.includes('disaster') || lowerContent.includes('disaster')) {
      return 'Disaster Assistance';
    }
    if (lowerTitle.includes('rural') || lowerContent.includes('rural development')) {
      return 'Rural Development';
    }
    return 'Agricultural Support';
  }

  private determineFundingTypes(content: string): string[] {
    const types: string[] = [];
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('grant') || lowerContent.includes('cost-share')) {
      types.push('grant');
    }
    if (lowerContent.includes('loan') || lowerContent.includes('financing')) {
      types.push('loan');
    }
    if (lowerContent.includes('technical assistance')) {
      types.push('technical_assistance');
    }
    if (lowerContent.includes('incentive') || lowerContent.includes('payment')) {
      types.push('incentive_payment');
    }
    
    return types.length > 0 ? types : ['grant'];
  }

  private parseDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return !isNaN(parsed.getTime()) ? parsed : null;
  }

  private calculateDaysUntilDeadline(deadline: Date): number {
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private generateDedupeKey(title: string, location: string, deadline: Date | null): string {
    const key = `${title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${location.toLowerCase().replace(/[^a-z0-9]/g, '')}-${deadline ? deadline.toISOString().split('T')[0] : 'no-deadline'}`;
    return key.substring(0, 100); // Limit length
  }

  /**
   * Validate URL format and accessibility
   */
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
        
        // Exponential backoff with jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('All retry attempts failed');
  }
}

export const comprehensiveUsdaService = new ComprehensiveUsdaService();