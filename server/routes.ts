import type { Express } from "express";
import { createServer, type Server } from "http";
import { neon } from '@neondatabase/serverless';

export async function registerRoutes(app: Express): Promise<Server> {
  const sql = neon(process.env.DATABASE_URL!);

  // Get all curated subsidy programs
  app.get("/api/programs", async (req, res) => {
    try {
      const { country, search } = req.query;
      
      let query = `SELECT * FROM subsidy_programs_curated_10_01_25`;
      const conditions = [];
      const params: string[] = [];
      
      if (country && country !== 'all') {
        conditions.push(`country = $${params.length + 1}`);
        params.push(country as string);
      }
      
      if (search) {
        conditions.push(`(
          program_name ILIKE $${params.length + 1} OR 
          description ILIKE $${params.length + 1} OR
          key_objectives ILIKE $${params.length + 1} OR
          focus ILIKE $${params.length + 1}
        )`);
        params.push(`%${search}%`);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY country, program_name`;
      
      const programs = await sql(query, params);
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs:', error);
      res.status(500).json({ error: 'Failed to fetch programs' });
    }
  });

  // Get program statistics by country
  app.get("/api/programs/stats", async (req, res) => {
    try {
      const stats = await sql`
        SELECT 
          country,
          COUNT(*) as count
        FROM subsidy_programs_curated_10_01_25
        GROUP BY country
        ORDER BY count DESC
      `;
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Get single program by ID
  app.get("/api/programs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const program = await sql`
        SELECT * FROM subsidy_programs_curated_10_01_25
        WHERE id = ${id}
      `;
      
      if (program.length === 0) {
        return res.status(404).json({ error: 'Program not found' });
      }
      
      res.json(program[0]);
    } catch (error) {
      console.error('Error fetching program:', error);
      res.status(500).json({ error: 'Failed to fetch program' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
