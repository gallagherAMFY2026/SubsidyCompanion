import { InsertSubsidyProgram } from '@shared/schema';
import { storage } from '../storage';
import * as cheerio from 'cheerio';

/**
 * State-Specific Agricultural Funding Scraper Service
 * 
 * Specialized scraper for the top 8 agricultural states by production value.
 * Goes beyond USDA sources to capture state agriculture departments,
 * extension services, and regional agricultural agencies.
 */

interface StateConfig {
  code: string;
  name: string;
  agencies: AgencyConfig[];
}

interface AgencyConfig {
  name: string;
  baseUrl: string;
  newsPath: string;
  type: 'state_dept' | 'extension' | 'regional';
  keywords: string[];
  selectors?: {
    listItems?: string[];
    titleSelectors?: string[];
    linkSelectors?: string[];
    dateSelectors?: string[];
    contentSelectors?: string[];
  };
}

export class StateSpecificScraperService {
  private readonly MAX_RETRIES = 3;
  private readonly REQUEST_TIMEOUT = 30000;
  private readonly MAX_CONCURRENT_REQUESTS = 3; // Conservative for state sites
  private readonly DELAY_BETWEEN_BATCHES = 2000;
  
  private readonly USER_AGENT = 'Mozilla/5.0 (compatible; SubsidyCompanion/1.0; Agricultural Funding Research)';

  // Top 8 agricultural states by production value (2024)
  private readonly STATE_CONFIGS: StateConfig[] = [
    {
      code: 'CA',
      name: 'California',
      agencies: [
        {
          name: 'CDFA',
          baseUrl: 'https://www.cdfa.ca.gov',
          newsPath: '/news-events/press-releases',
          type: 'state_dept',
          keywords: ['grant', 'funding', 'healthy soils', 'climate smart', 'specialty crop', 'SWEEP', 'AMMP', 'farm to school']
        },
        {
          name: 'UC Cooperative Extension',
          baseUrl: 'https://ucanr.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['grant', 'funding', 'research', 'extension', 'agriculture', 'sustainability']
        }
      ]
    },
    {
      code: 'IA',
      name: 'Iowa',
      agencies: [
        {
          name: 'Iowa Department of Agriculture',
          baseUrl: 'https://iowaagriculture.gov',
          newsPath: '/news',
          type: 'state_dept',
          keywords: ['grant', 'Choose Iowa', 'value-added', 'specialty crop', 'food systems', 'infrastructure']
        },
        {
          name: 'Iowa State Extension',
          baseUrl: 'https://extension.iastate.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'research', 'development']
        }
      ]
    },
    {
      code: 'NE',
      name: 'Nebraska',
      agencies: [
        {
          name: 'Nebraska Department of Agriculture',
          baseUrl: 'https://nda.nebraska.gov',
          newsPath: '/news',
          type: 'state_dept',
          keywords: ['grant', 'specialty crop', 'RFSI', 'food systems', 'infrastructure', 'SCBGP']
        },
        {
          name: 'University of Nebraska Extension',
          baseUrl: 'https://extension.unl.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'sustainability', 'research']
        }
      ]
    },
    {
      code: 'TX',
      name: 'Texas',
      agencies: [
        {
          name: 'Texas Department of Agriculture',
          baseUrl: 'https://texasagriculture.gov',
          newsPath: '/News-Events/Press-Releases',
          type: 'state_dept',
          keywords: ['grant', 'TxCDBG', 'specialty crop', 'rural development', 'local food', 'infrastructure']
        },
        {
          name: 'Texas A&M AgriLife Extension',
          baseUrl: 'https://agrilifeextension.tamu.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'research', 'development']
        }
      ]
    },
    {
      code: 'KS',
      name: 'Kansas',
      agencies: [
        {
          name: 'Kansas Department of Agriculture',
          baseUrl: 'https://agriculture.ks.gov',
          newsPath: '/news-events/news',
          type: 'state_dept',
          keywords: ['grant', 'specialty crop', 'RFSI', 'food systems', 'SARE', 'sustainable agriculture']
        },
        {
          name: 'K-State Research and Extension',
          baseUrl: 'https://ksre.k-state.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'research', 'extension']
        }
      ]
    },
    {
      code: 'IL',
      name: 'Illinois',
      agencies: [
        {
          name: 'Illinois Department of Agriculture',
          baseUrl: 'https://agr.illinois.gov',
          newsPath: '/news',
          type: 'state_dept',
          keywords: ['grant', 'specialty crop', 'local food', 'infrastructure', 'LFPA', 'food safety']
        },
        {
          name: 'University of Illinois Extension',
          baseUrl: 'https://extension.illinois.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'collaboration', 'research']
        }
      ]
    },
    {
      code: 'MN',
      name: 'Minnesota',
      agencies: [
        {
          name: 'Minnesota Department of Agriculture',
          baseUrl: 'https://www.mda.state.mn.us',
          newsPath: '/news',
          type: 'state_dept',
          keywords: ['grant', 'AGRI', 'value-added', 'beginning farmer', 'sustainable agriculture', 'urban agriculture']
        },
        {
          name: 'University of Minnesota Extension',
          baseUrl: 'https://extension.umn.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'research', 'financial help']
        }
      ]
    },
    {
      code: 'WI',
      name: 'Wisconsin',
      agencies: [
        {
          name: 'Wisconsin DATCP',
          baseUrl: 'https://datcp.wi.gov',
          newsPath: '/Pages/News_Media/news.aspx',
          type: 'state_dept',
          keywords: ['grant', 'Buy Local', 'specialty crop', 'tribal', 'dairy processor', 'food systems']
        },
        {
          name: 'UW Extension',
          baseUrl: 'https://extension.wisc.edu',
          newsPath: '/news',
          type: 'extension',
          keywords: ['funding', 'grant', 'agriculture', 'innovation', 'SARE', 'research']
        }
      ]
    }
  ];

