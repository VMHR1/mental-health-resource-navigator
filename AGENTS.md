# Project overview

Mental health program management system focused on program validation, location-based matching, and specialized search functionality.

## Core Domain Components

### Program Validation Framework
- Domain-specific validation for mental health services
- Service area validation with multi-region support
- Age range verification with special "and up" handling
- Insurance coverage validation
- 90-day reverification requirements
- Multiple verification source tracking

### Service Area Management
- Geographic service area definitions (point, counties, statewide)
- Virtual/telehealth service handling
- Multi-region coverage support
- County-based service area mapping

### Program Search & Matching
- Mental health terminology parsing
- Care level classification (PHP, IOP, Outpatient, Navigation, Crisis)
- Location-aware program matching
- Service domain categorization (mental health, substance use, co-occurring)
- Program relationship mapping based on care levels

## Business Rules

### Service Delivery Models
- Virtual service delivery requirements
- Hybrid program handling
- In-person location requirements
- Service area overlap calculations

### Program Classification
- Level of care categorization
- Service domain mapping
- Age range requirements
- Insurance acceptance rules
- Crisis resource handling

### Verification Requirements
- 90-day program reverification cycle
- Source documentation tracking
- Location precision levels
- Service area validation rules

## Development Guidelines

- Only modify code directly relevant to the specific request. Avoid changing unrelated functionality.
- Never replace code with placeholders like `# ... rest of the processing ...`. Always include complete code.
- Break problems into smaller steps. Think through each step separately before implementing.
- Always provide a complete plan with reasoning based on evidence from code and logs before making changes.
- Explain observations clearly, then provide reasoning to identify the exact issue. Add console logs when needed to gather more information.

## Core Business Components

1. **Program Validation Engine** (`js/data-validator.js`)
   - Domain-specific validation schema for mental health programs
   - Required fields validation for program identification and care levels
   - Service domain validation across mental health, substance use, and eating disorders
   - Program verification freshness checks (90-day requirement)

2. **Intelligent Search System** (`js/modules/search.js`)
   - Mental health program search with domain-specific parsing
   - Service area matching for city/region coverage
   - Care level classification (PHP, IOP, Outpatient, Navigation)
   - Age range interpretation for program eligibility
   - Crisis service detection and prioritization

3. **Distance Calculation Module** (`js/modules/distance.js`)
   - Specialized distance calculations for mental health programs
   - Virtual/telehealth service area handling
   - Multi-location program coverage analysis
   - Service boundary calculations

4. **Program Relationship Analysis** (`js/program-detail.js`)
   - Related program identification based on care levels
   - Service domain correlation
   - Location-based program relationships
   - Crisis service special handling

## Key Business Rules

- Program verification expires after 90 days
- Service areas support point, county, state, and multi-region models
- Crisis services receive specialized visibility handling
- Virtual services have distinct location processing
- Programs support multiple service domains
- Age ranges use mental health-specific eligibility parsing
