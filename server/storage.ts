import { 
  type User, 
  type InsertUser, 
  type SubsidyProgram, 
  type InsertSubsidyProgram,
  type DataSource,
  type InsertDataSource,
  type DataFetchLog,
  type InsertDataFetchLog
} from "@shared/schema";
import { randomUUID, createHash } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Subsidy program operations
  getSubsidyPrograms(): Promise<SubsidyProgram[]>;
  getSubsidyProgramById(id: string): Promise<SubsidyProgram | undefined>;
  getSubsidyProgramByDedupeKey(dedupeKey: string): Promise<SubsidyProgram | undefined>;
  createSubsidyProgram(programData: InsertSubsidyProgram): Promise<SubsidyProgram>;
  updateSubsidyProgram(id: string, programData: Partial<InsertSubsidyProgram>): Promise<SubsidyProgram>;
  deleteSubsidyProgram(id: string): Promise<boolean>;
  getActiveSubsidyPrograms(): Promise<SubsidyProgram[]>;
  getSubsidyProgramsBySource(dataSource: string): Promise<SubsidyProgram[]>;
  getHighPriorityPrograms(): Promise<SubsidyProgram[]>;
  
  // Enhanced geographical and category filtering
  getSubsidyProgramsByCountry(country: string): Promise<SubsidyProgram[]>;
  getSubsidyProgramsByRegion(region: string): Promise<SubsidyProgram[]>;
  getSubsidyProgramsByCategory(category: string): Promise<SubsidyProgram[]>;
  getSubsidyProgramsByLocation(country?: string, region?: string): Promise<SubsidyProgram[]>;
  
  // Enhanced deadline tracking and filtering
  getSubsidyProgramsByDeadlineRange(startDate: Date, endDate: Date): Promise<SubsidyProgram[]>;
  getSubsidyProgramsDeadlinesSoon(days: number): Promise<SubsidyProgram[]>;
  getSubsidyProgramsWithoutDeadlines(): Promise<SubsidyProgram[]>;
  getExpiredPrograms(): Promise<SubsidyProgram[]>;
  
  // Advanced search and filtering combinations
  searchSubsidyPrograms(filters: {
    query?: string;
    country?: string;
    region?: string;
    category?: string;
    dataSource?: string;
    hasDeadline?: boolean;
    isHighPriority?: boolean;
    fundingTypes?: string[];
    eligibilityTypes?: string[];
    deadlineWithinDays?: number;
  }): Promise<SubsidyProgram[]>;
  
  // Statistics and analytics
  getSubsidyProgramStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    highPriority: number;
    byCountry: Record<string, number>;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    upcomingDeadlines: number;
  }>;
  
  // Data source operations
  getDataSources(): Promise<DataSource[]>;
  getDataSourceById(id: string): Promise<DataSource | undefined>;
  getActiveDataSources(): Promise<DataSource[]>;
  createDataSource(sourceData: InsertDataSource): Promise<DataSource>;
  updateDataSource(id: string, sourceData: Partial<InsertDataSource>): Promise<DataSource>;
  deleteDataSource(id: string): Promise<boolean>;
  
  // Data fetch log operations
  createDataFetchLog(logData: InsertDataFetchLog): Promise<DataFetchLog>;
  getDataFetchLogs(dataSourceId?: string, limit?: number): Promise<DataFetchLog[]>;
  getLatestFetchLog(dataSourceId: string): Promise<DataFetchLog | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private subsidyPrograms: Map<string, SubsidyProgram>;
  private dataSources: Map<string, DataSource>;
  private dataFetchLogs: Map<string, DataFetchLog>;

  constructor() {
    this.users = new Map();
    this.subsidyPrograms = new Map();
    this.dataSources = new Map();
    this.dataFetchLogs = new Map();
  }

  // Utility function to compute deduplication key
  private computeDedupeKey(program: InsertSubsidyProgram): string {
    const normalizedTitle = program.title.toLowerCase().trim();
    const normalizedUrl = program.url.toLowerCase().trim();
    const keyData = `${normalizedTitle}|${normalizedUrl}|${program.dataSource}`;
    return createHash('sha256').update(keyData).digest('hex').substring(0, 32);
  }

  // Utility function to compute days until deadline
  private computeDaysUntilDeadline(deadline?: Date | null): string | null {
    if (!deadline) return null;
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays.toString();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getSubsidyPrograms(): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values());
  }

  async getSubsidyProgramById(id: string): Promise<SubsidyProgram | undefined> {
    return this.subsidyPrograms.get(id);
  }

  async createSubsidyProgram(insertProgram: InsertSubsidyProgram): Promise<SubsidyProgram> {
    const now = new Date();
    const dedupeKey = this.computeDedupeKey(insertProgram);
    const daysUntilDeadline = this.computeDaysUntilDeadline(insertProgram.deadline);
    
    const program: SubsidyProgram = {
      ...insertProgram,
      program: insertProgram.program || null,
      fundingAmount: insertProgram.fundingAmount || null,
      deadline: insertProgram.deadline || null,
      location: insertProgram.location || null,
      sourceAgency: insertProgram.sourceAgency || null,
      region: insertProgram.region || null,
      opportunityNumber: insertProgram.opportunityNumber || null,
      awardNumber: insertProgram.awardNumber || null,
      eligibilityTypes: insertProgram.eligibilityTypes || null,
      fundingTypes: insertProgram.fundingTypes || null,
      isHighPriority: insertProgram.isHighPriority || null,
      alertReason: insertProgram.alertReason || null,
      sourceLastModified: insertProgram.sourceLastModified || null,
      sourceEtag: insertProgram.sourceEtag || null,
      mergedFromSources: insertProgram.mergedFromSources || null,
      conflictResolution: insertProgram.conflictResolution || null,
      dedupeKey,
      daysUntilDeadline,
      createdAt: now,
      updatedAt: now,
    };
    this.subsidyPrograms.set(program.id, program);
    return program;
  }

  async updateSubsidyProgram(id: string, programData: Partial<InsertSubsidyProgram>): Promise<SubsidyProgram> {
    const existing = this.subsidyPrograms.get(id);
    if (!existing) {
      throw new Error(`Subsidy program with id ${id} not found`);
    }
    const updated: SubsidyProgram = {
      ...existing,
      ...programData,
      updatedAt: new Date(),
    };
    this.subsidyPrograms.set(id, updated);
    return updated;
  }

  async deleteSubsidyProgram(id: string): Promise<boolean> {
    return this.subsidyPrograms.delete(id);
  }

  async deleteAllSubsidyPrograms(): Promise<number> {
    const count = this.subsidyPrograms.size;
    this.subsidyPrograms.clear();
    return count;
  }

  async getActiveSubsidyPrograms(): Promise<SubsidyProgram[]> {
    const now = new Date();
    return Array.from(this.subsidyPrograms.values()).filter(program => {
      // Filter out expired programs based on deadline or published date
      if (program.deadline) {
        return program.deadline > now;
      }
      // If no deadline, consider programs from last 90 days as active
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return program.publishedDate > ninetyDaysAgo;
    });
  }

  async getSubsidyProgramByDedupeKey(dedupeKey: string): Promise<SubsidyProgram | undefined> {
    return Array.from(this.subsidyPrograms.values()).find(program => program.dedupeKey === dedupeKey);
  }

  async getSubsidyProgramsBySource(dataSource: string): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => program.dataSource === dataSource);
  }

  async getHighPriorityPrograms(): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => program.isHighPriority === true);
  }

  // Enhanced geographical and category filtering methods
  async getSubsidyProgramsByCountry(country: string): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => 
      (program.country || "").toLowerCase() === country.toLowerCase()
    );
  }

  async getSubsidyProgramsByRegion(region: string): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => 
      (program.region || "").toLowerCase().includes(region.toLowerCase())
    );
  }

  async getSubsidyProgramsByCategory(category: string): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => 
      (program.category || "").toLowerCase().includes(category.toLowerCase())
    );
  }

  async getSubsidyProgramsByLocation(country?: string, region?: string): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => {
      const countryMatch = !country || program.country.toLowerCase() === country.toLowerCase();
      const regionMatch = !region || program.region?.toLowerCase().includes(region.toLowerCase());
      return countryMatch && regionMatch;
    });
  }

  // Enhanced deadline tracking and filtering methods
  async getSubsidyProgramsByDeadlineRange(startDate: Date, endDate: Date): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => {
      if (!program.deadline) return false;
      return program.deadline >= startDate && program.deadline <= endDate;
    });
  }

  async getSubsidyProgramsDeadlinesSoon(days: number): Promise<SubsidyProgram[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return Array.from(this.subsidyPrograms.values())
      .filter(program => program.deadline && program.deadline >= now && program.deadline <= futureDate)
      .sort((a, b) => (a.deadline!.getTime() - b.deadline!.getTime()));
  }

  async getSubsidyProgramsWithoutDeadlines(): Promise<SubsidyProgram[]> {
    return Array.from(this.subsidyPrograms.values()).filter(program => !program.deadline);
  }

  async getExpiredPrograms(): Promise<SubsidyProgram[]> {
    const now = new Date();
    return Array.from(this.subsidyPrograms.values()).filter(program => 
      program.deadline && program.deadline < now
    );
  }

  // Advanced search and filtering combinations
  async searchSubsidyPrograms(filters: {
    query?: string;
    country?: string;
    region?: string;
    category?: string;
    dataSource?: string;
    hasDeadline?: boolean;
    isHighPriority?: boolean;
    fundingTypes?: string[];
    eligibilityTypes?: string[];
    deadlineWithinDays?: number;
  }): Promise<SubsidyProgram[]> {
    let results = Array.from(this.subsidyPrograms.values());

    // Text search across title and summary
    if (filters.query) {
      const queryLower = filters.query.toLowerCase();
      results = results.filter(program => 
        (program.title || "").toLowerCase().includes(queryLower) ||
        (program.summary || "").toLowerCase().includes(queryLower)
      );
    }

    // Geographic filters
    if (filters.country) {
      results = results.filter(program => 
        program.country.toLowerCase() === filters.country!.toLowerCase()
      );
    }

    if (filters.region) {
      results = results.filter(program => 
        program.region?.toLowerCase().includes(filters.region!.toLowerCase())
      );
    }

    // Category filter
    if (filters.category) {
      results = results.filter(program => 
        program.category.toLowerCase().includes(filters.category!.toLowerCase())
      );
    }

    // Data source filter
    if (filters.dataSource) {
      results = results.filter(program => program.dataSource === filters.dataSource);
    }

    // Deadline filter
    if (filters.hasDeadline !== undefined) {
      results = results.filter(program => 
        filters.hasDeadline ? !!program.deadline : !program.deadline
      );
    }

    // Priority filter
    if (filters.isHighPriority !== undefined) {
      results = results.filter(program => 
        filters.isHighPriority ? program.isHighPriority === 'true' : program.isHighPriority !== 'true'
      );
    }

    // Funding types filter (case-insensitive)
    if (filters.fundingTypes && filters.fundingTypes.length > 0) {
      const normalizedFilters = filters.fundingTypes.map(t => t.toLowerCase());
      results = results.filter(program => 
        (program.fundingTypes || []).some(type => normalizedFilters.includes((type || "").toLowerCase()))
      );
    }

    // Eligibility types filter (case-insensitive)
    if (filters.eligibilityTypes && filters.eligibilityTypes.length > 0) {
      const normalizedFilters = filters.eligibilityTypes.map(t => t.toLowerCase());
      results = results.filter(program => 
        (program.eligibilityTypes || []).some(type => normalizedFilters.includes((type || "").toLowerCase()))
      );
    }

    // Deadline within days filter
    if (filters.deadlineWithinDays !== undefined) {
      const now = new Date();
      const futureDate = new Date(now.getTime() + filters.deadlineWithinDays * 24 * 60 * 60 * 1000);
      results = results.filter(program => 
        program.deadline && program.deadline >= now && program.deadline <= futureDate
      );
    }

    return results;
  }

  // Statistics and analytics
  async getSubsidyProgramStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    highPriority: number;
    byCountry: Record<string, number>;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    upcomingDeadlines: number;
  }> {
    const allPrograms = Array.from(this.subsidyPrograms.values());
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Basic counts
    const total = allPrograms.length;
    const active = allPrograms.filter(p => !p.deadline || p.deadline > now).length;
    const expired = allPrograms.filter(p => p.deadline && p.deadline < now).length;
    const highPriority = allPrograms.filter(p => p.isHighPriority === 'true').length;
    const upcomingDeadlines = allPrograms.filter(p => 
      p.deadline && p.deadline >= now && p.deadline <= oneWeekFromNow
    ).length;

    // Group by country
    const byCountry: Record<string, number> = {};
    allPrograms.forEach(program => {
      byCountry[program.country] = (byCountry[program.country] || 0) + 1;
    });

    // Group by source
    const bySource: Record<string, number> = {};
    allPrograms.forEach(program => {
      bySource[program.dataSource] = (bySource[program.dataSource] || 0) + 1;
    });

    // Group by category
    const byCategory: Record<string, number> = {};
    allPrograms.forEach(program => {
      byCategory[program.category] = (byCategory[program.category] || 0) + 1;
    });

    return {
      total,
      active,
      expired,
      highPriority,
      byCountry,
      bySource,
      byCategory,
      upcomingDeadlines
    };
  }

  // Data source operations
  async getDataSources(): Promise<DataSource[]> {
    return Array.from(this.dataSources.values());
  }

  async getDataSourceById(id: string): Promise<DataSource | undefined> {
    return this.dataSources.get(id);
  }

  async getActiveDataSources(): Promise<DataSource[]> {
    return Array.from(this.dataSources.values()).filter(source => source.isActive === 'true');
  }

  async createDataSource(sourceData: InsertDataSource): Promise<DataSource> {
    const now = new Date();
    const dataSource: DataSource = {
      ...sourceData,
      agency: sourceData.agency || null,
      region: sourceData.region || null,
      userAgent: sourceData.userAgent || null,
      headers: sourceData.headers || null,
      keywords: sourceData.keywords || null,
      parseConfig: sourceData.parseConfig || null,
      pollIntervalMinutes: sourceData.pollIntervalMinutes || "60",
      isActive: sourceData.isActive || "true",
      createdAt: now,
      updatedAt: now,
    };
    this.dataSources.set(dataSource.id, dataSource);
    return dataSource;
  }

  async updateDataSource(id: string, sourceData: Partial<InsertDataSource>): Promise<DataSource> {
    const existing = this.dataSources.get(id);
    if (!existing) {
      throw new Error(`Data source with id ${id} not found`);
    }
    const updated: DataSource = {
      ...existing,
      ...sourceData,
      updatedAt: new Date(),
    };
    this.dataSources.set(id, updated);
    return updated;
  }

  async deleteDataSource(id: string): Promise<boolean> {
    return this.dataSources.delete(id);
  }

  // Data fetch log operations
  async createDataFetchLog(logData: InsertDataFetchLog): Promise<DataFetchLog> {
    const id = randomUUID();
    const now = new Date();
    const log: DataFetchLog = {
      id,
      ...logData,
      itemsFound: logData.itemsFound || null,
      itemsProcessed: logData.itemsProcessed || null,
      errorMessage: logData.errorMessage || null,
      responseTime: logData.responseTime || null,
      httpStatus: logData.httpStatus || null,
      lastModified: logData.lastModified || null,
      etag: logData.etag || null,
      fetchedAt: now,
    };
    this.dataFetchLogs.set(id, log);
    return log;
  }

  async getDataFetchLogs(dataSourceId?: string, limit?: number): Promise<DataFetchLog[]> {
    let logs = Array.from(this.dataFetchLogs.values());
    
    if (dataSourceId) {
      logs = logs.filter(log => log.dataSourceId === dataSourceId);
    }
    
    // Sort by fetchedAt descending (most recent first)
    logs.sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
    
    if (limit) {
      logs = logs.slice(0, limit);
    }
    
    return logs;
  }

  async getLatestFetchLog(dataSourceId: string): Promise<DataFetchLog | undefined> {
    const logs = await this.getDataFetchLogs(dataSourceId, 1);
    return logs[0];
  }
}

export const storage = new MemStorage();