  // High-value program keywords for enhanced detection
  private readonly HIGH_VALUE_KEYWORDS = [
    // Federal program extensions at state level
    'EQIP', 'CSP', 'Conservation Stewardship', 'Environmental Quality Incentives',
    'RCPP', 'Regional Conservation Partnership', 'CRP', 'Conservation Reserve',
    
    // State-specific high-value programs
    'Choose Iowa', 'Healthy Soils', 'SWEEP', 'Climate Smart', 'AGRI', 'TxCDBG',
    'Buy Local', 'RFSI', 'Food Systems Infrastructure', 'Value-Added Producer',
    'Beginning Farmer', 'Specialty Crop Block Grant', 'Farm to School',
    
    // High-dollar indicators
    'million', 'Million', '$M', 'billion', 'Billion', '$B'
  ];

  /**
   * Main entry point for state-specific scraping
   */
  async syncAllStates(): Promise<number> {
    console.log('🏛️  Starting state-specific agricultural funding scraper...');
    
    let totalPrograms = 0;
    
    for (const state of this.STATE_CONFIGS) {
      try {
        const statePrograms = await this.syncStateAgencies(state);
        totalPrograms += statePrograms;
        console.log(`✅ ${state.name}: ${statePrograms} programs processed`);
        
        // Delay between states to avoid overwhelming servers
        await this.delay(this.DELAY_BETWEEN_BATCHES);
        
      } catch (error) {
        console.error(`❌ Failed to sync ${state.name}:`, error);
      }
    }
    
    console.log(`🎯 State-specific scraping completed: ${totalPrograms} total programs`);
    return totalPrograms;
  }

  /**
   * Sync all agencies for a specific state
   */
  private async syncStateAgencies(state: StateConfig): Promise<number> {
    console.log(`🌾 Syncing ${state.name} agricultural agencies...`);
    
    let totalPrograms = 0;
    
    for (const agency of state.agencies) {
      try {
        const programs = await this.syncAgency(agency, state);
        totalPrograms += programs;
        console.log(`  ✅ ${agency.name}: ${programs} programs processed`);
      } catch (error) {
        console.error(`  ❌ Failed to sync ${agency.name}:`, error);
      }
    }
    
    return totalPrograms;
  }

