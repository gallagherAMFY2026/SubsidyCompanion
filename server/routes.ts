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
import { z } from "zod";

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
      console.log('🔄 Starting comprehensive sync operation...');
      
      // RSS sync
      console.log('📡 Syncing RSS data...');
      await rssService.syncRssData(forceRefresh);
      
      // New Zealand comprehensive news sync
      console.log('🇳🇿 Syncing New Zealand agricultural funding news...');
      const nzResults = await newZealandService.syncAllSources();
      console.log(`New Zealand sync results:`, nzResults);
      
      // Enhanced storage stats
      const stats = await storage.getSubsidyProgramStats();
      console.log('📊 Post-sync stats:', stats);
      
      res.json({ 
        success: true, 
        message: 'RSS data synced successfully',
        stats 
      });
    } catch (error) {
      console.error('Error syncing RSS data:', error);
      res.status(500).json({ error: 'Failed to sync RSS data' });
    }
  });

  // Add a development-only sync endpoint (secured for development)
  app.post("/api/programs/force-sync", 
    rateLimit(5, 10 * 60 * 1000), // 5 requests per 10 minutes
    async (req, res) => {
    // Security: Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ error: 'Development endpoint not available in production' });
    }
    try {
      console.log('🔄 Starting development sync operation...');
      
      // RSS sync
      console.log('📡 Syncing RSS data...');
      await rssService.syncRssData(true);
      
      // New Zealand comprehensive news sync
      console.log('🇳🇿 Syncing New Zealand agricultural funding news...');
      const nzResults = await newZealandService.syncAllSources();
      console.log(`New Zealand sync results:`, nzResults);
      
      // Enhanced storage stats
      const stats = await storage.getSubsidyProgramStats();
      console.log('📊 Post-sync stats:', stats);
      
      res.json({ 
        success: true, 
        message: 'Development sync completed',
        stats 
      });
    } catch (error) {
      console.error('Error in development sync:', error);
      res.status(500).json({ error: 'Failed to sync data' });
    }
  });

  // Demo data seeding endpoint for press coverage
  app.post("/api/programs/seed-demo", 
    rateLimit(2, 30 * 60 * 1000), // 2 requests per 30 minutes
    async (req, res) => {
    try {
      console.log('🌱 Seeding demo data for press coverage...');
      
      // Clear existing data first
      const deletedCount = await storage.deleteAllSubsidyPrograms();
      console.log(`🧹 Cleared ${deletedCount} existing programs`);
      
      // Representative agricultural funding programs
      const demoPrograms = [
        {
          id: "demo-eqip-2024-ca-001",
          title: "Environmental Quality Incentives Program (EQIP)",
          summary: "Financial and technical assistance for implementing conservation practices on agricultural land",
          deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
          publishedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          url: "https://www.nrcs.usda.gov/programs-initiatives/eqip-environmental-quality-incentives-program",
          dataSource: "usda_nrcs",
          sourceUrl: "https://www.nrcs.usda.gov/programs-initiatives/eqip-environmental-quality-incentives-program",
          sourceAgency: "Natural Resources Conservation Service",
          country: "United States",
          region: "California",
          category: "Conservation",
          fundingAmount: "Up to $200,000 per contract",
          eligibilityTypes: ["farm", "producer", "organization"],
          fundingTypes: ["grant", "cost-share"],
          location: "California",
          isHighPriority: "true",
          opportunityNumber: "EQIP-2024-CA-001",
          dedupeKey: "environmental-quality-incentives-program-eqip-nrcs.usda.gov-usda_nrcs",
          mergedFromSources: ["usda_nrcs"]
        },
        {
          id: "demo-csp-2024-ia-002",
          title: "Conservation Stewardship Program",
          summary: "Payments for maintaining and improving existing conservation activities",
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          publishedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          url: "https://www.nrcs.usda.gov/programs-initiatives/csp-conservation-stewardship-program",
          dataSource: "usda_nrcs",
          sourceUrl: "https://www.nrcs.usda.gov/programs-initiatives/csp-conservation-stewardship-program",
          sourceAgency: "Natural Resources Conservation Service", 
          country: "United States",
          region: "Iowa",
          category: "Stewardship",
          fundingAmount: "$40-200 per acre annually",
          eligibilityTypes: ["farm", "producer"],
          fundingTypes: ["payment", "incentive"],
          location: "Iowa",
          isHighPriority: null,
          opportunityNumber: "CSP-2024-IA-002",
          dedupeKey: "conservation-stewardship-program-nrcs.usda.gov-usda_nrcs",
          mergedFromSources: ["usda_nrcs"]
        },
        {
          id: "demo-act-2024-on-003",
          title: "Agricultural Clean Technology Program",
          summary: "Support for farmers adopting clean technology and sustainable practices",
          deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
          publishedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          url: "https://agriculture.canada.ca/programs/agricultural-clean-technology",
          dataSource: "canada_agriculture",
          sourceUrl: "https://agriculture.canada.ca/programs/agricultural-clean-technology",
          sourceAgency: "Agriculture and Agri-Food Canada",
          country: "Canada",
          region: "Ontario",
          category: "Technology",
          fundingAmount: "Up to $100,000 CAD",
          eligibilityTypes: ["farm", "producer", "cooperative"],
          fundingTypes: ["grant", "support"],
          location: "Ontario",
          isHighPriority: "true",
          opportunityNumber: "ACT-2024-ON-003",
          dedupeKey: "agricultural-clean-technology-program-agriculture.canada.ca-canada_agriculture",
          mergedFromSources: ["canada_agriculture"]
        },
        {
          id: "demo-bfrdp-2024-tx-004",
          title: "Beginning Farmer and Rancher Development Program",
          summary: "Education, training, and technical assistance for new agricultural producers",
          deadline: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), // 75 days from now
          publishedDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          url: "https://www.nifa.usda.gov/beginning-farmer-rancher-development-program",
          dataSource: "usda_nifa",
          sourceUrl: "https://www.nifa.usda.gov/beginning-farmer-rancher-development-program",
          sourceAgency: "National Institute of Food and Agriculture",
          country: "United States",
          region: "Texas",
          category: "Education",
          fundingAmount: "$25,000-$750,000",
          eligibilityTypes: ["beginning_farmer", "organization", "education"],
          fundingTypes: ["grant", "training"],
          location: "Texas",
          isHighPriority: null,
          opportunityNumber: "BFRDP-2024-TX-004",
          dedupeKey: "beginning-farmer-and-rancher-development-program-nifa.usda.gov-usda_nifa",
          mergedFromSources: ["usda_nifa"]
        }
      ];
      
      // Insert demo programs
      let insertedCount = 0;
      for (const program of demoPrograms) {
        try {
          await storage.createSubsidyProgram(program);
          insertedCount++;
        } catch (error) {
          console.error('Error inserting demo program:', program.title, error);
        }
      }
      
      const stats = await storage.getSubsidyProgramStats();
      console.log('🌱 Demo seeding complete:', stats);
      
      res.json({ 
        success: true, 
        message: 'Demo data seeded successfully',
        insertedCount,
        stats 
      });
    } catch (error) {
      console.error('Error seeding demo data:', error);
      res.status(500).json({ error: 'Failed to seed demo data' });
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
    requireAdminAuth,
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

  // Validation schemas for enhanced endpoints
  const enhancedSearchSchema = z.object({
    query: z.string().optional(),
    country: z.string().optional(),
    region: z.string().optional(),
    category: z.string().optional(),
    dataSource: z.string().optional(),
    hasDeadline: z.enum(['true', 'false']).optional(),
    isHighPriority: z.enum(['true', 'false']).optional(),
    deadlineWithinDays: z.string().regex(/^\d+$/).optional(),
    fundingTypes: z.array(z.string()).optional(),
    eligibilityTypes: z.array(z.string()).optional(),
  });

  // Enhanced subsidy programs endpoints (using new storage system)
  app.get("/api/programs/enhanced", 
    rateLimit(20, 5 * 60 * 1000), // 20 requests per 5 minutes
    validateQuery(enhancedSearchSchema),
    async (req, res) => {
    try {
      const {
        query,
        country,
        region,
        category,
        dataSource,
        hasDeadline,
        isHighPriority,
        deadlineWithinDays,
        fundingTypes,
        eligibilityTypes
      } = req.query;

      // Parse array parameters
      const fundingTypesArray = fundingTypes ? 
        (Array.isArray(fundingTypes) ? fundingTypes : [fundingTypes]) : undefined;
      const eligibilityTypesArray = eligibilityTypes ? 
        (Array.isArray(eligibilityTypes) ? eligibilityTypes : [eligibilityTypes]) : undefined;

      const programs = await storage.searchSubsidyPrograms({
        query: query as string,
        country: country as string,
        region: region as string,
        category: category as string,
        dataSource: dataSource as string,
        hasDeadline: hasDeadline === 'true' ? true : hasDeadline === 'false' ? false : undefined,
        isHighPriority: isHighPriority === 'true' ? true : isHighPriority === 'false' ? false : undefined,
        deadlineWithinDays: deadlineWithinDays ? parseInt(deadlineWithinDays as string) : undefined,
        fundingTypes: fundingTypesArray as string[],
        eligibilityTypes: eligibilityTypesArray as string[]
      });

      res.json(programs);
    } catch (error) {
      console.error('Error searching enhanced programs:', error);
      res.status(500).json({ error: 'Failed to search programs' });
    }
  });

  // Geographic filtering endpoints
  app.get("/api/programs/by-country/:country", 
    rateLimit(20, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const { country } = req.params;
      const programs = await storage.getSubsidyProgramsByCountry(country);
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs by country:', error);
      res.status(500).json({ error: 'Failed to fetch programs by country' });
    }
  });

  app.get("/api/programs/by-region/:region", 
    rateLimit(20, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const { region } = req.params;
      const programs = await storage.getSubsidyProgramsByRegion(region);
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs by region:', error);
      res.status(500).json({ error: 'Failed to fetch programs by region' });
    }
  });

  // Deadline-focused endpoints
  app.get("/api/programs/deadlines-soon", 
    rateLimit(20, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const programs = await storage.getSubsidyProgramsDeadlinesSoon(parseInt(days as string));
      res.json(programs);
    } catch (error) {
      console.error('Error fetching upcoming deadlines:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming deadlines' });
    }
  });

  app.get("/api/programs/no-deadlines", 
    rateLimit(20, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const programs = await storage.getSubsidyProgramsWithoutDeadlines();
      res.json(programs);
    } catch (error) {
      console.error('Error fetching programs without deadlines:', error);
      res.status(500).json({ error: 'Failed to fetch programs without deadlines' });
    }
  });

  // Analytics and statistics endpoint
  app.get("/api/programs/stats", 
    rateLimit(10, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const stats = await storage.getSubsidyProgramStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching program statistics:', error);
      res.status(500).json({ error: 'Failed to fetch program statistics' });
    }
  });

  // High priority programs endpoint
  app.get("/api/programs/high-priority", 
    rateLimit(20, 5 * 60 * 1000),
    async (req, res) => {
    try {
      const programs = await storage.getHighPriorityPrograms();
      res.json(programs);
    } catch (error) {
      console.error('Error fetching high priority programs:', error);
      res.status(500).json({ error: 'Failed to fetch high priority programs' });
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
      const result = await australiaService.syncAllSources();
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

  // Enhanced global sync endpoints (all territories with user-provided sources)
  app.post('/api/sync/enhanced/all',
    requireAdminAuth,
    rateLimit(1, 30 * 60 * 1000), // 1 request per 30 minutes
    async (req, res) => {
    try {
      console.log('🌍 Starting enhanced global agricultural funding sync...');
      const startTime = Date.now();
      
      const [canadaResult, nzResult, usResult, australiaResult, brazilResult, chileResult] = await Promise.allSettled([
        rssService.syncCanadianFunding(), // Canada integrated via RSS service for now
        newZealandService.syncAllSources(),
        comprehensiveUsdaService.syncAllUsdaSources(),
        australiaService.syncAllSources(),
        brazilService.syncAllSources(),
        chileService.syncAllSources()
      ]);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const results = {
        canada: canadaResult.status === 'fulfilled' ? canadaResult.value : { error: canadaResult.reason },
        newZealand: nzResult.status === 'fulfilled' ? nzResult.value : { error: nzResult.reason },
        unitedStates: usResult.status === 'fulfilled' ? usResult.value : { error: usResult.reason },
        australia: australiaResult.status === 'fulfilled' ? australiaResult.value : { error: australiaResult.reason },
        brazil: brazilResult.status === 'fulfilled' ? brazilResult.value : { error: brazilResult.reason },
        chile: chileResult.status === 'fulfilled' ? chileResult.value : { error: chileResult.reason }
      };
      
      console.log(`🌍 Enhanced global sync completed in ${duration}s`);
      
      res.json({ 
        success: true, 
        message: 'Enhanced global agricultural funding sync completed',
        duration: `${duration}s`,
        results
      });
    } catch (error) {
      console.error('Enhanced global sync error:', error);
      res.status(500).json({ error: 'Enhanced global sync failed' });
    }
  });

  app.post('/api/sync/enhanced/territory/:territory',
    requireAdminAuth,
    rateLimit(3, 10 * 60 * 1000), // 3 requests per 10 minutes per territory
    async (req, res) => {
    try {
      const { territory } = req.params;
      let result;
      
      switch (territory.toLowerCase()) {
        case 'canada':
          result = await rssService.syncCanadianFunding();
          break;
        case 'newzealand':
        case 'new-zealand':
          result = await newZealandService.syncAllSources();
          break;
        case 'unitedstates':
        case 'united-states':
        case 'us':
        case 'usa':
          result = await comprehensiveUsdaService.syncAllUsdaSources();
          break;
        case 'australia':
          result = await australiaService.syncAllSources();
          break;
        case 'brazil':
          result = await brazilService.syncAllSources();
          break;
        case 'chile':
          result = await chileService.syncAllSources();
          break;
        default:
          return res.status(400).json({ error: `Unknown territory: ${territory}. Supported: canada, newzealand, unitedstates, australia, brazil, chile` });
      }
      
      res.json({ 
        success: true, 
        message: `Enhanced ${territory} agricultural funding sync completed`,
        result
      });
    } catch (error) {
      console.error(`Enhanced ${req.params.territory} sync error:`, error);
      res.status(500).json({ error: `Enhanced ${req.params.territory} sync failed` });
    }
  });

  app.get('/api/enhanced/stats',
    rateLimit(10, 60 * 1000), // 10 requests per minute
    async (req, res) => {
    try {
      const stats = await storage.getSubsidyProgramStats();
      const territoryStats = await Promise.all([
        storage.getSubsidyProgramsByCountry('Canada'),
        storage.getSubsidyProgramsByCountry('New Zealand'),
        storage.getSubsidyProgramsByCountry('United States'),
        storage.getSubsidyProgramsByCountry('Australia'),
        storage.getSubsidyProgramsByCountry('Brazil'),
        storage.getSubsidyProgramsByCountry('Chile')
      ]);
      
      res.json({
        global: stats,
        territories: {
          canada: territoryStats[0].length,
          newZealand: territoryStats[1].length,
          unitedStates: territoryStats[2].length,
          australia: territoryStats[3].length,
          brazil: territoryStats[4].length,
          chile: territoryStats[5].length
        },
        coverage: {
          total: 6,
          active: territoryStats.filter(t => t.length > 0).length
        }
      });
    } catch (error) {
      console.error('Enhanced stats error:', error);
      res.status(500).json({ error: 'Failed to get enhanced stats' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
