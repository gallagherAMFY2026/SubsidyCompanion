import { createHash } from 'crypto';
import type { InsertSubsidyProgram, SubsidyProgram } from '@shared/schema';

// Enhanced deduplication configuration with partitioned approach
export const DEDUP_CONFIG = {
  dedupe_scope: {
    partition_key: 'sector',
    within_partition: {
      primary_key: ['id || sha1(normalize_url(link) + "|" + normalize(title))'],
      time_bucket: 'day'
    },
    cross_partition: {
      enable: true,
      only_if: 'exact_id_match',
      id_fields: ['grants_opportunity_number', 'gets_rfx_id', 'opportunityNumber'],
      action: 'collapse_to_single_record'
    }
  },
  sources: {
    grants_gov_search2: {
      id_fields: ['id', 'number', 'opportunityNumber'],
      primary_key: 'first_non_null(number, id)',
      secondary_key: 'sha1(normalize(title) + "|" + normalize(agencyCode) + "|" + normalize(openDate))',
      canonical_url: 'https://www.grants.gov/search-results-detail/{{number}}',
      notes: 'search2 returns id, number, title, agencyCode, openDate, closeDate, oppStatus, docType, alnist'
    },
    grants_gov_detail: {
      id_fields: ['opportunityNumber'],
      primary_key: 'opportunityNumber',
      secondary_key: 'sha1(normalize(title) + "|" + normalize(agencyCode) + "|" + normalize(postDate))',
      canonical_url: 'opportunitySynopsisURL || opportunityAdditionalInfoURL'
    },
    usda_hq_rss: {
      primary_key: 'guid || sha1(normalize_url(link) + "|" + normalize(title))',
      time_bucket: 'day',
      canonical_url: 'normalize_url(link)'
    },
    fns_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      secondary_key: 'sha1(normalize(title))',
      canonical_url: 'normalize_url(link)'
    },
    rd_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)'
    },
    ars_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)'
    },
    nass_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)'
    },
    fs_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)'
    }
  },
  cross_source: {
    merge_key: [
      'eq(grants.number, rss.grants_number_from_url)',
      'fuzzy(title)',
      'agencyCode_or_host',
      'category_or_keyword_match'
    ],
    similarity_threshold: 0.88,
    notes: 'Prefer exact match on Grants.gov opportunity number parsed from RSS links; otherwise use fuzzy title + agency/host.'
  },
  canonicalization: {
    prefer_https: true,
    strip_query_params: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'],
    normalize_host_aliases: [
      ['www.grants.gov', 'grants.gov'],
      ['www.usda.gov', 'usda.gov'],
      ['www.fns.usda.gov', 'fns.usda.gov'],
      ['www.rd.usda.gov', 'rd.usda.gov']
    ]
  },
  // New Zealand sources
  nz_sources: {
    mpi_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)',
      sector_keywords: ['farm', 'livestock', 'dairy', 'PSGF', 'SFF', 'catchment']
    },
    beehive_rss: {
      primary_key: 'guid || sha1(normalize_url(link))',
      canonical_url: 'normalize_url(link)',
      sector_keywords: ['Agriculture', 'Primary Sector', 'Rural Wellbeing']
    },
    gets_tenders: {
      primary_key: 'rfxId || sha1(normalize(title) + normalize(organisation))',
      canonical_url: 'normalize_url(link)',
      id_fields: ['rfxId']
    }
  },
  collision_resolution: {
    precedence: ['grants_gov_detail', 'grants_gov_search2', 'usda_hq_rss', 'fns_rss', 'rd_rss', 'ars_rss', 'nass_rss', 'fs_rss'],
    field_rules: {
      opportunity_number: 'from(grants_gov_detail || grants_gov_search2)',
      title: 'latest_by_precedence',
      agency_code: 'from(grants_gov_detail || grants_gov_search2)',
      published_at: 'earliest_by_precedence',
      post_date: 'from(grants_gov_detail || grants_gov_search2)',
      close_date: 'earliest_non_null',
      opp_status: 'latest_by_precedence',
      aln_list: 'union_unique',
      funding_category: 'from(grants_gov_detail || grants_gov_search2)',
      eligibilities: 'union_unique',
      estimated_funding: 'max_by_precedence',
      expected_awards: 'max_by_precedence',
      synopsis_url: 'prefer_deepest_path',
      description: 'richest_html_by_precedence'
    }
  },
  normalization: {
    date_format: 'YYYY-MM-DD',
    money_fields_usd: ['estimated_funding'],
    rounding: { estimated_funding: 0 },
    text_cleanup: ['trim', 'collapse_whitespace', 'strip_html']
  },
  audit: {
    store_source_payload: true,
    diff_fields: ['title', 'opp_status', 'close_date', 'estimated_funding', 'eligibilities', 'description'],
    keep_history_days: 365
  }
};

