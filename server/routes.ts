import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { rssService } from "./services/rssService";
import { grantsGovService } from "./services/grantsGovService";

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

  // Grants.gov endpoints
  app.get("/api/grants/search", async (req, res) => {
    try {
      const { 
        agencies, 
        keyword, 
        rows,
        startRecordNum,
        oppStatuses,
        fundingCategories
      } = req.query;
      
      // Validate and parse query parameters
      const searchParams = grantsGovService.validateSearchParams({
        agencies: agencies as string,
        keyword: keyword as string,
        rows: rows ? parseInt(rows as string) : undefined,
        startRecordNum: startRecordNum ? parseInt(startRecordNum as string) : undefined,
        oppStatuses: oppStatuses as string,
        fundingCategories: fundingCategories as string
      });
      
      const opportunities = await grantsGovService.searchOpportunities(searchParams);
      res.json(opportunities);
    } catch (error) {
      console.error('Error searching grants.gov:', error);
      res.status(500).json({ error: 'Failed to search grants.gov' });
    }
  });

  app.get("/api/grants/:opportunityNumber", async (req, res) => {
    try {
      const { opportunityNumber } = req.params;
      const detail = await grantsGovService.fetchOpportunityDetail(opportunityNumber);
      
      if (detail) {
        res.json(detail);
      } else {
        res.status(404).json({ error: 'Opportunity not found' });
      }
    } catch (error) {
      console.error('Error fetching opportunity detail:', error);
      res.status(500).json({ error: 'Failed to fetch opportunity detail' });
    }
  });

  app.post("/api/grants/sync", async (req, res) => {
    try {
      const processed = await grantsGovService.syncOpportunities();
      res.json({ 
        success: true, 
        message: `Grants.gov sync completed: ${processed} opportunities processed` 
      });
    } catch (error) {
      console.error('Error syncing grants.gov:', error);
      res.status(500).json({ error: 'Failed to sync grants.gov data' });
    }
  });

  app.post("/api/grants/sync-usda", async (req, res) => {
    try {
      const processed = await grantsGovService.syncUSDAAgencyOpportunities();
      res.json({ 
        success: true, 
        message: `USDA agency sync completed: ${processed} opportunities processed` 
      });
    } catch (error) {
      console.error('Error syncing USDA agencies:', error);
      res.status(500).json({ error: 'Failed to sync USDA agency data' });
    }
  });

  // Enhanced program endpoints for multi-source data
  app.get("/api/programs/sources", async (req, res) => {
    try {
      const sources = await storage.getDataSources();
      res.json(sources);
    } catch (error) {
      console.error('Error fetching data sources:', error);
      res.status(500).json({ error: 'Failed to fetch data sources' });
    }
  });

  app.get("/api/programs/high-priority", async (req, res) => {
    try {
      const programs = await storage.getHighPriorityPrograms();
      res.json(programs);
    } catch (error) {
      console.error('Error fetching high priority programs:', error);
      res.status(500).json({ error: 'Failed to fetch high priority programs' });
    }
  });

  app.get("/api/programs/by-source/:source", async (req, res) => {
    try {
      const { source } = req.params;
      const programs = await storage.getSubsidyProgramsBySource(source);
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs by source:', error);
      res.status(500).json({ error: 'Failed to fetch programs by source' });
    }
  });

  app.get("/api/fetch-logs", async (req, res) => {
    try {
      const { sourceId, limit } = req.query;
      const logs = await storage.getDataFetchLogs(
        sourceId as string, 
        limit ? parseInt(limit as string) : undefined
      );
      res.json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
