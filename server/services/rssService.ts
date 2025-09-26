import { rssParser } from './rssParser';
import { storage } from '../storage';
import fs from 'fs/promises';
import path from 'path';

export class RssService {
  // TEMPORARY: Using NZ MPI feed since Canada.ca feed is broken 
  // TODO: Hook up Canada.ca via Feedly once URL is fixed
  private readonly RSS_FEED_URL = 'https://www.mpi.govt.nz/news/media-releases/rss.xml';
  private lastFetchTime: Date | null = null;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Fetch live RSS feed from Canada.ca
   */
  private async fetchRssContent(): Promise<string> {
    const maxRetries = 3;
    const timeout = 30000; // 30 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching live RSS data from Canada.ca (attempt ${attempt}/${maxRetries})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(this.RSS_FEED_URL, {
          headers: {
            'User-Agent': 'SubsidyCompanion/1.0 (Agricultural Funding Intelligence Platform)',
            'Accept': 'application/atom+xml, application/xml, text/xml'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const content = await response.text();
          console.log(`Successfully fetched ${content.length} bytes of RSS data`);
          return content;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`RSS fetch attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw new Error(`Failed to fetch live RSS data after ${maxRetries} attempts: ${error}`);
        }
        // Exponential backoff: wait 2^attempt seconds
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw new Error('RSS fetch failed after all retry attempts');
  }


  /**
   * Sync RSS feed data to storage
   */
  async syncRssData(): Promise<void> {
    try {
      console.log('Syncing live RSS data from Canada.ca...');
      
      const xmlContent = await this.fetchRssContent();
      const programs = await rssParser.processRssFeed(xmlContent);
      
      console.log(`Parsed ${programs.length} entries from live RSS feed`);
      
      // Enrich programs with required metadata and filter to active programs only
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      const enrichedPrograms = programs.map(program => ({
        ...program,
        dataSource: 'nz_mpi_rss', // Updated to reflect actual source
        sourceUrl: program.url || program.id,
        sourceAgency: 'Ministry for Primary Industries (NZ)', // Updated to reflect actual source
        country: 'NZ', // Updated to reflect actual source
        region: program.location || null,
        eligibilityTypes: ['farm', 'producer', 'organization'],
        fundingTypes: ['grant', 'support', 'program'],
        mergedFromSources: ['nz_mpi_rss'] // Updated to reflect actual source
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

      // Clear existing programs and add new ones  
      const existingPrograms = await storage.getSubsidyPrograms();
      
      // Delete existing programs
      await Promise.all(
        existingPrograms.map(program => storage.deleteSubsidyProgram(program.id))
      );

      // Add new active programs
      await Promise.all(
        enrichedPrograms.map(program => storage.createSubsidyProgram(program))
      );

      this.lastFetchTime = new Date();
      console.log(`Live RSS sync completed successfully - ${enrichedPrograms.length} active programs stored`);
      
    } catch (error) {
      console.error('Failed to sync live RSS data:', error);
      throw error; // Re-throw to surface the issue - we want live data, not degraded mode
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
      await this.syncRssData();
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