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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubsidyProgramSchema = createInsertSchema(subsidyPrograms).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertSubsidyProgram = z.infer<typeof insertSubsidyProgramSchema>;
export type SubsidyProgram = typeof subsidyPrograms.$inferSelect;
