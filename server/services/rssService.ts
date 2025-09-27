import { rssParser } from './rssParser';
import { storage } from '../storage';
import fs from 'fs/promises';
import path from 'path';

export class RssService {
  // Enhanced RSS service with fallback feeds and robust error handling
  private readonly PRIMARY_FEEDS = [
    {
      name: 'Canada AAFC',
      url: 'https://www.canada.ca/en/agriculture-agri-food/news.rss.xml',
      country: 'CA',
      fallbacks: [
        'https://www.agr.gc.ca/eng/news/?rss=1',
        'https://agriculture.canada.ca/en/news/rss',
        'https://feeds.feedburner.com/CanadaAgricultureNews'
      ]
    },
    {
      name: 'NZ Beehive', 
      url: 'https://www.beehive.govt.nz/rss.xml',
      country: 'NZ',
      fallbacks: ['https://www.mpi.govt.nz/news/media-releases/rss.xml']
    }
  ];
  
  private lastFetchTime: Date | null = null;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  /**
   * Fetch RSS content with enhanced error handling and fallbacks
   */
  private async fetchRssContentWithFallbacks(feedConfig: any): Promise<{ content: string; sourceUrl: string }> {
    const allUrls = [feedConfig.url, ...feedConfig.fallbacks];
    
    for (const url of allUrls) {
      try {
        console.log(`Attempting to fetch RSS from: ${url}`);
        const content = await this.fetchSingleRssFeed(url);
        return { content, sourceUrl: url };
      } catch (error) {
        console.warn(`Failed to fetch from ${url}:`, (error as Error).message);
        continue;
      }
    }
    
    throw new Error(`Failed to fetch RSS from ${feedConfig.name} - all URLs failed`);
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