interface DeduplicationCandidate {
  program: SubsidyProgram;
  source: string;
  primaryKey: string;
  secondaryKey?: string;
  canonicalUrl: string;
  rawPayload?: any;
}

interface MergeGroup {
  candidates: DeduplicationCandidate[];
  mergeKey: string;
  confidence: number;
}

interface PartitionedCandidate extends DeduplicationCandidate {
  sector: string;
  partition: string;
}

export class PartitionedDeduplicationService {
  /**
   * Main deduplication entry point with partitioned approach
   */
  async deduplicatePrograms(programs: SubsidyProgram[]): Promise<SubsidyProgram[]> {
    console.log(`Starting partitioned deduplication for ${programs.length} programs...`);
    
    // Step 1: Generate partitioned candidates
    const candidates = this.generatePartitionedCandidates(programs);
    
    // Step 2: Within-partition deduplication (agriculture first)
    const withinPartitionResults = await this.deduplicateWithinPartitions(candidates);
    
    // Step 3: Cross-partition pass for exact ID matches
    const finalResults = await this.crossPartitionDeduplication(withinPartitionResults);
    
    console.log(`Partitioned deduplication completed: ${programs.length} → ${finalResults.length} programs`);
    return finalResults;
  }

  /**
   * Generate partitioned candidates with sector classification
   */
  private generatePartitionedCandidates(programs: SubsidyProgram[]): PartitionedCandidate[] {
    return programs.map(program => {
      const source = this.identifySource(program);
      const sourceConfig = DEDUP_CONFIG.sources[source as keyof typeof DEDUP_CONFIG.sources];
      const sector = this.classifySector(program);
      
      return {
        program,
        source,
        sector,
        partition: sector, // Partition by sector
        primaryKey: this.generatePrimaryKey(program, sourceConfig),
        secondaryKey: this.generateSecondaryKey(program, sourceConfig),
        canonicalUrl: this.canonicalizeUrl(program.url),
        rawPayload: undefined // Raw data not stored in current schema
      };
    });
  }

  /**
   * Classify program sector for partitioning
   */
  private classifySector(program: SubsidyProgram): string {
    const title = program.title.toLowerCase();
    const category = program.category?.toLowerCase() || '';
    const summary = program.summary?.toLowerCase() || '';
    const sourceAgency = program.sourceAgency?.toLowerCase() || '';
    
    const text = `${title} ${category} ${summary} ${sourceAgency}`;
    
    // Agriculture sector keywords
    const agKeywords = [
      'farm', 'farming', 'agriculture', 'agricultural', 'dairy', 'livestock', 
      'cattle', 'sheep', 'goat', 'deer', 'equine', 'pig', 'poultry', 'chicken',
      'water', 'irrigation', 'catchment', 'soil', 'crop', 'harvest', 'pasture',
      'emissions', 'methane', 'nitrate', 'fertilizer', 'organic', 'sustainable',
      'rural', 'farmer', 'rancher', 'producer', 'specialty crop', 'food safety',
      'psgf', 'sff', 'mpi', 'usda', 'aafc', 'rural development', 'conservation'
    ];
    
    for (const keyword of agKeywords) {
      if (text.includes(keyword)) {
        return 'agriculture';
      }
    }
    
    // Check for specific non-agriculture sectors
    if (text.includes('health') || text.includes('medical') || text.includes('hospital')) {
      return 'health';
    }
    if (text.includes('education') || text.includes('school') || text.includes('university')) {
      return 'education';
    }
    if (text.includes('energy') || text.includes('renewable') || text.includes('solar')) {
      return 'energy';
    }
    
    return 'general';
  }

