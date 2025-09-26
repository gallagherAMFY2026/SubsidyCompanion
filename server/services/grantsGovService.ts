import { storage } from '../storage';
import { partitionedDeduplicationService } from './deduplicationService.js';
import { InsertSubsidyProgram, SubsidyProgram } from '@shared/schema';
import { z } from 'zod';

// Validation schemas
export const grantsGovSearchSchema = z.object({
  rows: z.number().min(1).max(1000).optional().default(100),
  startRecordNum: z.number().min(0).optional().default(0),
  oppStatuses: z.string().optional().default('forecasted|posted|modified'),
  fundingCategories: z.string().optional().default('AG'),
  agencies: z.string().optional().default('USDA'),
  keyword: z.string().optional()
});

export type GrantsGovSearchParams = z.infer<typeof grantsGovSearchSchema>;

export interface GrantsGovOpportunity {
  number: string;
  title: string;
  agencyCode: string;
  openDate: string;
  closeDate: string;
  summary?: string;
  eligibilityTypes?: string[];
  fundingTypes?: string[];
  awardNumber?: string;
  fundingAmount?: string;
  version?: string;
  modifiedDate?: string;
}

export interface GrantsGovOpportunityDetail extends GrantsGovOpportunity {
  description?: string;
  eligibilityDescription?: string;
  awardFloor?: number;
  awardCeiling?: number;
  totalFunding?: number;
  expectedAwards?: number;
  costSharing?: boolean;
  grantsGovLink?: string;
}

export class GrantsGovService {
  private readonly BASE_URL = 'https://api.grants.gov/v1/api';
  private readonly USER_AGENT = 'AgFundingMonitor/1.0 (+alerts@example.com)';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly MAX_CONCURRENT_REQUESTS = 2;
  
  // High priority programs for alerts
  private readonly HIGH_PRIORITY_KEYWORDS = [
    'VAPG', 'SCBGP', 'LAMP', 'LFPP', 'FMPP', 'Farm to School', 
    'DBI', 'REAP', 'MPPEP', 'Value-Added Producer', 'Specialty Crop',
    'Local Food', 'Dairy Business Innovation', 'Meat and Poultry'
  ];

  private readonly PRIORITY_AGENCIES = ['USDA-AMS', 'USDA-FNS', 'USDA-RD'];

  /**
   * Sync all programs from grants.gov with US deduplication
   */
  async syncAllPrograms(maxPages?: number): Promise<number> {
    console.log('Starting comprehensive grants.gov program sync...');
    
    const processed = await this.syncOpportunities({}, maxPages);
    
    console.log(`All grants.gov programs sync completed: ${processed} processed`);
    return processed;
  }

  /**
   * Sync USDA agency opportunities specifically
   */
  async syncUSDAAgencyOpportunities(maxPages?: number): Promise<number> {
    console.log('Starting USDA agency-specific sync...');
    
    const usdaSearchParams = {
      agencies: 'USDA',
      fundingCategories: 'AG',
      oppStatuses: 'forecasted|posted|modified'
    };
    
    const processed = await this.syncOpportunities(usdaSearchParams, maxPages);
    
    console.log(`USDA agency sync completed: ${processed} processed`);
    return processed;
  }

  /**
   * Utility function for retrying requests with exponential backoff
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
        error.message?.includes('fetch failed') ||
        error.message?.includes('timeout') ||
        (error.status >= 500 && error.status < 600) ||
        error.status === 429;

      if (!isRetryable) {
        throw error;
      }

      // Handle rate limiting with Retry-After header
      const retryAfter = error.headers?.get?.('retry-after');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;

      console.log(`Retrying request in ${waitTime}ms. Retries left: ${retries - 1}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }

  /**
   * Make HTTP request with timeout and proper error handling
   */
  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': this.USER_AGENT,
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        (error as any).headers = response.headers;
        throw error;
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Validate search parameters using Zod schema
   */
  validateSearchParams(params: any): GrantsGovSearchParams {
    return grantsGovSearchSchema.parse(params);
  }

  /**
   * Search for grant opportunities using grants.gov search2 API with pagination
   */
  async searchOpportunities(params: GrantsGovSearchParams): Promise<GrantsGovOpportunity[]> {
    // Validate parameters
    const validatedParams = grantsGovSearchSchema.parse(params);
    return this.retryWithBackoff(() => this.performSearch(validatedParams));
  }