  /**
   * Sync a single state agency
   */
  private async syncAgency(agency: AgencyConfig, state: StateConfig): Promise<number> {
    try {
      const newsUrl = `${agency.baseUrl}${agency.newsPath}`;
      const response = await this.fetchWithRetry(newsUrl);
      const $ = cheerio.load(response);
      
      const announcements: Array<any> = [];
      
      // Parse agency news listings with enhanced selectors
      const listSelectors = agency.selectors?.listItems || [
        '.news-item, .media, .item, .view-content .views-row',
        '.press-release, .news-article, .announcement',
        '.post, .entry, .content-item'
      ];
      
      for (const selector of listSelectors) {
        if (announcements.length >= 10) break; // Limit per selector
        
        $(selector).each((_, element) => {
          const $item = $(element);
          
          // Enhanced title extraction
          const titleSelectors = agency.selectors?.titleSelectors || [
            'h3 a, h2 a, h4 a, .title a, .field-content a',
            '.headline a, .news-title a, .entry-title a'
          ];
          
          let titleEl: cheerio.Cheerio<any> | null = null;
          let title = '';
          let relativeUrl = '';
          
          for (const titleSelector of titleSelectors) {
            titleEl = $item.find(titleSelector).first();
            if (titleEl.length) {
              title = titleEl.text().trim();
              relativeUrl = titleEl.attr('href') || '';
              if (title && relativeUrl) break;
            }
          }
          
          if (title && relativeUrl && this.isRelevantToAgriculture(title, agency.keywords)) {
            const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : new URL(relativeUrl, agency.baseUrl).toString();
            
            // Enhanced date extraction
            const dateSelectors = agency.selectors?.dateSelectors || [
              '.date, .datetime, .published, .post-date',
              '.news-date, .timestamp, .created'
            ];
            
            let pubDate = '';
            for (const dateSelector of dateSelectors) {
              pubDate = $item.find(dateSelector).text().trim();
              if (pubDate) break;
            }
            
            announcements.push({
              title,
              url: fullUrl,
              pubDate: pubDate || null,
              agency: agency.name,
              state: state.code
            });
          }
        });
      }
      
      // Process announcements
      const programs: InsertSubsidyProgram[] = [];
      for (const announcement of announcements.slice(0, 5)) { // Limit to 5 per agency
        try {
          const program = await this.processStateAnnouncement(announcement, agency, state);
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
   * Process a single state agency announcement
   */
  private async processStateAnnouncement(
    announcement: { title: string; url: string; pubDate?: string; agency: string; state: string },
    agency: AgencyConfig,
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
      
      // Enhanced content extraction for state websites
      const contentSelectors = [
        '.content, .main-content, article, .body',
        '.news-content, .press-release-content, .page-content',
        '.entry-content, .post-content, .announcement-body',
        '.field-body, .field-content, .description'
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
        console.warn(`⚠️  Insufficient content extracted from ${announcement.url}`);
        const pageTitle = $('title').text() || $('h1').first().text();
        fullContent = `${pageTitle}\n${announcement.title}\n${fullContent}`.trim();
      }
      
      // Extract program details
      const deadline = this.extractDeadline(fullContent);
      const fundingAmount = this.extractFundingAmount(fullContent);
      const programs = this.extractProgramTypes(fullContent);
      
      // Determine if high priority
      const isHighPriority = this.HIGH_VALUE_KEYWORDS.some(keyword => 
        announcement.title.toLowerCase().includes(keyword.toLowerCase()) ||
        fullContent.toLowerCase().includes(keyword.toLowerCase())
      );
      
      const program: InsertSubsidyProgram = {
        id: `${state.code.toLowerCase()}-${agency.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: announcement.title,
        summary: this.extractSummary(fullContent),
        category: this.categorizeProgram(announcement.title, fullContent),
        publishedDate: this.parseDate(announcement.pubDate) || new Date(),
        url: announcement.url,
        fundingAmount: fundingAmount,
        deadline: deadline,
        location: state.name,
        program: programs.join(', ') || `${state.name} ${agency.name} Programs`,
        
        // Multi-source metadata
        dataSource: 'state_specific_scraper',
        sourceUrl: announcement.url,
        sourceAgency: announcement.agency,
        country: 'US',
        region: state.name,
        
        // Enhanced metadata
        opportunityNumber: this.extractOpportunityNumber(fullContent),
        eligibilityTypes: this.determineEligibilityTypes(fullContent, agency.type),
        fundingTypes: this.determineFundingTypes(fullContent),
        
        // Priority and alerts
        isHighPriority: isHighPriority ? 'true' : 'false',
        alertReason: isHighPriority ? `High-value ${state.name} agricultural program` : null,
        
        // Deduplication
        dedupeKey: this.generateDedupeKey(announcement.title, state.name, deadline),
        mergedFromSources: ['state_specific_scraper']
      };
      
      return program;
      
    } catch (error) {
      console.error(`❌ Failed to process announcement ${announcement.title}:`, error);
      return null;
    }
  }

  /**
   * Check if content is relevant to agriculture funding
   */
  private isRelevantToAgriculture(title: string, keywords: string[]): boolean {
    const lowerTitle = title.toLowerCase();
    
    // Check for general agricultural funding terms
    const generalTerms = [
      'grant', 'funding', 'assistance', 'program', 'opportunity',
      'agriculture', 'farm', 'farmer', 'rural', 'conservation',
      'specialty crop', 'food systems', 'extension', 'research'
    ];
    
    const hasGeneralTerm = generalTerms.some(term => lowerTitle.includes(term));
    const hasSpecificKeyword = keywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
    
    return hasGeneralTerm || hasSpecificKeyword;
  }

  /**
   * Determine eligibility types based on content and agency type
   */
  private determineEligibilityTypes(content: string, agencyType: string): string[] {
    const lowerContent = content.toLowerCase();
    const types: string[] = [];
    
    if (lowerContent.includes('farmer') || lowerContent.includes('producer')) {
      types.push('farmer', 'producer');
    }
    if (lowerContent.includes('beginning farmer') || lowerContent.includes('new farmer')) {
      types.push('beginning_farmer');
    }
    if (lowerContent.includes('small farm') || lowerContent.includes('small-scale')) {
      types.push('small_farm');
    }
    if (lowerContent.includes('non-profit') || lowerContent.includes('nonprofit')) {
      types.push('nonprofit');
    }
    if (lowerContent.includes('university') || lowerContent.includes('research')) {
      types.push('university', 'research_institution');
    }
    if (agencyType === 'extension') {
      types.push('extension_educator', 'agricultural_professional');
    }
    
    return types.length > 0 ? types : ['farmer', 'producer'];
  }

  // ... [Additional helper methods would be implemented here, similar to comprehensiveUsdaService.ts]
  // Including: extractDeadline, extractFundingAmount, extractProgramTypes, etc.

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Fetch with retry logic and rate limiting
   */
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
        await this.delay(delay);
      }
    }
    
    throw new Error('All retry attempts failed');
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract deadline dates from content using multiple patterns
   */
  private extractDeadline(content: string): Date | null {
    const deadlinePatterns = [
      /deadline[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
      /due[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
      /applications must be received by[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
      /submit by[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{4}-\d{2}-\d{2})/g
    ];
    
    for (const pattern of deadlinePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime()) && date > new Date()) {
          return date;
        }
      }
    }
    return null;
  }

  /**
   * Extract funding amounts from content
   */
  private extractFundingAmount(content: string): string | null {
    const fundingPatterns = [
      /\$[\d,]+(?:\.\d{2})?\s*(?:million|M|k|thousand)?/gi,
      /up to \$[\d,]+/gi,
      /maximum of \$[\d,]+/gi,
      /funding[:\s]+\$[\d,]+/gi,
      /award[:\s]+\$[\d,]+/gi,
      /grant[:\s]+\$[\d,]+/gi
    ];
    
    for (const pattern of fundingPatterns) {
      const match = content.match(pattern);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return null;
  }

  /**
   * Extract program types/keywords from content
   */
  private extractProgramTypes(content: string): string[] {
    const types: string[] = [];
    const programKeywords = [
      'conservation', 'environmental', 'sustainable', 'organic', 'renewable',
      'research', 'development', 'innovation', 'technology', 'infrastructure',
      'education', 'training', 'outreach', 'marketing', 'export', 'trade',
      'livestock', 'crop', 'dairy', 'specialty', 'commodity', 'rural'
    ];
    
    const lowerContent = content.toLowerCase();
    for (const keyword of programKeywords) {
      if (lowerContent.includes(keyword)) {
        types.push(keyword);
      }
    }
    
    return types.slice(0, 5); // Limit to top 5 most relevant
  }

  /**
   * Extract meaningful summary from content
   */
  private extractSummary(content: string): string {
    const cleanContent = content
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    const sentences = cleanContent.split(/[.!?]+/);
    let summary = '';
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && !trimmed.match(/^(home|news|contact|about|menu)/i)) {
        summary += trimmed + '. ';
        if (summary.length > 150) break;
      }
    }
    
    return summary.trim() || cleanContent.substring(0, 200) + '...';
  }

  /**
   * Categorize program based on title and content
   */
  private categorizeProgram(title: string, content: string): string {
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    
    if (titleLower.includes('conservation') || contentLower.includes('conservation')) {
      return 'Conservation Program';
    }
    if (titleLower.includes('research') || contentLower.includes('research')) {
      return 'Research & Development';
    }
    if (titleLower.includes('export') || titleLower.includes('trade') || contentLower.includes('export')) {
      return 'Trade & Export';
    }
    if (titleLower.includes('beginning') || titleLower.includes('new farmer')) {
      return 'Beginning Farmer Program';
    }
    if (titleLower.includes('small farm') || contentLower.includes('small farm')) {
      return 'Small Farm Program';
    }
    
    return 'State Agricultural Program';
  }

  /**
   * Extract opportunity/program numbers
   */
  private extractOpportunityNumber(content: string): string | null {
    const idPatterns = [
      /opportunity[:\s#]+([A-Z0-9-]+)/i,
      /program[:\s#]+([A-Z0-9-]+)/i,
      /grant[:\s#]+([A-Z0-9-]+)/i,
      /funding[:\s#]+([A-Z0-9-]+)/i,
      /(?:ID|identifier)[:\s#]+([A-Z0-9-]+)/i,
      /(?:CFDA|ALN)[:\s#]+(\d{2}\.\d{3})/i
    ];
    
    for (const pattern of idPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Determine funding types from content
   */
  private determineFundingTypes(content: string): string[] {
    const types: string[] = [];
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('grant')) types.push('grant');
    if (lowerContent.includes('loan')) types.push('loan');
    if (lowerContent.includes('cost share') || lowerContent.includes('cost-share')) types.push('cost_share');
    if (lowerContent.includes('insurance')) types.push('insurance');
    if (lowerContent.includes('rebate')) types.push('rebate');
    if (lowerContent.includes('tax credit')) types.push('tax_credit');
    
    return types.length > 0 ? types : ['grant'];
  }
  private parseDate(dateStr?: string): Date | null { 
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return !isNaN(parsed.getTime()) ? parsed : null;
  }
  private generateDedupeKey(title: string, location: string, deadline: Date | null): string {
    const key = `${title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${location.toLowerCase().replace(/[^a-z0-9]/g, '')}-${deadline ? deadline.toISOString().split('T')[0] : 'no-deadline'}`;
    return key.substring(0, 100);
  }
}