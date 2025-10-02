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

// Curated subsidy programs from Excel spreadsheet (10.01.25 onwards)
export const subsidyProgramsCurated = pgTable("subsidy_programs_curated_10_01_25", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Core fields
  country: text("country").notNull(),
  program_name: text("program_name").notNull(),
  description: text("description"),
  hyperlink: text("hyperlink"),
  
  // Funding details
  funding_amount: text("funding_amount"),
  payment_cap: text("payment_cap"),
  
  // Objectives and focus
  key_objectives: text("key_objectives"),
  focus: text("focus"),
  
  // Administration
  administered: text("administered"),
  
  // Limits and cutoffs
  acreage_production_limit: text("acreage_production_limit"),
  eligibility_cutoffs: text("eligibility_cutoffs"),
  cutoffs_caps: text("cutoffs_caps"),
  
  // Deadlines
  closing_date: text("closing_date"),
  application_deadline: text("application_deadline"),
  budget_exhaustion_marker: text("budget_exhaustion_marker"),
  
  // Additional information
  additional_information: text("additional_information"),
  notes_structure: text("notes_structure"),
  details: text("details"),
  definitions_how_it_works: text("definitions_how_it_works"),
  
  // Metadata
  source_sheet: text("source_sheet").notNull(),
  imported_at: timestamp("imported_at").defaultNow().notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubsidyProgramCuratedSchema = createInsertSchema(subsidyProgramsCurated).omit({
  id: true,
  imported_at: true,
  created_at: true,
  updated_at: true,
});

export type InsertSubsidyProgramCurated = z.infer<typeof insertSubsidyProgramCuratedSchema>;
export type SubsidyProgramCurated = typeof subsidyProgramsCurated.$inferSelect;
