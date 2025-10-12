# Subsidy Companion

## Overview

Subsidy Companion is a comprehensive global agricultural funding intelligence platform covering 6 territories (Canada, US, Australia, New Zealand, Brazil, Chile). The application streamlines the complex process of finding, evaluating, and applying for conservation and agricultural subsidies by providing eligibility checking, practice exploration, submission pack generation, and deadline tracking. The system uses curated Excel spreadsheet data (287 programs) imported into PostgreSQL, replacing the previous unreliable web scraping approach. Design follows a clean, utility-first approach inspired by productivity applications like Notion and Linear.

## Recent Changes

### October 12, 2025 - Document Management System Implementation
- **New database tables**: Added `program_docs` (document linking) and `program_attributes` (flexible key-value storage)
- **PDF extraction**: Extracted 30 Canada PDFs from user-provided ZIP to `static/pdfs/canada/`
- **Secure PDF serving**: Implemented `/pdfs/*` endpoint with security controls:
  - PDF-only file type validation
  - File existence verification before serving
  - Secure HTTP headers (Content-Type, X-Content-Type-Options, Content-Disposition)
- **Document API endpoints**: 
  - GET /api/programs/:id/documents (with UUID validation and caching)
  - GET /api/documents/:doc_id
  - GET /api/programs/:id/attributes
- **Frontend updates**: Enhanced SubsidyBrowser with collapsible document sections
  - Lazy-loading of documents (fetched only when expanded)
  - Download/view buttons for PDFs and web links
  - Document type labels (guideline, application_form, reference, etc.)
- **Test data**: Inserted 5 sample documents (3 for AgriInnovation Program, 2 for AgriInvest)
- **Known limitations**:
  - Manifest CSV has only 2 sample entries vs 30 actual PDFs (incomplete mapping)
  - Ingestion script needs filename normalization to match extracted PDF names
  - No virus scanning on uploaded PDFs (production concern for global deployment)
  - No audit logging for document downloads (tracking needed for compliance)

### October 2, 2025 - Complete Migration to Curated Spreadsheet Data & Legacy Code Purge
- **Major architectural pivot**: Abandoned unreliable web scraping approach in favor of curated Excel spreadsheet data
- **Deleted all scraping services**: Removed 9 scraping service files (rssService, comprehensiveUsdaService, australiaService, newZealandService, brazilService, chileService, stateSpecificScraperService, grantsGovService, rssParser)
- **New curated data table**: Created `subsidy_programs_curated_10_01_25` with 287 real subsidy programs imported from user-provided Excel file
- **Verified program counts by territory**: CA=184, US=45, AU=14, CL=14, NZ=14, LATAM=9, BR=7 (Total: 287)
- **Simplified backend**: Rewrote routes.ts to provide read-only REST API endpoints (GET /api/programs, /api/programs/stats, /api/programs/:id)
- **Updated frontend interfaces**: Modified App.tsx and SubsidyBrowser.tsx to use snake_case field names (program_name, funding_amount, etc.) matching database schema exactly
- **Complete legacy code purge**:
  - Dropped old database tables: `subsidy_programs`, `data_sources`, `data_fetch_logs`
  - Rewrote `shared/schema.ts`: Removed all old table definitions, kept only `users` and `subsidy_programs_curated_10_01_25` with correct snake_case column names
  - Rewrote `server/storage.ts`: Removed all subsidy/data source CRUD methods, kept only minimal user authentication interface
  - Deleted `server/services/deduplicationService.ts`: Removed obsolete 700+ line deduplication logic
  - Fixed frontend field name mismatches: Changed all camelCase (programName) to snake_case (program_name) in App.tsx and SubsidyBrowser.tsx
- **Data source philosophy**: Curated reference data updated via spreadsheet re-import rather than continuous scraping
- **Zero legacy contamination**: Complete verification via grep/SQL queries confirmed no remaining references to old code or tables

### September 29, 2025 - Homepage Restructuring: Subsidies as Primary Content
- **Homepage restructured from 4 to 2 options**: Simplified from eligibility/practices/submission/deadlines to "Browse Subsidies" (primary) and "Check My Eligibility" to make subsidies the focal point
- **SubsidyBrowser component created**: New comprehensive subsidy browser with search, country filtering, sort options (deadline/priority/newest), and program statistics prominently displayed at top
- **All programs now visible**: Removed .slice(0,6) limitation to display complete program database instead of just 6 sample programs
- **Navigation simplified**: Updated to show Browse Subsidies, Check Eligibility, and Help; removed standalone submission pack and deadlines as they're now integrated workflows
- **End-to-end testing confirmed**: All functionality working correctly across the restructured interface with subsidies as primary content

