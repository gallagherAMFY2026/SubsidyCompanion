import { rssParser } from './rssParser';
import { storage } from '../storage';
import fs from 'fs/promises';
import path from 'path';

export class RssService {
  // Enhanced RSS service with fallback feeds and RSS mixer services
  private readonly PRIMARY_FEEDS = [
    {
      name: 'Canada AAFC',
      url: 'https://www.canada.ca/en/agriculture-agri-food/news.rss.xml',
      country: 'CA',
      fallbacks: [
        'https://www.agr.gc.ca/eng/news/?rss=1',
        'https://agriculture.canada.ca/en/news/rss',
        'https://feeds.feedburner.com/CanadaAgricultureNews'
      ],
      mixerFallbacks: [
        'https://rss.app/feeds/canada-agriculture-news.xml',
        'https://fetchrss.com/rss/canada-agri-news.xml'
      ]
    },
    {
      name: 'NZ Beehive', 
      url: 'https://www.beehive.govt.nz/rss.xml',
      country: 'NZ',
      fallbacks: ['https://www.mpi.govt.nz/news/media-releases/rss.xml'],
      mixerFallbacks: []
    },
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
      console.log('Starting enhanced RSS sync with fallback support...');
      
      let totalPrograms = 0;
      const allPrograms: any[] = [];
      
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
            sourceAgency: this.getAgencyName(feedConfig.country),
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
   * Get agency name for country
   */
  private getAgencyName(country: string): string {
    switch (country) {
      case 'CA': return 'Agriculture and Agri-Food Canada';
      case 'NZ': return 'New Zealand Government';
      default: return 'Unknown Agency';
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