  /**
   * Search all opportunities with automatic pagination
   */
  async searchAllOpportunities(params: Partial<Omit<GrantsGovSearchParams, 'startRecordNum' | 'rows'>>): Promise<GrantsGovOpportunity[]> {
    // Apply defaults to parameters
    const searchParams = {
      oppStatuses: params.oppStatuses || 'forecasted|posted|modified',
      fundingCategories: params.fundingCategories || 'AG',
      agencies: params.agencies || 'USDA',
      keyword: params.keyword
    };
    const allOpportunities: GrantsGovOpportunity[] = [];
    const pageSize = 100; // Maximum allowed by API
    let startRecordNum = 0;
    let hasMoreResults = true;
    let totalFound = 0;

    console.log('Starting paginated search of grants.gov...');

    while (hasMoreResults) {
      const paginatedParams = {
        ...searchParams,
        rows: pageSize,
        startRecordNum
      };

      const opportunities = await this.searchOpportunities(paginatedParams);
      
      if (opportunities.length === 0) {
        hasMoreResults = false;
        break;
      }

      allOpportunities.push(...opportunities);
      totalFound += opportunities.length;
      startRecordNum += pageSize;

      // If we got fewer results than the page size, we've reached the end
      if (opportunities.length < pageSize) {
        hasMoreResults = false;
      }

      console.log(`Fetched page: ${startRecordNum / pageSize}, found ${opportunities.length} opportunities (total: ${totalFound})`);

      // Add delay between pages to be respectful
      if (hasMoreResults) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Completed paginated search: ${totalFound} total opportunities found`);
    return allOpportunities;
  }

  /**
   * Perform a single search request with proper error handling and logging
   */
  private async performSearch(params: GrantsGovSearchParams): Promise<GrantsGovOpportunity[]> {
    const startTime = Date.now();
    
    try {
      console.log('Searching grants.gov with params:', params);
      
      const searchPayload = {
        rows: params.rows,
        startRecordNum: params.startRecordNum,
        oppStatuses: params.oppStatuses,
        fundingCategories: params.fundingCategories,
        agencies: params.agencies,
        ...(params.keyword && { keyword: params.keyword })
      };

      const response = await this.makeRequest(`${this.BASE_URL}/search2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchPayload)
      });

      const data = await response.json();
      const opportunities: GrantsGovOpportunity[] = data.data?.oppHits || [];
      
      console.log(`Found ${opportunities.length} opportunities from grants.gov (page starting at ${params.startRecordNum})`);
      
      // Log the fetch
      await storage.createDataFetchLog({
        dataSourceId: 'grants_gov_search',
        status: 'success',
        itemsFound: opportunities.length.toString(),
        itemsProcessed: opportunities.length.toString(),
        responseTime: (Date.now() - startTime).toString(),
        httpStatus: response.status.toString(),
        lastModified: response.headers.get('last-modified'),
        etag: response.headers.get('etag')
      });

      return opportunities;
      
    } catch (error) {
      console.error('Error searching grants.gov:', error);
      
      // Log the error
      await storage.createDataFetchLog({
        dataSourceId: 'grants_gov_search',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        responseTime: (Date.now() - startTime).toString()
      });
      
      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Fetch detailed opportunity information using fetchOpportunity API
   */
  async fetchOpportunityDetail(opportunityNumber: string): Promise<GrantsGovOpportunityDetail | null> {
    const startTime = Date.now();
    
    try {
      console.log(`Fetching detailed opportunity: ${opportunityNumber}`);
      
      const response = await fetch(`${this.BASE_URL}/fetchOpportunity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.USER_AGENT,
        },
        body: JSON.stringify({
          opportunityNumber: opportunityNumber
        })
      });

      if (!response.ok) {
        throw new Error(`grants.gov fetchOpportunity error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const opportunity: GrantsGovOpportunityDetail = data.data?.opportunity;
      
      if (opportunity) {
        console.log(`Fetched detailed opportunity: ${opportunity.title}`);
      }
      
      // Log the fetch
      await storage.createDataFetchLog({
        dataSourceId: 'grants_gov_detail',
        status: opportunity ? 'success' : 'partial',
        itemsFound: opportunity ? '1' : '0',
        itemsProcessed: opportunity ? '1' : '0',
        responseTime: (Date.now() - startTime).toString(),
        httpStatus: response.status.toString()
      });

      return opportunity || null;
      
    } catch (error) {
      console.error(`Error fetching opportunity detail for ${opportunityNumber}:`, error);
      
      // Log the error
      await storage.createDataFetchLog({
        dataSourceId: 'grants_gov_detail',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        responseTime: (Date.now() - startTime).toString()
      });
      
      return null;
    }
  }

  /**
   * Convert grants.gov opportunity to our internal format with improved deduplication
   */
  private convertToSubsidyProgram(opportunity: GrantsGovOpportunity, detail?: GrantsGovOpportunityDetail): InsertSubsidyProgram {
    const isHighPriority = this.determineHighPriority(opportunity, detail);
    const alertReason = isHighPriority ? this.getAlertReason(opportunity, detail) : null;
    
    // Compute days until deadline
    const deadline = opportunity.closeDate ? new Date(opportunity.closeDate) : null;
    
    return {
      // Use opportunityNumber-based ID for better deduplication
      id: `grants-gov-${opportunity.number}-${opportunity.agencyCode}`,
      title: opportunity.title,
      summary: detail?.description || opportunity.summary || 'No description available',
      category: 'Federal Grant',
      publishedDate: opportunity.openDate ? new Date(opportunity.openDate) : new Date(),
      url: detail?.grantsGovLink || `https://www.grants.gov/search-results-detail/${opportunity.number}`,
      fundingAmount: this.formatFundingAmount(detail),
      deadline: deadline,
      location: 'United States',
      program: this.extractProgramName(opportunity.title),
      
      // Multi-source fields
      dataSource: 'grants_gov',
      sourceUrl: `${this.BASE_URL}/search2`,
      sourceAgency: opportunity.agencyCode,
      country: 'US',
      region: null, // Federal programs are nationwide
      
      // Enhanced metadata - opportunityNumber is the primary key for grants.gov
      opportunityNumber: opportunity.number,
      awardNumber: opportunity.awardNumber,
      eligibilityTypes: opportunity.eligibilityTypes || null,
      fundingTypes: opportunity.fundingTypes || ['grant'],
      
      // Priority fields
      isHighPriority: isHighPriority ? 'true' : null,
      alertReason: alertReason,
      
      // HTTP metadata
      sourceLastModified: opportunity.modifiedDate ? new Date(opportunity.modifiedDate) : null,
      sourceEtag: null,
      mergedFromSources: ['grants_gov'],
      conflictResolution: null
    };
  }

  /**
   * Compute deduplication key using opportunityNumber (primary) or fallback to normalized title+agency
   */
  private computeDedupeKey(opportunity: GrantsGovOpportunity): string {
    // Primary: Use opportunityNumber + agency for grants.gov
    if (opportunity.number && opportunity.agencyCode) {
      return `grants-gov-${opportunity.number}-${opportunity.agencyCode}`;
    }
    
    // Fallback: Use normalized title + agency
    const normalizedTitle = opportunity.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `grants-gov-${normalizedTitle.substring(0, 20)}-${opportunity.agencyCode}`;
  }

  /**
   * Determine if opportunity is high priority based on keywords and agencies
   */
  private determineHighPriority(opportunity: GrantsGovOpportunity, detail?: GrantsGovOpportunityDetail): boolean {
    const title = opportunity.title.toLowerCase();
    const summary = (detail?.description || opportunity.summary || '').toLowerCase();
    const agency = opportunity.agencyCode;
    
    // Check for high priority keywords
    const hasKeyword = this.HIGH_PRIORITY_KEYWORDS.some(keyword => 
      title.includes(keyword.toLowerCase()) || summary.includes(keyword.toLowerCase())
    );
    
    // Check for priority agencies
    const isPriorityAgency = this.PRIORITY_AGENCIES.includes(agency);
    
    // Check for upcoming deadline (within 21 days)
    const hasUpcomingDeadline = opportunity.closeDate && 
      new Date(opportunity.closeDate).getTime() - Date.now() <= (21 * 24 * 60 * 60 * 1000);
    
    return hasKeyword || isPriorityAgency || !!hasUpcomingDeadline;
  }

  /**
   * Get alert reason for high priority opportunities
   */
  private getAlertReason(opportunity: GrantsGovOpportunity, detail?: GrantsGovOpportunityDetail): string {
    const reasons: string[] = [];
    const title = opportunity.title.toLowerCase();
    const summary = (detail?.description || opportunity.summary || '').toLowerCase();
    
    // Check keywords
    const matchedKeywords = this.HIGH_PRIORITY_KEYWORDS.filter(keyword => 
      title.includes(keyword.toLowerCase()) || summary.includes(keyword.toLowerCase())
    );
    if (matchedKeywords.length > 0) {
      reasons.push(`Key programs: ${matchedKeywords.join(', ')}`);
    }
    
    // Check agency
    if (this.PRIORITY_AGENCIES.includes(opportunity.agencyCode)) {
      reasons.push(`Priority agency: ${opportunity.agencyCode}`);
    }
    
    // Check deadline
    if (opportunity.closeDate) {
      const daysUntilClose = Math.ceil((new Date(opportunity.closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilClose <= 21) {
        reasons.push(`Deadline in ${daysUntilClose} days`);
      }
    }
    
    return reasons.join('; ');
  }

  /**
   * Format funding amount from detailed opportunity
   */
  private formatFundingAmount(detail?: GrantsGovOpportunityDetail): string | null {
    if (!detail) return null;
    
    const parts: string[] = [];
    
    if (detail.awardFloor && detail.awardCeiling) {
      parts.push(`$${detail.awardFloor.toLocaleString()} - $${detail.awardCeiling.toLocaleString()} per award`);
    } else if (detail.awardCeiling) {
      parts.push(`Up to $${detail.awardCeiling.toLocaleString()} per award`);
    }
    
    if (detail.totalFunding) {
      parts.push(`$${detail.totalFunding.toLocaleString()} total available`);
    }
    
    if (detail.expectedAwards) {
      parts.push(`${detail.expectedAwards} expected awards`);
    }
    
    return parts.length > 0 ? parts.join('; ') : null;
  }

  /**
   * Extract program name from title
   */
  private extractProgramName(title: string): string | null {
    // Look for common program acronyms
    const acronyms = ['VAPG', 'SCBGP', 'LAMP', 'LFPP', 'FMPP', 'DBI', 'REAP', 'MPPEP'];
    
    for (const acronym of acronyms) {
      if (title.includes(acronym)) {
        return acronym;
      }
    }
    
    // Extract from parentheses if present
    const match = title.match(/\(([^)]+)\)/);
    if (match) {
      return match[1];
    }
    
    return null;
  }

  /**
   * Sync opportunities to storage with improved deduplication and upsert logic
   */
  async syncOpportunities(searchParams: Partial<Omit<GrantsGovSearchParams, 'startRecordNum' | 'rows'>> = {}, maxPages?: number): Promise<number> {
    console.log('Starting grants.gov sync with pagination...');
    
    // Use pagination to get all opportunities
    const opportunities = await this.searchAllOpportunities(searchParams);
    
    if (opportunities.length === 0) {
      console.log('No opportunities found, skipping sync');
      return 0;
    }
    
    let processed = 0;
    let enriched = 0;
    let created = 0;
    let updated = 0;
    
    // Process opportunities in batches with concurrency control
    const batchSize = this.MAX_CONCURRENT_REQUESTS;
    for (let i = 0; i < opportunities.length; i += batchSize) {
      const batch = opportunities.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (opportunity) => {
        try {
          await this.processOpportunity(opportunity);
          processed++;
        } catch (error) {
          console.error(`Error processing opportunity ${opportunity.number}:`, error);
        }
      }));
      
      // Add delay between batches
      if (i + batchSize < opportunities.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Apply cross-source US deduplication across ALL US sources
    console.log('Applying cross-source US deduplication to all US programs...');
    await this.performComprehensiveDeduplication();
    
    console.log(`grants.gov sync completed: ${processed} processed, ${created} created, ${updated} updated, ${enriched} enriched`);
    return processed;
  }

  /**
   * Process a single opportunity with proper upsert logic
   */
  private async processOpportunity(opportunity: GrantsGovOpportunity): Promise<void> {
    const opportunityId = `grants-gov-${opportunity.number}-${opportunity.agencyCode}`;
    
    // Check if we already have this opportunity using the improved ID
    let existingProgram = await storage.getSubsidyProgramById(opportunityId);
    
    // Also check by opportunityNumber for backwards compatibility
    if (!existingProgram) {
      const programs = await storage.getSubsidyProgramsBySource('grants_gov');
      existingProgram = programs.find(p => p.opportunityNumber === opportunity.number);
    }
    
    // Fetch detailed information for enrichment
    let detail: GrantsGovOpportunityDetail | null = null;
    try {
      detail = await this.fetchOpportunityDetail(opportunity.number);
      if (detail) {
        console.log(`Enriched opportunity ${opportunity.number} with detailed information`);
      }
    } catch (detailError) {
      console.warn(`Failed to fetch detail for ${opportunity.number}:`, detailError);
    }
    
    // Convert to our format
    const subsidyProgram = this.convertToSubsidyProgram(opportunity, detail || undefined);
    
    if (existingProgram) {
      // Update existing program with merge logic
      const mergedProgram = this.mergeOpportunityData(existingProgram, subsidyProgram);
      await storage.updateSubsidyProgram(existingProgram.id, mergedProgram);
      console.log(`Updated opportunity: ${opportunity.title} (${opportunity.number})`);
    } else {
      // Create new program
      await storage.createSubsidyProgram(subsidyProgram);
      console.log(`Added new opportunity: ${opportunity.title} (${opportunity.number})`);
    }
  }

  /**
   * Merge opportunity data with conflict resolution
   */
  private mergeOpportunityData(existing: any, incoming: InsertSubsidyProgram): Partial<InsertSubsidyProgram> {
    const conflicts: any = {};
    const merged = { ...incoming };

    // Apply precedence rules for conflicts
    if (existing.deadline !== incoming.deadline && existing.deadline && incoming.deadline) {
      conflicts.deadline = { existing: existing.deadline, incoming: incoming.deadline, resolution: 'use_earliest' };
      merged.deadline = existing.deadline < incoming.deadline ? existing.deadline : incoming.deadline;
    }

    if (existing.fundingAmount !== incoming.fundingAmount && existing.fundingAmount && incoming.fundingAmount) {
      conflicts.fundingAmount = { existing: existing.fundingAmount, incoming: incoming.fundingAmount, resolution: 'use_most_detailed' };
      merged.fundingAmount = incoming.fundingAmount.length > existing.fundingAmount.length ? incoming.fundingAmount : existing.fundingAmount;
    }

    // Track sources that contributed data
    const existingSources = existing.mergedFromSources || [];
    const incomingSources = incoming.mergedFromSources || [];
    merged.mergedFromSources = Array.from(new Set([...existingSources, ...incomingSources]));

    // Store conflict resolution audit
    if (Object.keys(conflicts).length > 0) {
      merged.conflictResolution = JSON.stringify({
        timestamp: new Date().toISOString(),
        conflicts,
        resolvedBy: 'grants_gov_precedence_rules'
      });
    }

    return merged;
  }

  /**
   * Sync specific USDA agency opportunities
   */
  async syncUSDAAgencyOpportunities(): Promise<number> {
    console.log('Syncing USDA agency-specific opportunities...');
    
    const agencyConfigs = [
      {
        agencies: 'USDA-AMS|USDA-AMS-SC|USDA-AMS-TM',
        keyword: 'Specialty Crop|SCBGP|Local Food|LAMP|LFPP|FMPP|DBI|Dairy Business Innovation|MPPEP|Meat and Poultry|Organic Transition'
      },
      {
        agencies: 'USDA-FNS',
        keyword: 'Farm to School|Patrick Leahy|FMNP|SFMNP|WIC Farmers|LFPA'
      },
      {
        agencies: 'USDA-RD|USDA-RBS|USDA-RUS|USDA-RD-RBCS',
        keyword: 'Value-Added Producer Grant|VAPG|REAP|Rural Energy|MPPEP|Rural Business'
      }
    ];
    
    let totalProcessed = 0;
    
    for (const config of agencyConfigs) {
      const processed = await this.syncOpportunities({
        oppStatuses: 'forecasted|posted|modified',
        agencies: config.agencies,
        keyword: config.keyword
      });
      
      totalProcessed += processed;
      
      // Delay between agency searches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return totalProcessed;
  }

  /**
   * Perform comprehensive cross-source deduplication
   */
  async performComprehensiveDeduplication(): Promise<void> {
    try {
      // Get all US programs across sources
      const allUSPrograms = await this.getAllUSPrograms();
      
      if (allUSPrograms.length === 0) {
        console.log('No US programs found for deduplication');
        return;
      }
      
      console.log(`Starting comprehensive deduplication of ${allUSPrograms.length} US programs`);
      
      // Apply partitioned deduplication
      const dedupedPrograms = await partitionedDeduplicationService.deduplicatePrograms(allUSPrograms);
      
      console.log(`Comprehensive deduplication completed: ${allUSPrograms.length} → ${dedupedPrograms.length} programs`);
      
    } catch (error) {
      console.error('Error in comprehensive deduplication:', error);
    }
  }

  /**
   * Get all US agricultural programs across data sources
   */
  private async getAllUSPrograms(): Promise<SubsidyProgram[]> {
    const usSources = [
      'grants_gov', 'grants_gov_search', 'grants_gov_detail',
      'usda_hq_rss', 'fns_rss', 'rd_rss', 'ars_rss', 'nass_rss', 'fs_rss'
    ];
    
    const allPrograms: SubsidyProgram[] = [];
    
    for (const source of usSources) {
      try {
        const sourcePrograms = await storage.getSubsidyProgramsBySource(source);
        allPrograms.push(...sourcePrograms);
      } catch (error) {
        console.warn(`Error fetching programs from source ${source}:`, error);
      }
    }
    
    return allPrograms;
  }
}

export const grantsGovService = new GrantsGovService();