  /**
   * Deduplicate within each partition separately
   */
  private async deduplicateWithinPartitions(candidates: PartitionedCandidate[]): Promise<SubsidyProgram[]> {
    const partitions = new Map<string, PartitionedCandidate[]>();
    
    // Group candidates by partition
    for (const candidate of candidates) {
      const partition = candidate.partition;
      if (!partitions.has(partition)) {
        partitions.set(partition, []);
      }
      partitions.get(partition)!.push(candidate);
    }
    
    console.log(`Deduplicating within ${partitions.size} partitions: ${Array.from(partitions.keys()).join(', ')}`);
    
    const results: SubsidyProgram[] = [];
    
    for (const [partition, partitionCandidates] of Array.from(partitions.entries())) {
      console.log(`Processing partition '${partition}' with ${partitionCandidates.length} candidates`);
      
      // Convert back to regular candidates for existing logic
      const regularCandidates: DeduplicationCandidate[] = partitionCandidates;
      
      // Group candidates by similarity within partition
      const mergeGroups = this.groupCandidates(regularCandidates);
      
      // Merge groups using collision resolution rules
      const partitionResults = await this.mergeGroups(mergeGroups);
      
      console.log(`Partition '${partition}': ${partitionCandidates.length} → ${partitionResults.length} programs`);
      results.push(...partitionResults);
    }
    
    return results;
  }

  /**
   * Cross-partition deduplication for exact ID matches only
   */
  private async crossPartitionDeduplication(programs: SubsidyProgram[]): Promise<SubsidyProgram[]> {
    if (!DEDUP_CONFIG.dedupe_scope.cross_partition.enable) {
      return programs;
    }
    
    console.log('Performing cross-partition deduplication for exact ID matches...');
    
    const exactIdGroups = new Map<string, SubsidyProgram[]>();
    const remainingPrograms: SubsidyProgram[] = [];
    
    for (const program of programs) {
      const exactId = this.extractExactId(program);
      
      if (exactId) {
        if (!exactIdGroups.has(exactId)) {
          exactIdGroups.set(exactId, []);
        }
        exactIdGroups.get(exactId)!.push(program);
      } else {
        remainingPrograms.push(program);
      }
    }
    
    // Merge exact ID groups across partitions
    for (const [exactId, group] of Array.from(exactIdGroups.entries())) {
      if (group.length > 1) {
        console.log(`Cross-partition merge for ID '${exactId}': ${group.length} programs`);
        const merged = this.mergePrograms(group);
        remainingPrograms.push(merged);
      } else {
        remainingPrograms.push(group[0]);
      }
    }
    
    console.log(`Cross-partition deduplication: ${programs.length} → ${remainingPrograms.length} programs`);
    return remainingPrograms;
  }

  /**
   * Extract exact immutable IDs for cross-partition matching
   */
  private extractExactId(program: SubsidyProgram): string | null {
    const idFields = DEDUP_CONFIG.dedupe_scope.cross_partition.id_fields;
    
    // Check grants.gov opportunity number
    if (program.opportunityNumber && idFields.includes('grants_opportunity_number')) {
      return `grants_gov:${program.opportunityNumber}`;
    }
    
    // Check for GETS RFx ID in URL or program data
    const getsMatch = program.url.match(/id=(\d+)/);
    if (getsMatch && idFields.includes('gets_rfx_id')) {
      return `gets:${getsMatch[1]}`;
    }
    
    // Check for other immutable IDs in the ID field itself
    if (program.id && /^[A-Z]{2,10}-\d{4,10}$/.test(program.id)) {
      return `immutable:${program.id}`;
    }
    
    return null;
  }