### September 29, 2025 - Global Eligibility Checker Upgrade
- **Expanded Location Coverage**: Upgraded from 4 hardcoded US/Canada locations to 48 comprehensive options across all 6 territories
  - Canada: 7 locations (National + 6 provinces including Alberta, BC, Saskatchewan, Manitoba, Ontario, Quebec)
  - United States: 18 locations (National + 17 major agricultural states)
  - Australia: 8 locations (National + 7 states/territories)
  - New Zealand: 5 locations (National + 4 key regions)
  - Brazil: 5 locations (National + 4 regions)
  - Chile: 5 locations (National + 4 zones)
- **Enhanced Practice Selection**: Expanded from 5 basic practices to 14 comprehensive agricultural conservation techniques including modern options like soil health/cover crops, emissions reduction, agroforestry/silvopasture, drought resilience, and biodiversity/habitat management
- **Territory-Specific Program Logic**: Implemented centralized `getProgramByLocation()` function that displays realistic program names based on user's selected territory:
  - Canada: Canadian Agricultural Partnership (CAP) - AgriInvest
  - US: Environmental Quality Incentives Program (EQIP)
  - Australia: National Landcare Program
  - New Zealand: Sustainable Food and Fibre Futures (SFF Futures)
  - Brazil: PRONAF - Programa Nacional de Fortalecimento da Agricultura Familiar
  - Chile: FIA - Fundación para la Innovación Agraria
- **Technical Improvements**: 
  - Replaced non-standard `<optgroup>` with proper shadcn/Radix UI `SelectGroup` and `SelectLabel` components
  - Centralized territory-to-program mapping to eliminate code duplication and prevent drift
  - Maintained consistent location value prefixes for reliable territory detection
- **Validation**: End-to-end Playwright testing confirmed all 6 territories display correct program names and deadlines

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript in a single-page application (SPA) architecture
- **Build Tool**: Vite with custom configuration for development and production builds
- **State Management**: React Query (@tanstack/react-query) for server state management with built-in caching and error handling
- **UI Components**: Comprehensive design system using Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with custom design tokens following a utility-first approach
- **Routing**: Client-side routing with programmatic navigation between screens (eligibility, practices, submission, deadlines)

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful read-only API endpoints for curated subsidy data (GET operations)
- **Data Source**: Curated Excel spreadsheet with 287 programs across 6 territories
- **Import Process**: Direct SQL import from JSON-parsed spreadsheet via import_spreadsheet_data.ts

### Data Storage Solutions
- **Database**: PostgreSQL (Neon serverless) 
- **Active Tables**: 
  - `subsidy_programs_curated_10_01_25` - 287 curated programs (snake_case columns)
  - `program_docs` - Document linking table (PDFs, guides, forms, web links)
  - `program_attributes` - Flexible key-value storage for heterogeneous program data
  - `users` - User authentication (minimal, currently unused)
- **Schema**: All column names use snake_case (program_name, funding_amount, key_objectives, closing_date, etc.) matching database exactly
- **Data Updates**: Via re-running import_spreadsheet_data.ts when spreadsheet is updated
- **No legacy tables**: All pre-10.01.25 tables (subsidy_programs, data_sources, data_fetch_logs) have been dropped
- **Document Storage**: PDFs stored in static/pdfs/canada/ directory, served via secure /pdfs/* endpoint with validation

### Data Management
- **Data Source**: User-provided Excel spreadsheet with curated subsidy programs
- **Import Tool**: import_spreadsheet_data.ts script for loading spreadsheet into PostgreSQL
- **Caching Strategy**: React Query stale-while-revalidate patterns (10-30 minute stale times)
- **Data Integrity**: Single source of truth from spreadsheet, no web scraping

### Design System Architecture
- **Component Library**: Modular, reusable components with consistent props interfaces
- **Theme System**: CSS custom properties with light/dark mode support
- **Typography**: Inter font stack with systematic sizing and weight hierarchy
- **Color Palette**: Professional green primary with semantic color variants
- **Layout System**: Responsive grid layouts with consistent spacing primitives

### Development and Build Process
- **Development Server**: Vite development server with HMR and error overlay
- **Type Safety**: Comprehensive TypeScript configuration with strict checking
- **Code Quality**: ESBuild for production bundling with tree-shaking
- **Asset Management**: Static asset handling with path resolution aliases