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

// Program attributes - flexible key-value storage for heterogeneous data
export const programAttributes = pgTable("program_attributes", {
  program_id: varchar("program_id").notNull().references(() => subsidyProgramsCurated.id, { onDelete: "cascade" }),
  attr_key: text("attr_key").notNull(),
  attr_value: text("attr_value"),
});

export type ProgramAttribute = typeof programAttributes.$inferSelect;

// Program documents - PDFs, guides, application forms, web links
export const programDocs = pgTable("program_docs", {
  doc_id: varchar("doc_id").primaryKey().default(sql`gen_random_uuid()`),
  program_id: varchar("program_id").notNull().references(() => subsidyProgramsCurated.id, { onDelete: "cascade" }),
  doc_type: text("doc_type").notNull(), // guideline, application_form, faq, checklist, terms, webpage, quick_guide, reference
  display_name: text("display_name").notNull(),
  file_slug: text("file_slug"), // null for webpages
  source_url: text("source_url"), // PDF origin or canonical webpage
  language: text("language").default("en"),
  effective_date: text("effective_date"),
  sha256: text("sha256"), // file integrity hash
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertProgramDocSchema = createInsertSchema(programDocs).omit({
  doc_id: true,
  created_at: true,
});

export type InsertProgramDoc = z.infer<typeof insertProgramDocSchema>;
export type ProgramDoc = typeof programDocs.$inferSelect;