  /**
   * Generate deduplication candidates with keys
   */
  private generateCandidates(programs: SubsidyProgram[]): DeduplicationCandidate[] {
    return programs.map(program => {
      const source = this.identifySource(program);
      const sourceConfig = DEDUP_CONFIG.sources[source as keyof typeof DEDUP_CONFIG.sources];
      
      return {
        program,
        source,
        primaryKey: this.generatePrimaryKey(program, sourceConfig),
        secondaryKey: this.generateSecondaryKey(program, sourceConfig),
        canonicalUrl: this.canonicalizeUrl(program.url),
        rawPayload: undefined // Raw data not stored in current schema
      };
    });
  }

  /**
   * Identify the source type of a program
   */
  private identifySource(program: SubsidyProgram): string {
    const dataSource = program.dataSource?.toLowerCase() || '';
    const url = program.url?.toLowerCase() || '';
    
    if (dataSource.includes('grants_gov') || url.includes('grants.gov')) {
      if (program.opportunityNumber && program.summary && program.summary.length > 100) {
        return 'grants_gov_detail';
      }
      return 'grants_gov_search2';
    }
    
    if (dataSource.includes('usda_hq') || url.includes('usda.gov')) return 'usda_hq_rss';
    if (dataSource.includes('fns') || url.includes('fns.usda.gov')) return 'fns_rss';
    if (dataSource.includes('rd') || url.includes('rd.usda.gov')) return 'rd_rss';
    if (dataSource.includes('ars') || url.includes('ars.usda.gov')) return 'ars_rss';
    if (dataSource.includes('nass') || url.includes('nass.usda.gov')) return 'nass_rss';
    if (dataSource.includes('fs') || url.includes('fs.usda.gov')) return 'fs_rss';
    
    return 'unknown';
  }

  /**
   * Generate primary deduplication key
   */
  private generatePrimaryKey(program: SubsidyProgram, sourceConfig: any): string {
    if (!sourceConfig) return this.sha1(this.normalize(program.title) + '|' + this.normalize(program.url));
    
    // Handle grants.gov specific logic
    if (program.opportunityNumber) {
      return program.opportunityNumber;
    }
    
    // Handle RSS feeds with extracted GUID from URL or ID
    const extractedGuid = this.extractGuidFromProgram(program);
    if (extractedGuid) {
      return extractedGuid;
    }
    
    // Fallback to URL + title hash
    return this.sha1(this.normalizeUrl(program.url) + '|' + this.normalize(program.title));
  }

  /**
   * Generate secondary deduplication key
   */
  private generateSecondaryKey(program: SubsidyProgram, sourceConfig: any): string | undefined {
    if (!sourceConfig?.secondary_key) return undefined;
    
    const title = this.normalize(program.title);
    const agencyCode = program.sourceAgency || '';
    const date = program.publishedDate?.toISOString().split('T')[0] || '';
    
    return this.sha1(title + '|' + agencyCode + '|' + date);
  }

