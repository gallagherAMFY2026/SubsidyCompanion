import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { rssService } from "./services/rssService";

export async function registerRoutes(app: Express): Promise<Server> {
  // RSS and subsidy program endpoints
  app.get("/api/programs", async (req, res) => {
    try {
      const { query, category, location, force_refresh } = req.query;
      
      // Force refresh first if requested
      if (force_refresh === 'true') {
        await rssService.getPrograms(true);
      }
      
      // Then apply filters
      let programs;
      if (location) {
        programs = await rssService.getProgramsByLocation(location as string);
      } else {
        programs = await rssService.searchPrograms(
          query as string,
          category as string
        );
      }
      
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs:', error);
      res.status(200).json([]); // Return empty array instead of 500 to prevent frontend errors
    }
  });

  app.get("/api/programs/deadlines", async (req, res) => {
    try {
      const deadlines = await rssService.getUpcomingDeadlines();
      res.json(deadlines);
    } catch (error) {
      console.error('Error fetching deadlines:', error);
      res.status(200).json([]); // Return empty array instead of 500 to prevent frontend errors
    }
  });

  app.post("/api/programs/sync", async (req, res) => {
    try {
      await rssService.syncRssData();
      res.json({ success: true, message: 'RSS data synced successfully' });
    } catch (error) {
      console.error('Error syncing RSS data:', error);
      res.status(500).json({ error: 'Failed to sync RSS data' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
