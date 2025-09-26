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
    return Array.from(this.subsidyPrograms.values()).filter(program => program.isHighPriority === 'true');
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
