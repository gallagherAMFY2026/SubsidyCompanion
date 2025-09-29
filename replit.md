# Subsidy Companion

## Overview

Subsidy Companion is a comprehensive global agricultural funding intelligence platform covering 6 territories (Canada, US, Australia, New Zealand, Brazil, Chile). The application streamlines the complex process of finding, evaluating, and applying for conservation and agricultural subsidies by providing eligibility checking, practice exploration, submission pack generation, and deadline tracking. The system integrates with multiple government data sources across territories to provide real-time program information and uses a clean, utility-first design approach inspired by productivity applications like Notion and Linear.

## Recent Changes

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
- **API Design**: RESTful API endpoints with consistent error handling and logging middleware
- **Data Processing**: Custom RSS parsing service for Agriculture and Agri-Food Canada feeds
- **Storage Interface**: Abstracted storage layer with in-memory implementation and PostgreSQL schema support

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: Structured tables for users and subsidy programs with proper relationships
- **Migrations**: Drizzle Kit for database schema management and version control
- **Connection**: Neon Database serverless PostgreSQL with environment-based configuration

### External Service Integrations
- **RSS Feed Integration**: Automated parsing and synchronization of Canadian agriculture program data
- **Real-time Updates**: Configurable refresh intervals with force-refresh capabilities
- **Data Processing**: XML parsing with sanitization and structured data transformation
- **Caching Strategy**: Application-level caching with stale-while-revalidate patterns

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