  /**
   * Group candidates by similarity for merging
   */
  private groupCandidates(candidates: DeduplicationCandidate[]): MergeGroup[] {
    const groups: MergeGroup[] = [];
    const processed = new Set<string>();
    
    for (const candidate of candidates) {
      if (processed.has(candidate.primaryKey)) continue;
      
      const group: MergeGroup = {
        candidates: [candidate],
        mergeKey: candidate.primaryKey,
        confidence: 1.0
      };
      
      // Find similar candidates
      for (const other of candidates) {
        if (other === candidate || processed.has(other.primaryKey)) continue;
        
        const similarity = this.calculateSimilarity(candidate, other);
        if (similarity >= DEDUP_CONFIG.cross_source.similarity_threshold) {
          group.candidates.push(other);
          processed.add(other.primaryKey);
        }
      }
      
      processed.add(candidate.primaryKey);
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Calculate similarity between two candidates
   */
  private calculateSimilarity(a: DeduplicationCandidate, b: DeduplicationCandidate): number {
    let score = 0;
    let checks = 0;
    
    // Exact opportunity number match (highest weight)
    if (this.extractOpportunityNumber(a.program.url) && 
        this.extractOpportunityNumber(b.program.url) &&
        this.extractOpportunityNumber(a.program.url) === this.extractOpportunityNumber(b.program.url)) {
      return 1.0;
    }
    
    // Title fuzzy match
    const titleSim = this.fuzzyMatch(this.normalize(a.program.title), this.normalize(b.program.title));
    score += titleSim * 0.5;
    checks++;
    
    // Agency/host match
    const agencyA = this.extractHost(a.canonicalUrl) || a.program.sourceAgency || '';
    const agencyB = this.extractHost(b.canonicalUrl) || b.program.sourceAgency || '';
    if (agencyA && agencyB && agencyA === agencyB) {
      score += 0.3;
    }
    checks++;
    
    // Category/keyword match
    const catA = a.program.category || '';
    const catB = b.program.category || '';
    if (catA && catB && catA === catB) {
      score += 0.2;
    }
    checks++;
    
    return score / checks;
  }

  /**
   * Merge groups using collision resolution rules
   */
  private async mergeGroups(groups: MergeGroup[]): Promise<SubsidyProgram[]> {
    const merged: SubsidyProgram[] = [];
    
    for (const group of groups) {
      if (group.candidates.length === 1) {
        merged.push(group.candidates[0].program);
        continue;
      }
      
      // Sort by precedence
      const sorted = group.candidates.sort((a, b) => {
        const aPrecedence = DEDUP_CONFIG.collision_resolution.precedence.indexOf(a.source);
        const bPrecedence = DEDUP_CONFIG.collision_resolution.precedence.indexOf(b.source);
        // Handle unknown sources by placing them at end
        if (aPrecedence === -1) return 1;
        if (bPrecedence === -1) return -1;
        return aPrecedence - bPrecedence;
      });
      
      const mergedProgram = this.mergePrograms(sorted.map(c => c.program));
      merged.push(mergedProgram);
    }
    
    return merged;
  }

  /**
   * Merge multiple programs using field rules
   */
  private mergePrograms(programs: SubsidyProgram[]): SubsidyProgram {
    if (programs.length === 1) return programs[0];
    
    const primary = programs[0]; // Highest precedence
    const merged: SubsidyProgram = { ...primary };
    
    // Apply field-specific merge rules
    const rules = DEDUP_CONFIG.collision_resolution.field_rules;
    
    // Opportunity number: from grants.gov sources only
    merged.opportunityNumber = this.getFromGrantsGov(programs, 'opportunityNumber') || primary.opportunityNumber;
    
    // Title: latest by precedence
    merged.title = this.getLatestByPrecedence(programs, 'title') || primary.title;
    
    // Agency code: from grants.gov sources only
    merged.sourceAgency = this.getFromGrantsGov(programs, 'sourceAgency') || primary.sourceAgency;
    
    // Published date: earliest by precedence
    merged.publishedDate = this.getEarliestByPrecedence(programs, 'publishedDate') || primary.publishedDate;
    
    // Close date: earliest non-null
    merged.deadline = this.getEarliestNonNull(programs, 'deadline') || primary.deadline;
    
    // Funding amount: max by precedence
    merged.fundingAmount = this.getMaxByPrecedence(programs, 'fundingAmount') || primary.fundingAmount;
    
    // Synopsis URL: prefer deepest path
    merged.url = this.getDeepestPath(programs.map(p => p.url)) || primary.url;
    
    // Description: richest HTML by precedence
    merged.summary = this.getRichestByPrecedence(programs, 'summary') || primary.summary;
    
    // Merge source metadata
    merged.mergedFromSources = Array.from(new Set(
      programs.flatMap(p => p.mergedFromSources || [p.dataSource]).filter(Boolean)
    ));
    
    // Update deduplication key
    merged.dedupeKey = this.generateMergedDedupeKey(programs);
    
    return merged;
  }

  /**
   * Utility functions for merge rules
   */
  private getFromGrantsGov(programs: SubsidyProgram[], field: keyof SubsidyProgram): any {
    const grantsGovProgram = programs.find(p => 
      p.dataSource?.includes('grants_gov') || p.url?.includes('grants.gov')
    );
    return grantsGovProgram?.[field];
  }

  private getLatestByPrecedence(programs: SubsidyProgram[], field: keyof SubsidyProgram): any {
    for (const program of programs) {
      if (program[field]) return program[field];
    }
    return null;
  }

  private getEarliestByPrecedence(programs: SubsidyProgram[], field: keyof SubsidyProgram): Date | null {
    const dates = programs
      .map(p => p[field] as Date)
      .filter(d => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
    
    return dates[0] || null;
  }

  private getEarliestNonNull(programs: SubsidyProgram[], field: keyof SubsidyProgram): Date | null {
    const dates = programs
      .map(p => p[field] as Date)
      .filter(d => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
    
    return dates[0] || null;
  }

  private getMaxByPrecedence(programs: SubsidyProgram[], field: keyof SubsidyProgram): string | null {
    for (const program of programs) {
      if (program[field]) return program[field] as string;
    }
    return null;
  }

  private getDeepestPath(urls: (string | undefined)[]): string | null {
    const validUrls = urls.filter(Boolean) as string[];
    if (validUrls.length === 0) return null;
    
    return validUrls.sort((a, b) => b.split('/').length - a.split('/').length)[0];
  }

  private getRichestByPrecedence(programs: SubsidyProgram[], field: keyof SubsidyProgram): string | null {
    const values = programs
      .map(p => p[field] as string)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    
    return values[0] || null;
  }

  /**
   * Text normalization utilities
   */
  private normalize(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/<[^>]*>/g, ''); // Strip HTML
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    
    try {
      const parsed = new URL(url);
      
      // Prefer HTTPS
      if (DEDUP_CONFIG.canonicalization.prefer_https) {
        parsed.protocol = 'https:';
      }
      
      // Strip query params
      DEDUP_CONFIG.canonicalization.strip_query_params.forEach((param: string) => {
        parsed.searchParams.delete(param);
      });
      
      // Normalize host aliases
      for (const [from, to] of DEDUP_CONFIG.canonicalization.normalize_host_aliases) {
        if (parsed.hostname === from) {
          parsed.hostname = to;
        }
      }
      
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private canonicalizeUrl(url: string): string {
    return this.normalizeUrl(url);
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private extractOpportunityNumber(url: string): string | null {
    const match = url.match(/(?:opportunity[_-]?number|opp[_-]?num)[=\/]([A-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  private fuzzyMatch(a: string, b: string): number {
    if (a === b) return 1.0;
    
    // Simple Levenshtein-based similarity
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const editDistance = this.levenshteinDistance(longer, shorter);
    
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,        // deletion
          matrix[j - 1][i] + 1,        // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[b.length][a.length];
  }

  private sha1(text: string): string {
    return createHash('sha1').update(text).digest('hex');
  }

  /**
   * Extract GUID from program (RSS feeds often have GUID in URL or ID)
   */
  private extractGuidFromProgram(program: SubsidyProgram): string | null {
    // Check if ID looks like a GUID
    if (program.id && /^[a-f0-9-]{36}$/i.test(program.id)) {
      return program.id;
    }
    
    // Extract GUID from URL
    const guidMatch = program.url.match(/guid[=\/]([a-f0-9-]{36})/i);
    if (guidMatch) {
      return guidMatch[1];
    }
    
    return null;
  }

  private generateMergedDedupeKey(programs: SubsidyProgram[]): string {
    const sources = programs.map(p => p.dataSource).join('|');
    const primaryTitle = this.normalize(programs[0].title);
    return this.sha1(sources + '|' + primaryTitle);
  }
}

// Export singleton instance with updated name
export const partitionedDeduplicationService = new PartitionedDeduplicationService();
// Maintain backward compatibility
export const usDeduplicationService = partitionedDeduplicationService;