import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// NEW: Subsidy programs from curated spreadsheet (10.01.25)
export const subsidyProgramsCurated = pgTable("subsidy_programs_curated_10_01_25", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Core fields (present in all sheets)
  country: text("country").notNull(), // 'US', 'CA', 'NZ', 'AU', 'CL', 'BR', 'LATAM'
  programName: text("program_name").notNull(),
  description: text("description"),
  hyperlink: text("hyperlink"),
  
  // Funding details
  fundingAmount: text("funding_amount"),
  paymentCap: text("payment_cap"),
  
  // Objectives and focus
  keyObjectives: text("key_objectives"),
  focus: text("focus"), // Used in CL/BR/LATAM sheets
  
  // Administration
  administered: text("administered"), // Used in CL/BR/LATAM sheets
  
  // Limits and cutoffs
  acreageProductionLimit: text("acreage_production_limit"), // US specific
  eligibilityCutoffs: text("eligibility_cutoffs"), // BR/LATAM
  cutoffsCaps: text("cutoffs_caps"), // CL specific
  
  // Deadlines
  closingDate: text("closing_date"),
  applicationDeadline: text("application_deadline"),
  budgetExhaustion: text("budget_exhaustion_marker"),
  
  // Additional information
  additionalInfo: text("additional_information"),
  notesStructure: text("notes_structure"),
  details: text("details"), // CL specific
  definitionsHowItWorks: text("definitions_how_it_works"), // BR/LATAM
  
  // Metadata
  sourceSheet: text("source_sheet").notNull(), // Which Excel sheet this came from
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubsidyProgramCuratedSchema = createInsertSchema(subsidyProgramsCurated).omit({
  id: true,
  importedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubsidyProgramCurated = z.infer<typeof insertSubsidyProgramCuratedSchema>;
export type SubsidyProgramCurated = typeof subsidyProgramsCurated.$inferSelect;
