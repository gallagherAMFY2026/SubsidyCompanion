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

export const subsidyPrograms = pgTable("subsidy_programs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
  publishedDate: timestamp("published_date").notNull(),
  url: text("url").notNull(),
  fundingAmount: text("funding_amount"),
  deadline: timestamp("deadline"),
  location: text("location"),
  program: text("program"),
  
  // Multi-source support
  dataSource: text("data_source").notNull(), // 'grants_gov', 'rss_usda', 'rss_aafc', 'rss_provincial', 'agpal'
  sourceUrl: text("source_url").notNull(), // Original source URL where data was fetched
  sourceAgency: text("source_agency"), // USDA-AMS, AAFC, etc.
  country: text("country").notNull(), // 'US', 'CA'
  region: text("region"), // State/Province/Territory
  
  // Enhanced metadata
  opportunityNumber: text("opportunity_number"), // grants.gov opportunity number
  awardNumber: text("award_number"), // ALN or Canadian program number
  eligibilityTypes: text("eligibility_types").array(), // 'farm', 'nonprofit', 'government', etc.
  fundingTypes: text("funding_types").array(), // 'grant', 'loan', 'cost_share', 'insurance'
  
  // Priority and alerts
  isHighPriority: text("is_high_priority"), // 'true' for VAPG, SCBGP, REAP, etc.
  alertReason: text("alert_reason"), // Why this is high priority
  daysUntilDeadline: text("days_until_deadline"), // Calculated field for sorting
  
  // Deduplication support
  dedupeKey: text("dedupe_key").notNull(), // Computed hash for deduplication
  sourceLastModified: timestamp("source_last_modified"), // Last-Modified from HTTP headers
  sourceEtag: text("source_etag"), // ETag from HTTP headers
  
  // Cross-source merging
  mergedFromSources: text("merged_from_sources").array(), // List of sources that contributed data
  conflictResolution: text("conflict_resolution"), // JSON storing conflict resolution audit
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Data source configurations
export const dataSources = pgTable("data_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'rss', 'api', 'scrape'
  url: text("url").notNull(),
  country: text("country").notNull(), // 'US', 'CA'
  agency: text("agency"), // 'USDA-AMS', 'AAFC', etc.
  region: text("region"), // Province/State for regional sources
  
  // Polling configuration
  pollIntervalMinutes: text("poll_interval_minutes").notNull().default("60"),
  isActive: text("is_active").notNull().default("true"),
  
  // HTTP configuration
  userAgent: text("user_agent"),
  headers: text("headers"), // JSON string of additional headers
  
  // Specific configurations
  keywords: text("keywords").array(), // For AgPal and search-based sources
  parseConfig: text("parse_config"), // JSON string for scraping selectors
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Data fetch logs for monitoring
export const dataFetchLogs = pgTable("data_fetch_logs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  dataSourceId: text("data_source_id").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  status: text("status").notNull(), // 'success', 'error', 'partial'
  itemsFound: text("items_found"), // Number of items discovered
  itemsProcessed: text("items_processed"), // Number of items successfully processed
  errorMessage: text("error_message"),
  responseTime: text("response_time"), // Milliseconds
  httpStatus: text("http_status"),
  lastModified: text("last_modified"), // From HTTP headers
  etag: text("etag"), // From HTTP headers
});

export const insertSubsidyProgramSchema = createInsertSchema(subsidyPrograms).omit({
  createdAt: true,
  updatedAt: true,
  dedupeKey: true, // This will be computed automatically
  daysUntilDeadline: true, // This will be computed automatically
});

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertDataFetchLogSchema = createInsertSchema(dataFetchLogs).omit({
  id: true,
  fetchedAt: true,
});

export type InsertSubsidyProgram = z.infer<typeof insertSubsidyProgramSchema>;
export type SubsidyProgram = typeof subsidyPrograms.$inferSelect;
export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSources.$inferSelect;
export type InsertDataFetchLog = z.infer<typeof insertDataFetchLogSchema>;
export type DataFetchLog = typeof dataFetchLogs.$inferSelect;
