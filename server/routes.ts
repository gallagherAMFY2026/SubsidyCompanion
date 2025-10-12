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

  // Get all documents for a program (with caching)
  app.get("/api/programs/:id/documents", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate UUID format to prevent SQL injection
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid program ID format' });
      }
      
      const documents = await sql`
        SELECT * FROM program_docs
        WHERE program_id = ${id}
        ORDER BY doc_type, display_name
      `;
      
      // Set cache headers (5 minutes)
      res.set('Cache-Control', 'public, max-age=300');
      res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // Get document by ID
  app.get("/api/documents/:doc_id", async (req, res) => {
    try {
      const { doc_id } = req.params;
      const document = await sql`
        SELECT * FROM program_docs
        WHERE doc_id = ${doc_id}
      `;
      
      if (document.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json(document[0]);
    } catch (error) {
      console.error('Error fetching document:', error);
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Get program attributes (with caching)
  app.get("/api/programs/:id/attributes", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid program ID format' });
      }
      
      const attributes = await sql`
        SELECT attr_key, attr_value FROM program_attributes
        WHERE program_id = ${id}
        ORDER BY attr_key
      `;
      
      // Set cache headers (5 minutes)
      res.set('Cache-Control', 'public, max-age=300');
      res.json(attributes);
    } catch (error) {
      console.error('Error fetching attributes:', error);
      res.status(500).json({ error: 'Failed to fetch attributes' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
