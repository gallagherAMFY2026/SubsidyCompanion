# Subsidy Companion

## Overview

Subsidy Companion is a full-stack web application designed to help farmers navigate agricultural subsidy programs. The application streamlines the complex process of finding, evaluating, and applying for conservation and agricultural subsidies by providing eligibility checking, practice exploration, submission pack generation, and deadline tracking. The system integrates with Agriculture and Agri-Food Canada RSS feeds to provide real-time program information and uses a clean, utility-first design approach inspired by productivity applications like Notion and Linear.

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