import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { rssService } from "./services/rssService";
import { grantsGovService } from "./services/grantsGovService";
import { comprehensiveUsdaService } from "./services/comprehensiveUsdaService";
import { StateSpecificScraperService } from "./services/stateSpecificScraperService";
import { brazilService } from "./services/brazilService";
import { chileService } from "./services/chileService";
import { newZealandService } from "./services/newZealandService";
import { australiaService } from "./services/australiaService";
import { 
  validateBody, 
  validateQuery, 
  rateLimit, 
  requireAdminAuth,
  brazilSyncPortalSchema,
  chileSearchTermsSchema,
  grantsSearchSchema,
  programsSearchSchema,
  generalSyncSchema
} from "./middleware/validation";

export async function registerRoutes(app: Express): Promise<Server> {
  // RSS and subsidy program endpoints
  app.get("/api/programs", 
    rateLimit(20, 5 * 60 * 1000), // 20 requests per 5 minutes
    validateQuery(programsSearchSchema),
    async (req, res) => {
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

  app.get("/api/programs/deadlines", 
    rateLimit(20, 5 * 60 * 1000), // 20 requests per 5 minutes
    async (req, res) => {
    try {
      const deadlines = await rssService.getUpcomingDeadlines();
      res.json(deadlines);
    } catch (error) {
      console.error('Error fetching deadlines:', error);
      res.status(200).json([]); // Return empty array instead of 500 to prevent frontend errors
    }
  });

  app.post("/api/programs/sync", 
    requireAdminAuth,
    rateLimit(3, 10 * 60 * 1000), // 3 requests per 10 minutes
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const { maxPages, forceRefresh } = req.body;
      await rssService.syncRssData(forceRefresh);
      res.json({ success: true, message: 'RSS data synced successfully' });
    } catch (error) {
      console.error('Error syncing RSS data:', error);
      res.status(500).json({ error: 'Failed to sync RSS data' });
    }
  });

  // Grants.gov endpoints
  app.get("/api/grants/search", 
    rateLimit(10, 5 * 60 * 1000), // 10 requests per 5 minutes
    validateQuery(grantsSearchSchema),
    async (req, res) => {
    try {
      // Use validated and coerced parameters from middleware
      const { 
        agencies, 
        keyword, 
        rows,
        startRecordNum,
        oppStatuses,
        fundingCategories
      } = req.query;
      
      // Use validated parameters directly from middleware
      const searchParams = grantsGovService.validateSearchParams({
        agencies,
        keyword,
        rows,
        startRecordNum,
        oppStatuses,
        fundingCategories
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

  app.post("/api/grants/sync", 
    requireAdminAuth,
    rateLimit(3, 10 * 60 * 1000), // 3 requests per 10 minutes
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const { maxPages } = req.body;
      const processed = await grantsGovService.syncOpportunities(maxPages);
      res.json({ 
        success: true, 
        message: `Grants.gov sync completed: ${processed} opportunities processed` 
      });
    } catch (error) {
      console.error('Error syncing grants.gov:', error);
      res.status(500).json({ error: 'Failed to sync grants.gov data' });
    }
  });

  app.post("/api/grants/sync-usda", 
    requireAdminAuth,
    rateLimit(2, 15 * 60 * 1000), // 2 requests per 15 minutes
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const { maxPages } = req.body;
      const processed = await grantsGovService.syncUSDAAgencyOpportunities(maxPages);
      res.json({ 
        success: true, 
        message: `USDA agency sync completed: ${processed} opportunities processed` 
      });
    } catch (error) {
      console.error('Error syncing USDA agencies:', error);
      res.status(500).json({ error: 'Failed to sync USDA agency data' });
    }
  });

  // Comprehensive USDA web scraper endpoints
  app.post("/api/usda/sync-comprehensive", 
    requireAdminAuth,
    rateLimit(1, 30 * 60 * 1000), // 1 request per 30 minutes
    async (req, res) => {
    try {
      console.log('🚀 Starting comprehensive USDA sync via API...');
      await comprehensiveUsdaService.initialize();
      const results = await comprehensiveUsdaService.syncAllUsdaSources();
      
      res.json({ 
        success: true, 
        message: `Comprehensive USDA sync completed: ${results.totalPrograms} programs from ${results.totalStates} states`,
        breakdown: {
          nrcsPrograms: results.nrcsPrograms,
          agencyPrograms: results.agencyPrograms,
          totalStates: results.totalStates,
          totalPrograms: results.totalPrograms
        }
      });
    } catch (error) {
      console.error('Error in comprehensive USDA sync:', error);
      res.status(500).json({ error: 'Failed to sync comprehensive USDA data' });
    }
  });

  app.get("/api/usda/status", async (req, res) => {
    try {
      const isInitialized = await comprehensiveUsdaService.initialize();
      res.json({ 
        initialized: isInitialized,
        message: 'Comprehensive USDA service ready'
      });
    } catch (error) {
      console.error('Error checking USDA service status:', error);
      res.status(500).json({ error: 'Failed to check USDA service status' });
    }
  });

  // Initialize state-specific scraper service
  const stateSpecificScraperService = new StateSpecificScraperService();

  // Test endpoint for comprehensive USDA sync (no auth required)
  app.post("/api/usda/test-sync", 
    rateLimit(2, 30 * 60 * 1000), // 2 requests per 30 minutes
    async (req, res) => {
    try {
      console.log('🧪 Starting test comprehensive USDA sync...');
      await comprehensiveUsdaService.initialize();
      
      // Start the sync but limit to just Missouri to test with our known example
      const results = await comprehensiveUsdaService.syncAllUsdaSources();
      
      res.json({ 
        success: true, 
        message: `Test USDA sync completed: ${results.totalPrograms} programs from ${results.totalStates} states`,
        breakdown: {
          nrcsPrograms: results.nrcsPrograms,
          agencyPrograms: results.agencyPrograms,
          totalStates: results.totalStates,
          totalPrograms: results.totalPrograms
        }
      });
    } catch (error) {
      console.error('Error in test USDA sync:', error);
      res.status(500).json({ error: `Test sync failed: ${error}` });
    }
  });

  // Test endpoint for state-specific agricultural funding scraper
  app.post("/api/states/test-sync", 
    rateLimit(2, 30 * 60 * 1000), // 2 requests per 30 minutes
    async (req, res) => {
    try {
      console.log('🏛️  Starting test state-specific agricultural funding sync...');
      
      const totalPrograms = await stateSpecificScraperService.syncAllStates();
      
      res.json({ 
        success: true, 
        message: `State-specific sync completed: ${totalPrograms} programs from top 8 agricultural states`,
        states: [
          'California', 'Iowa', 'Nebraska', 'Texas', 
          'Kansas', 'Illinois', 'Minnesota', 'Wisconsin'
        ],
        totalPrograms: totalPrograms,
        sources: ['State Agriculture Departments', 'Extension Services']
      });
    } catch (error) {
      console.error('Error in test state-specific sync:', error);
      res.status(500).json({ error: `State sync failed: ${(error as Error).message}` });
    }
  });

  // Brazil agricultural funding endpoints
  app.post("/api/brazil/sync", 
    requireAdminAuth,
    rateLimit(5, 15 * 60 * 1000), // 5 requests per 15 minutes
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const initialized = await brazilService.initialize();
      if (!initialized) {
        return res.status(400).json({ 
          error: 'Brazil service initialization failed. Please check API token configuration.' 
        });
      }

      const { maxPages } = req.body;
      const results = await brazilService.syncAllSources();
      const totalProcessed = results.transfers + results.mapaNews + results.bndesNews;
      
      res.json({ 
        success: true, 
        message: `Brazil sync completed: ${totalProcessed} programs processed`,
        breakdown: {
          portalTransparencia: results.transfers,
          mapaNews: results.mapaNews,
          bndesNews: results.bndesNews
        }
      });
    } catch (error) {
      console.error('Error syncing Brazil data:', error);
      res.status(500).json({ error: 'Failed to sync Brazil agricultural funding data' });
    }
  });

  app.post("/api/brazil/sync-portal", 
    requireAdminAuth,
    rateLimit(3, 10 * 60 * 1000), // 3 requests per 10 minutes
    validateBody(brazilSyncPortalSchema),
    async (req, res) => {
    try {
      const { program, maxPages } = req.body;
      
      const initialized = await brazilService.initialize();
      if (!initialized) {
        return res.status(400).json({ 
          error: 'Brazil service initialization failed. Please check API token configuration.' 
        });
      }

      const transfers = await brazilService.fetchPortalTransfers(program, maxPages);
      res.json({ 
        success: true, 
        message: `Portal da Transparência sync completed: ${transfers.length} transfers fetched`,
        data: transfers
      });
    } catch (error) {
      console.error('Error syncing Portal da Transparência:', error);
      res.status(500).json({ error: 'Failed to sync Portal da Transparência data' });
    }
  });

  app.get("/api/brazil/mapa-news", async (req, res) => {
    try {
      const news = await brazilService.scrapeMapaNews();
      res.json({ 
        success: true, 
        data: news,
        count: news.length
      });
    } catch (error) {
      console.error('Error fetching MAPA news:', error);
      res.status(500).json({ error: 'Failed to fetch MAPA news' });
    }
  });

  app.get("/api/brazil/bndes-news", async (req, res) => {
    try {
      const news = await brazilService.scrapeBndesNews();
      res.json({ 
        success: true, 
        data: news,
        count: news.length
      });
    } catch (error) {
      console.error('Error fetching BNDES news:', error);
      res.status(500).json({ error: 'Failed to fetch BNDES news' });
    }
  });

  app.get("/api/brazil/programs", async (req, res) => {
    try {
      const { source } = req.query;
      let programs;
      
      if (source) {
        programs = await storage.getSubsidyProgramsBySource(source as string);
      } else {
        // Get all Brazil programs
        const sources = ['portal_transparencia', 'mapa_news', 'bndes_news'];
        programs = [];
        for (const sourceType of sources) {
          const sourcePrograms = await storage.getSubsidyProgramsBySource(sourceType);
          programs.push(...sourcePrograms);
        }
      }
      
      res.json(programs);
    } catch (error) {
      console.error('Error fetching Brazil programs:', error);
      res.status(500).json({ error: 'Failed to fetch Brazil programs' });
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

  // Chile agricultural funding endpoints
  app.post("/api/chile/sync", 
    requireAdminAuth,
    rateLimit(5, 15 * 60 * 1000), // 5 requests per 15 minutes
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const initialized = await chileService.initialize();
      if (!initialized) {
        return res.status(400).json({ 
          error: 'Chile service initialization failed. Please check connectivity.' 
        });
      }

      const { maxPages } = req.body;
      const results = await chileService.syncAllSources();
      const totalProcessed = results.tenders + results.budget + results.minagriNews + results.fiaCalls;
      
      res.json({ 
        success: true, 
        message: `Chile sync completed: ${totalProcessed} programs processed`,
        breakdown: {
          chileCompraTenders: results.tenders,
          presupuestoAbierto: results.budget,
          minagriNews: results.minagriNews,
          fiaCalls: results.fiaCalls
        }
      });
    } catch (error) {
      console.error('Error syncing Chile data:', error);
      res.status(500).json({ error: 'Failed to sync Chile agricultural funding data' });
    }
  });

  app.get("/api/chile/chilecompra-tenders", 
    rateLimit(10, 5 * 60 * 1000), // 10 requests per 5 minutes
    validateQuery(chileSearchTermsSchema),
    async (req, res) => {
    try {
      const { searchTerms } = req.query;
      const terms = searchTerms ? (searchTerms as string).split(',') : undefined;
      
      const tenders = await chileService.fetchChileCompraTenders(terms);
      res.json({ 
        success: true, 
        data: tenders,
        count: tenders.length
      });
    } catch (error) {
      console.error('Error fetching ChileCompra tenders:', error);
      res.status(500).json({ error: 'Failed to fetch ChileCompra tenders' });
    }
  });

  app.get("/api/chile/presupuesto-abierto", async (req, res) => {
    try {
      const budget = await chileService.fetchPresupuestoAbierto();
      res.json({ 
        success: true, 
        data: budget,
        count: budget.length
      });
    } catch (error) {
      console.error('Error fetching Presupuesto Abierto data:', error);
      res.status(500).json({ error: 'Failed to fetch Presupuesto Abierto data' });
    }
  });

  app.get("/api/chile/minagri-news", async (req, res) => {
    try {
      const news = await chileService.scrapeMinagriNews();
      res.json({ 
        success: true, 
        data: news,
        count: news.length
      });
    } catch (error) {
      console.error('Error fetching MINAGRI news:', error);
      res.status(500).json({ error: 'Failed to fetch MINAGRI news' });
    }
  });

  app.get("/api/chile/fia-calls", async (req, res) => {
    try {
      const calls = await chileService.scrapeFiaCalls();
      res.json({ 
        success: true, 
        data: calls,
        count: calls.length
      });
    } catch (error) {
      console.error('Error fetching FIA calls:', error);
      res.status(500).json({ error: 'Failed to fetch FIA calls' });
    }
  });

  app.get("/api/chile/programs", async (req, res) => {
    try {
      const { source } = req.query;
      let programs;
      
      if (source) {
        programs = await storage.getSubsidyProgramsBySource(source as string);
      } else {
        // Get all Chile programs
        const sources = ['chilecompra_api', 'presupuesto_abierto', 'minagri_news', 'fia_calls'];
        programs = [];
        for (const sourceType of sources) {
          const sourcePrograms = await storage.getSubsidyProgramsBySource(sourceType);
          programs.push(...sourcePrograms);
        }
      }
      
      res.json(programs);
    } catch (error) {
      console.error('Error fetching Chile programs:', error);
      res.status(500).json({ error: 'Failed to fetch Chile programs' });
    }
  });

  // Australia sync endpoints
  app.post('/api/sync/australia/all',
    requireAdminAuth,
    rateLimit(3, 10 * 60 * 1000), // 3 requests per 10 minutes  
    validateBody(generalSyncSchema),
    async (req, res) => {
    try {
      const { maxPages } = req.body;
      const result = await australiaService.syncAllSources(maxPages);
      res.json({ 
        success: true, 
        message: 'Australia comprehensive sync completed successfully',
        ...result
      });
    } catch (error) {
      console.error('Australia comprehensive sync error:', error);
      res.status(500).json({ error: 'Australia comprehensive sync failed' });
    }
  });

  app.post('/api/sync/australia/daff-rss',
    requireAdminAuth,
    rateLimit(5, 10 * 60 * 1000), // 5 requests per 10 minutes  
    async (req, res) => {
    try {
      const result = await australiaService.syncDaffRss();
      res.json({ 
        success: true, 
        message: 'Australia DAFF RSS sync completed successfully',
        processed: result
      });
    } catch (error) {
      console.error('Australia DAFF RSS sync error:', error);
      res.status(500).json({ error: 'Australia DAFF RSS sync failed' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
