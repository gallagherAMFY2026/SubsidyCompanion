import { type User, type InsertUser, type SubsidyProgram, type InsertSubsidyProgram } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Subsidy program operations
  getSubsidyPrograms(): Promise<SubsidyProgram[]>;
  getSubsidyProgramById(id: string): Promise<SubsidyProgram | undefined>;
  createSubsidyProgram(programData: InsertSubsidyProgram): Promise<SubsidyProgram>;
  updateSubsidyProgram(id: string, programData: Partial<InsertSubsidyProgram>): Promise<SubsidyProgram>;
  deleteSubsidyProgram(id: string): Promise<boolean>;
  getActiveSubsidyPrograms(): Promise<SubsidyProgram[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private subsidyPrograms: Map<string, SubsidyProgram>;

  constructor() {
    this.users = new Map();
    this.subsidyPrograms = new Map();
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
    const program: SubsidyProgram = {
      ...insertProgram,
      program: insertProgram.program || null,
      fundingAmount: insertProgram.fundingAmount || null,
      deadline: insertProgram.deadline || null,
      location: insertProgram.location || null,
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
}

export const storage = new MemStorage();
