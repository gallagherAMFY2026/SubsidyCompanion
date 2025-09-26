# Subsidy Companion Design Guidelines

## Design Approach
**Reference-Based Approach**: Drawing inspiration from productivity-focused applications like **Notion** and **Linear** for their clean, functional design that prioritizes user tasks over visual flourish. The design emphasizes clarity, efficiency, and trust-building for farmers navigating complex subsidy processes.

## Core Design Principles
- **Utility-first**: Every element serves the farmer's goal of completing eligibility and submission tasks
- **Progressive disclosure**: Complex information revealed step-by-step to avoid overwhelming users
- **Trust through transparency**: Clear language, cited sources, and realistic expectations
- **Offline-friendly**: Print-optimized layouts and downloadable assets

## Color Palette
**Primary Colors (Light Mode)**: 
- Primary: 142 69% 45% (professional green)
- Secondary: 210 20% 25% (dark slate)
- Background: 0 0% 98% (warm white)

**Primary Colors (Dark Mode)**:
- Primary: 142 50% 55% (lighter green)
- Secondary: 210 15% 75% (light slate)
- Background: 210 20% 8% (dark slate)

**Accent Colors**: 
- Success: 120 60% 50% (confirmation green)
- Warning: 38 92% 50% (deadline amber)
- Error: 0 65% 55% (validation red)

**Background Treatments**: Clean, minimal backgrounds with subtle texture only in hero sections. Focus on generous whitespace and clear content hierarchy.

## Typography
**Font Stack**: Inter (primary), system fonts fallback
- Headlines: 600 weight, 1.5rem-2.5rem
- Body text: 400 weight, 1rem
- Labels/UI: 500 weight, 0.875rem
- Fine print: 400 weight, 0.75rem

## Layout System
**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Tight spacing (p-2, m-2) for form elements
- Standard spacing (p-4, gap-4) for card layouts
- Generous spacing (p-8, mt-12) for section breaks

## Component Library

### Core Components
- **Eligibility Cards**: Clean cards with program name, cost-share percentage, and next steps
- **Progress Indicators**: Simple step counters (1 of 3) for multi-step flows
- **Practice Cards**: Visual cards showing practice type, typical costs, and verification requirements
- **Submission Pack Preview**: Document-style layout with clear sections and print formatting

### Navigation
- **Top Navigation**: Simple horizontal nav with 4-5 primary sections
- **Breadcrumbs**: Clear path indication for multi-step processes
- **Quick Actions**: Prominent CTAs for "Check Eligibility" and "Generate Pack"

### Forms
- **Progressive Forms**: Single-screen eligibility form with grouped sections
- **Smart Dropdowns**: Location and practice selection with type-ahead
- **Validation**: Real-time feedback with clear error states

### Data Display
- **Summary Tables**: Clean, scannable layouts for deadline calendars
- **Info Panels**: Highlighted boxes for important program details
- **Document Previews**: PDF-style layouts optimized for printing

## Mobile Considerations
- **Touch-first**: Large tap targets (44px minimum)
- **Vertical layouts**: Single-column forms and card stacks
- **Simplified navigation**: Collapsible menu with essential actions visible

## Trust & Credibility Elements
- **Source Citations**: Subtle links to official program pages
- **Disclaimer Text**: Clear "likely eligible" language, never promises
- **Progress Saving**: Optional contact collection for pack delivery
- **Print Optimization**: Clean, professional document layouts

## Animations
**Minimal Animation Strategy**: 
- Subtle transitions for form validation (200ms)
- Smooth page transitions (300ms ease-out)
- No decorative animations that might feel unprofessional

## Images
**No Large Hero Image**: This is a utility-focused application where farmers come to complete specific tasks. Instead:
- **Small Icons**: Practice-specific illustrations (fencing, water systems, etc.)
- **Diagram Previews**: Simple line drawings showing practice layouts
- **Document Thumbnails**: Preview images of generated submission packs
- **Accessibility Icons**: Clear visual indicators for different program types

The visual focus should be on clean, scannable information rather than large imagery that might slow loading or distract from core tasks.