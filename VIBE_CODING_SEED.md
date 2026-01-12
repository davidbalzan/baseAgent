# Vibe Coding Project Seed

A documentation-driven approach to building software projects with AI assistance. This document serves as a prompt/template to bootstrap new projects with a structured, phase-based development methodology.

---

## 🎯 Philosophy

**Vibe coding** is about maintaining momentum while building complex software with AI assistance. The key principles:

1. **Documentation as Code** - Plans are living documents with checkboxes that track progress
2. **Phase-Based Development** - Break overwhelming projects into digestible phases
3. **Progressive Disclosure** - Each phase folder contains increasing detail levels
4. **AI-Friendly Structure** - Clear hierarchy helps AI assistants maintain context
5. **Iterative Planning** - Plans evolve as you learn more about the domain

---

## 📁 Monorepo Project Structure

This approach uses a **monorepo structure** with separate packages for client and server, unified by shared documentation and tooling at the root level.

```
project-root/
├── README.md                    # Quick start, setup, overview
├── package.json                 # Root package.json (workspace config)
├── pnpm-workspace.yaml          # Workspace definition (or npm/yarn equivalent)
│
├── client/                      # Frontend application
│   ├── package.json            # Client dependencies
│   ├── src/
│   │   ├── components/         # UI components
│   │   ├── features/           # Feature modules (domain logic + UI)
│   │   ├── pages/              # Route pages
│   │   ├── api/                # API client / WebSocket handlers
│   │   ├── store.ts            # State management
│   │   └── main.tsx            # Entry point
│   ├── public/                 # Static assets
│   └── index.html
│
├── server/                      # Backend application
│   ├── package.json            # Server dependencies
│   ├── src/
│   │   ├── api/                # REST route handlers
│   │   ├── features/           # Feature modules (business logic)
│   │   ├── middleware/         # Request middleware
│   │   ├── services/           # Shared services
│   │   ├── auth/               # Authentication logic
│   │   ├── config/             # Configuration management
│   │   ├── utils/              # Utility functions
│   │   └── index.ts            # Entry point
│   ├── migrations/             # Database migrations
│   └── drizzle.config.ts       # ORM configuration
│
├── proto/                       # Shared protocol definitions (optional)
│   ├── common.proto            # Shared message types
│   └── [feature].proto         # Feature-specific protocols
│
└── docs/                        # Project documentation
    ├── README.md               # Documentation index & navigation
    ├── PRODUCTION_ROADMAP.md   # High-level roadmap with all phases
    ├── TECH_STACK.md           # Technology choices & versions
    ├── ARCHITECTURE_GUIDE.md   # System architecture & decisions
    │
    └── phases/                 # Detailed implementation plans
        ├── README.md          # Phase overview & progress tracking
        ├── phase1/
        │   ├── README.md      # Phase overview, deliverables, timeline
        │   └── PHASE1_TASKS.md # Detailed tasks with checkboxes
        ├── phase2/
        │   ├── README.md
        │   └── PHASE2_TASKS.md
        └── ... (phases 3-N)
```

### Why Monorepo?

- **Shared tooling** - Single ESLint, TypeScript, and Prettier config
- **Atomic commits** - Frontend and backend changes in one commit
- **Simplified dependencies** - Shared types, protocols, and utilities
- **Unified documentation** - One `docs/` folder covers the whole system
- **Easier refactoring** - Cross-package changes are easier to coordinate

### Package Boundaries

| Package | Responsibility | Dependencies |
|---------|---------------|--------------|
| `client/` | UI, user interactions, state | API client, shared types |
| `server/` | Business logic, data persistence, auth | Database, external services |
| `proto/` | Shared message definitions | None (generates code for both) |
| `docs/` | Documentation only | N/A |

### Feature-Based Organization

Both `client/` and `server/` use a **feature-based** organization pattern inside their `features/` directories. Each feature is a self-contained module:

```
features/
├── wallet/                  # Wallet feature
│   ├── WalletDisplay.tsx   # (client) UI component
│   ├── walletSlice.ts      # (client) State management
│   ├── walletRoutes.ts     # (server) API routes
│   ├── walletService.ts    # (server) Business logic
│   └── walletTypes.ts      # Shared types
│
├── leaderboard/            # Leaderboard feature
│   ├── Leaderboard.tsx
│   ├── leaderboardRoutes.ts
│   └── ...
│
└── [feature-name]/         # Pattern repeats
```

**Benefits**:
- **Colocation** - Related code lives together
- **Discoverability** - Easy to find all code for a feature
- **Modularity** - Features can be developed/tested in isolation
- **Scalability** - Add new features without touching existing code

---

## 📋 Core Document Types

### 1. Production Roadmap (`PRODUCTION_ROADMAP.md`)

**Purpose**: The master document that provides a bird's-eye view of the entire journey from POC to production. This is the first document stakeholders read.

**Key Sections Explained**:

#### Current State Assessment
Be brutally honest about where you are. This creates urgency and justifies the work.

```markdown
## Current State Assessment

### ✅ What We Have (POC Level)
- 6 working games (Slots, Wheel, Pigman, Blackjack, High/Low, Roulette)
- Basic wallet system (balance, transactions)
- WebSocket and REST APIs
- Interactive API documentation

### ⚠️ What's Missing for Production
- Authentication & authorization
- Rate limiting & abuse prevention
- Error handling & monitoring
- Security hardening
- Multi-tenancy support
```

#### Phase Breakdown
Each phase gets a summary with **specific deliverables** (not vague goals):

```markdown
## Phase 2: Authentication & Authorization

**Goal:** Implement flexible authentication supporting multiple providers
**Duration:** 3-4 weeks

### 2.1 Authentication Architecture
[Include ASCII diagrams showing the flow]

### 2.2 Implementation Tasks
- [ ] JWT validation middleware (support multiple issuers)
- [ ] Claims-based authorization middleware
- [ ] Role definition system (player, admin, operator, super-admin)
- [ ] Tenant isolation middleware

### 2.3 Authorization Roles & Permissions
```typescript
enum Role {
  PLAYER = 'player',           // Play games, view own data
  MODERATOR = 'moderator',     // Ban users, view reports
  OPERATOR = 'operator',       // Configure games, view analytics
  ADMIN = 'admin',            // Full access to tenant
}
```
```

#### Implementation Priority Matrix
The roadmap must clearly communicate **dependencies** and **blocking items**:

```markdown
## Implementation Priority Matrix

| Phase | Priority | Blocking? | Complexity | Duration |
|-------|----------|-----------|------------|----------|
| Phase 1: API Endpoints | 🔴 HIGH | Yes | Medium | 2-3 weeks |
| Phase 2: Auth | 🔴 HIGH | Yes | High | 3-4 weeks |
| Phase 3: Security | 🔴 HIGH | Yes | Medium | 2 weeks |
| Phase 4: Monitoring | 🟡 MEDIUM | No | Medium | 2 weeks |
| Phase 5: Performance | 🟡 MEDIUM | No | High | 2-3 weeks |
```

#### Quick Wins Section
Identify things that can be done **immediately** to show progress:

```markdown
## Quick Wins (Can Start Immediately)

1. **Enhanced Wallet Endpoints** (1 week)
   - Transaction history with filtering
   - Wallet summary endpoints
   
2. **Input Validation** (3 days)
   - Add Zod schemas to all endpoints
   
3. **Error Handling** (3 days)
   - Standardize error responses
   - Add structured logging
```

#### Success Metrics
Define what "done" looks like with **measurable criteria**:

```markdown
## Success Metrics

**Technical:**
- ✅ 99.9% uptime
- ✅ <200ms p95 API latency
- ✅ Support 10,000 concurrent users
- ✅ 0 critical security vulnerabilities

**Business:**
- ✅ 5+ tenants onboarded
- ✅ <24h tenant onboarding time
- ✅ Self-service documentation coverage >80%
```

---

### 2. Tech Stack (`TECH_STACK.md`)

**Purpose**: Single source of truth for all technology decisions. AI assistants use this to understand the project's technical constraints.

**Key Sections**:

```markdown
# Project - Complete Tech Stack

## 📋 Overview
A **monorepo-based platform** built with modern web technologies.

## 🏗️ Architecture
### Monorepo Structure
```
project/
├── client/          # React + Vite frontend
├── server/          # Node.js backend
├── proto/           # Protocol Buffer definitions (if used)
└── docs/            # Documentation
```

## 🎨 Frontend Stack (client/)

### Core Framework & Build
- **React**: 19.x - UI framework
- **Vite**: 7.x - Build tool & dev server
- **TypeScript**: 5.x - Type safety

### Styling & UI
- **Tailwind CSS**: 4.x - Utility-first CSS
- **[Other UI libs]**: Version - Purpose

### State Management
- **Zustand**: 5.x - Lightweight global state

## 🖥️ Backend Stack (server/)

### Core Framework & Runtime
- **Node.js**: 22+ (LTS)
- **Hono**: 4.x - Web framework
- **TypeScript**: 5.x

### Database & ORM
- **Drizzle ORM**: 0.4x - Type-safe SQL
- **MySQL**: 8.0+ / **PostgreSQL**: 17

## 📦 Infrastructure

### Package Management
- **pnpm**: 10.x - Monorepo workspaces

### Local Services
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8799

## 📈 Dependency Summary

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.x | UI Framework |
| Vite | 7.x | Build Tool |
| Hono | 4.x | Web Framework |
```

---

### 3. Architecture Guide (`ARCHITECTURE_GUIDE.md`)

**Purpose**: Documents **why** architectural decisions were made, not just what they are. Critical for onboarding and maintaining consistency.

**Key Sections**:

```markdown
# Project - Architecture Guide

## Current Architecture Overview

```
[ASCII diagram of system components]
```

## Why [Decision X]?

### Problems [Alternative] Creates
1. **Problem 1**
   - Code example showing the issue
   
2. **Problem 2**
   - Performance/maintenance implications

## Why Current Approach is Better

### [Pattern Name]
- ✅ Benefit 1
- ✅ Benefit 2
- ✅ Benefit 3

```tsx
// Code example showing the preferred pattern
```

## Upgrade Paths

### Phase 1: Current State ✅ (Now)
**What:** Current approach
**Best for:** Current scale
**Effort:** None - already implemented

### Phase 2: Growing Complexity → [Next Approach]
**When to upgrade:**
- Trigger condition 1
- Trigger condition 2

**Migration effort:** Low/Medium/High (X days)

## Decision Matrix

| Need | Solution | Effort | When |
|------|----------|--------|------|
| Quick prototype | Current | ⭐ | Now ✓ |
| Prevent conflicts | Next level | ⭐⭐ | Growth |
| External sharing | Advanced | ⭐⭐⭐⭐ | Maturity |

## Best Practices

### 1. Pattern Name
```tsx
// DO: Good example
// DON'T: Bad example
```

## Performance Implications

### Current Approach
```
Bundle Size: Xkb
Runtime: Optimal
```
```

---

### 4. Design System (`DESIGN_SYSTEM.md`)

**Purpose**: Visual language reference for consistent UI. Essential for AI when generating frontend code.

**Key Sections**:

```markdown
# Project - Design System

## Color Palette

### Primary Colors
- **Primary**: `#3b82f6` - Main actions, buttons
- **Primary Dark**: `#1e40af` - Hover states
- **Primary Light**: `#dbeafe` - Backgrounds

### Status Colors
- **Success**: `#10b981` (Green) - Positive feedback
- **Warning**: `#f59e0b` (Amber) - Cautions
- **Error**: `#ef4444` (Red) - Errors, destructive

### Neutral Scale
```
50    #f9fafb  (Page background)
100   #f3f4f6  (Alt background)
200   #e5e7eb  (Borders)
500   #6b7280  (Secondary text)
900   #111827  (Primary text)
```

## Typography

### Font Stack
```css
--font-primary: 'Inter', sans-serif;
```

### Type Scale
- **Display**: 24px - Page headings
- **Title**: 18px - Section headings
- **Body**: 14px - Main content
- **Caption**: 12px - Meta info

## Components

### Cards
```css
background: #ffffff;
border: 1px solid #e5e7eb;
border-radius: 12px;
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
```

### Buttons
```tsx
// Primary
className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"

// Secondary
className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-200"
```

## Spacing Scale
```
1   4px
2   8px
4   16px
6   24px
8   32px
```

## Accessibility

### Contrast Ratios
- Normal text: Minimum 4.5:1
- Large text: Minimum 3:1

### Focus States
- 2px focus ring on all interactive elements
```

---

### 5. Phases Overview (`phases/README.md`)

**Purpose**: Track overall phase progress, provide navigation, and summarize each phase.

**Structure**:
```markdown
# Production Readiness Phases

## 📂 Phase Organization
Each phase has its own folder with:
- `README.md` - Phase overview and quick reference
- `PHASE[N]_TASKS.md` - Detailed task breakdown with checklists

## 🗺️ Roadmap Overview
| Phase | Focus Area | Duration | Status |
|-------|-----------|----------|--------|
| [Phase 1](./phase1/) | [Description] | X weeks | 🚧 Ready to Start |

## 📋 Phase Summaries

### Phase 1: [Name] (X weeks)
**Goal**: [One-liner goal]

**Key Deliverables**:
- Deliverable 1
- Deliverable 2

**Success Criteria**: [How we know it's done]

---
[Repeat for each phase]

## 📊 Progress Tracking
- **Completed Phases**: 0/N
- **Current Phase**: Phase 1
- **Overall Progress**: 0%

## 📝 Documentation Standards
Each phase follows the same structure:
- Clear overview with goals and deliverables
- Detailed task breakdown with checkboxes
- Code examples and implementation patterns
- Testing requirements
- Success criteria
```

---

### 6. Individual Phase README (`phases/phaseN/README.md`)

**Purpose**: Quick reference for a specific phase. Used for sprint planning, stakeholder updates, and onboarding new team members to a phase.

**Key Sections Explained**:

```markdown
# Phase 2: Authentication & Authorization

**Duration**: 3-4 weeks  
**Status**: 🚧 IN PROGRESS  
**Priority**: 🔴 CRITICAL - Blocking for production

---

## 🎯 Phase Overview

**Goal**: Implement flexible authentication supporting external providers with full RBAC.

**Current State**: No authentication - all endpoints publicly accessible  
**Target State**: JWT-based auth with role-based access control and tenant isolation

---

## 📊 Quick Stats

- **Sprints**: 3 (Foundation, RBAC, Multi-Tenancy)
- **Major Tasks**: 10
- **New Files**: ~25 files (~3,500 lines)
- **Database Changes**: 4 new tables + 5 modified
- **Test Coverage Target**: 80%+
- **Performance Target**: Auth latency <20ms p95

---

## 🎯 Key Deliverables

### Sprint 1: Auth Foundation (Week 1)
- ✅ JWT verification middleware
- ✅ Claims extraction
- ✅ WebSocket authentication

### Sprint 2: Authorization & RBAC (Week 2)
- ✅ Role-based access control
- ✅ Permission enforcement
- ✅ Audit logging

### Sprint 3: Multi-Tenancy (Week 3-4)
- ✅ Tenant isolation
- 🚧 Rate limiting
- ⏳ API key authentication

---

## ✅ Success Criteria

### Functional Requirements
- [ ] All API endpoints require valid authentication
- [ ] WebSocket connections require authentication
- [ ] Role-based access control (RBAC) enforced
- [ ] Admin endpoints restricted to admin/operator roles
- [ ] Players can only access their own data
- [ ] Multi-tenancy with complete data isolation

### Security Requirements
- [ ] JWT signature verification using JWKS
- [ ] Token expiration checking
- [ ] Tenant isolation verified (no cross-tenant access)
- [ ] API keys stored as hashed values
- [ ] Error messages don't leak sensitive info

### Quality Requirements
- [ ] 80%+ test coverage for auth code
- [ ] Auth latency <20ms p95
- [ ] All endpoints documented with required permissions
- [ ] Zero breaking changes to existing game logic

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Token refresh race conditions | 🟡 Medium | 🟡 Medium | Queue requests during refresh |
| Cross-tenant data leakage | 🔴 Critical | 🟢 Low | Database-level tenant filters, security review |
| Performance degradation | 🟡 Medium | 🟡 Medium | Cache JWKS keys, optimize middleware |
| Integration complexity | 🟡 Medium | 🔴 High | Incremental rollout, feature flags |

---

## 🔗 Dependencies

- **Blocks**: Phase 3 (Security), Phase 4 (Monitoring)
- **Required**: Phase 1 (API Endpoints) - COMPLETE
- **Optional**: Redis (for rate limiting - can add later)

---

## 🚀 Getting Started

```bash
# 1. Create development branch
git checkout -b feature/phase2-auth

# 2. Review the detailed task plan
cat docs/phases/phase2/PHASE2_TASKS.md

# 3. Start with Task 1 (Auth Types)
# Follow sub-steps in the task document
```

---

## 🎯 Next Phase

After completion: → [Phase 3: Security Hardening](../phase3/)
```

---

### 7. Phase Tasks (`phases/phaseN/PHASEN_TASKS.md`)

**Purpose**: The most detailed document. This is where AI and developers spend most of their time. Each task must be specific enough that someone unfamiliar with the codebase can execute it.

**Key Sections Explained**:

#### Header with Real-Time Status
Always include current progress prominently at the top:

```markdown
# Phase 2: Authentication & Authorization - Implementation Plan

**Duration:** 3-4 weeks  
**Status:** 🚧 IN PROGRESS (Sprint 3 - Task 8 complete)  
**Priority:** 🔴 HIGH - Blocking for production  
**Last Updated:** 2025-10-24

### 📈 Current Progress
- ✅ Sprint 1 (Auth Foundation): 100% complete (4/4 tasks)
- ✅ Sprint 2 (Authorization & RBAC): 100% complete (3/3 tasks)
- 🚧 Sprint 3 (Multi-Tenancy): 75% complete (3/4 tasks done)

**Components Implemented:** 9.75 / 10 (97.5%)  
**Lines Added:** +3,450 / ~3,500  
**Branch:** `feature/phase2-auth-multitenant`
```

#### 🔍 Audit Summary with Risk Assessment

**This is critical.** Before writing tasks, you must audit the current state and identify risks:

```markdown
## 🔍 Authentication Audit Summary

**CRITICAL FINDINGS**: Currently **NO authentication or authorization** exists.

### 📊 Security Gaps Identified:
- **No Authentication**: All API endpoints are publicly accessible
- **No Authorization**: No role-based access control (RBAC)
- **No Tenant Isolation**: Single-tenant architecture
- **Direct playerId Access**: Any client can impersonate any player
- **Admin Endpoints Exposed**: `/api/wallet/freeze` has no protection

### ⚠️ Impact Assessment:
- **Critical Security Risk**: Anyone can access/modify any player's data
- **No Production Readiness**: Cannot deploy without authentication
- **Compliance Risk**: GDPR/privacy violations without access controls
- **Business Risk**: Cannot support multiple tenants/customers
- **Fraud Risk**: No protection against player impersonation

### 📈 Scale of Work:
- **10 Major Tasks** (Tasks 1-10) → ✅ **7 COMPLETE**, **3 REMAINING**
- **45+ Sub-Steps** → ✅ **38 COMPLETED**, **7+ REMAINING**
- **3-4 Weeks** estimated → **~1 Week REMAINING**
```

#### 🎯 Target Architecture

Include **diagrams** (ASCII is fine) showing the end state:

```markdown
## 🎯 Target Architecture

### Authentication Flow
```
┌─────────────────────────────────────────────────────────┐
│              External Auth Provider                      │
│   • OAuth2 / OpenID Connect                              │
│   • Custom JWT issuer                                    │
└────────────────┬────────────────────────────────────────┘
                 │ Issues JWT token
                 ▼
┌─────────────────────────────────────────────────────────┐
│         Game1 API Server (Middleware)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │  1. JWT Verification Middleware                   │   │
│  │     • Validate signature (JWKS)                   │   │
│  │     • Check expiration                            │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 ▼                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  2. Authorization Middleware                      │   │
│  │     • Check required permissions                  │   │
│  │     • Enforce tenant isolation                    │   │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### Directory Structure (New)
```
server/src/auth/
├── middleware/
│   ├── jwtAuth.ts         # JWT verification
│   ├── requireAuth.ts     # Enforce authentication
│   └── requireRole.ts     # Role-based authorization
├── providers/
│   ├── JwtProvider.ts     # JWT-based auth provider
│   └── ApiKeyProvider.ts  # API key provider
├── types.ts               # Auth type definitions
└── roles.ts               # Role definitions
```
```

#### 📋 Task Structure with Completion Tracking

Each task should be **comprehensive** with sub-steps and completion notes:

```markdown
## 📋 Implementation Tasks

### Sprint 1: Authentication Foundation (Week 1)

#### ✅ Task 1: Auth Configuration & Types
**Priority**: 🔴 CRITICAL  
**Complexity**: 🟢 EASY  
**Package**: `server/src/auth/`  
**Dependencies**: None
**Status**: ✅ COMPLETE

**Sub-Steps**:
- [x] 1.1: Create `auth/types.ts` with TypeScript interfaces
- [x] 1.2: Create `auth/roles.ts` with role and permission enums
- [x] 1.3: Create `auth/config.ts` for auth configuration
- [x] 1.4: Add environment variables to `.env.example`
- [x] 1.5: Document auth configuration in README

**Deliverables**:
- ✅ `auth/types.ts` (167 lines) - AuthUser, AuthClaims, AuthProvider
- ✅ `auth/roles.ts` (220 lines) - 5 roles, 21 permissions
- ✅ `auth/config.ts` (190 lines) - Multi-mode config

**✅ COMPLETION NOTES**:
- All TypeScript types properly defined with full JSDoc
- RBAC system: 5 roles (Player→Super Admin), 21 permissions
- Multi-mode auth: Production, Development, Disabled
- Total: 577 lines of production-ready code
- Commit: 408bae6

---

#### 🚧 Task 8: Multi-Tenancy Implementation
**Priority**: 🔴 CRITICAL  
**Complexity**: 🔴 HARD  
**Package**: `server/src/`  
**Dependencies**: Tasks 1-6
**Status**: 🚧 IN PROGRESS (Sessions 1-3 Complete)

**Implementation Strategy**: Phased approach with 4 sessions:
- ✅ **Session 1**: Schema & Foundation (Complete)
- ✅ **Session 2**: Query Updates (Complete)
- ✅ **Session 3**: Advanced Features (Complete)
- ⏳ **Session 4**: Testing & Polish (Remaining)

**Sub-Steps**:
- [x] 8.1: Create tenants table
- [x] 8.2: Add `tenant_id` to all existing tables
- [x] 8.3: Create database migration for tenant columns
- [x] 8.4: Create tenant isolation helpers
- [x] 8.5: Update all Drizzle queries to include `tenant_id` filter
- [x] 8.6: Add tenant context to WebSocket connections
- [x] 8.7: Implement tenant management API
- [ ] 8.8: Write multi-tenancy tests (Session 4)
- [ ] 8.9: Performance test with multiple tenants (Session 4)

**Known Issues**:
1. **Scalar Lock Icon Missing**: Only 7 of 29 endpoints have `security`
   - Fix: Add global security to OpenAPI root
2. **WebSocket Tenant Context**: Currently using hardcoded 'default'
   - Fix: Extract tenantId from JWT in WebSocket auth

**Session 3 Deliverables**:
- ✅ `server/src/api/tenants.ts` - Tenant management API (223 lines)
- ✅ `docs/TENANT_SECURITY_ANALYSIS.md` (152 lines)
- ✅ Updated 29 API endpoints with tenant filtering
```

---

## ⚠️ Risk Identification & Mitigation

**Risk management is embedded throughout the task documents.** Here's how:

### Risk Categories to Track

```markdown
### ⚠️ Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Database performance degradation | 🔴 High | 🟡 Medium | Add indexes on tenant_id, test with large datasets |
| Breaking changes to API | 🔴 High | 🟢 Low | Version API, comprehensive testing, backward compat |
| Scope creep | 🟡 Medium | 🔴 High | Stick to defined endpoints, defer nice-to-haves |
| Testing time underestimated | 🟡 Medium | 🟡 Medium | Write tests in parallel with implementation |
| Security bypass vulnerability | 🔴 Critical | 🟢 Low | Penetration testing, security review |
```

### Risk Indicators in Task Status

Use status indicators to flag risky tasks:

```markdown
#### Task 4: WebSocket Authentication
**Priority**: 🔴 CRITICAL  
**Complexity**: 🔴 HARD  ← Red = high risk
**Risk Flag**: ⚠️ Integration complexity with existing game handlers
```

### Known Issues Section

Every task in progress should document discovered issues:

```markdown
**Known Issues**:
1. **Token Refresh Race Condition** ⚠️
   - Problem: Concurrent requests during refresh cause 401s
   - Workaround: Queue requests during refresh
   - Fix ETA: Task 9
   
2. **Memory Leak in Auth Cache** 🟡
   - Problem: JWKS cache not invalidating properly
   - Impact: ~2MB/hour growth
   - Fix: Add TTL cleanup in Task 10
```

### Security Considerations Section

For security-critical phases, include explicit guidance:

```markdown
### Security Considerations

- **Never log tokens** in plain text
- **Use secure random** for API key generation
- **Hash API keys** before storage (bcrypt or argon2)
- **Rotate JWKS keys** periodically
- **Set proper CORS** per tenant
- **Use HTTPS** in production (enforce)
- **Implement token refresh** coordination
```

### Migration & Compatibility Notes

Document how changes affect existing functionality:

```markdown
### Compatibility Notes

- Maintain REST API contract (no breaking changes)
- WebSocket protocol unchanged (auth in connection, not messages)
- Game logic unchanged (replace hardcoded playerId with auth user)
- Frontend changes minimal (add Authorization header, handle 401)

### Migration Strategy

- **Phase 2.1** (Week 1): Add auth middleware as optional
- **Phase 2.2** (Week 2-3): Enable on new endpoints first
- **Phase 2.3** (Week 4): Full enforcement, remove optional mode
```

---

## 🚀 Getting Started Checklist

When bootstrapping a new project:

### 1. Create Monorepo Structure
```bash
# Create package structure
mkdir -p client/src/{components,features,pages,api}
mkdir -p server/src/{api,features,middleware,services,auth,config,utils}
mkdir -p docs/phases/phase{1,2,3,4,5}/

# Initialize workspaces
npm init -y
# Edit package.json to add "workspaces": ["client", "server"]
```

### 2. Create Core Documents
- [ ] `README.md` - Project overview, quick start
- [ ] `docs/README.md` - Documentation index
- [ ] `docs/TECH_STACK.md` - Technology choices & versions
- [ ] `docs/ARCHITECTURE_GUIDE.md` - Why decisions were made, patterns
- [ ] `docs/DESIGN_SYSTEM.md` - Colors, typography, components
- [ ] `docs/PRODUCTION_ROADMAP.md` - High-level roadmap
- [ ] `docs/phases/README.md` - Phase overview

### 3. Define Your Phases
Identify 4-8 major phases based on:
- **Foundation** - Core infrastructure, basic features
- **Security** - Auth, validation, hardening
- **Quality** - Testing, monitoring, observability
- **Scale** - Performance, caching, optimization
- **Operations** - DevOps, deployment, backups
- **Experience** - DX, documentation, SDKs
- **Compliance** - Legal, regulatory, auditing

### 4. Create Phase Documents
For each phase:
- [ ] `docs/phases/phaseN/README.md` - Overview
- [ ] `docs/phases/phaseN/PHASEN_TASKS.md` - Detailed tasks

### 5. Start Phase 1
- [ ] Audit current state of the codebase
- [ ] Generate detailed task breakdown with checkboxes
- [ ] Begin implementation with checkbox tracking

---

## 🔄 Workflow

### Daily Development Flow
1. Open current `PHASEN_TASKS.md`
2. Find next unchecked task
3. Implement with AI assistance
4. Check off completed sub-tasks
5. Update status section
6. Commit with descriptive message

### Phase Completion Flow
1. Verify all checkboxes in `PHASEN_TASKS.md`
2. Update phase README status
3. Update `phases/README.md` progress
4. Update `PRODUCTION_ROADMAP.md` status
5. Create branch for next phase
6. Begin next phase planning

### Adding New Phases
1. Copy existing phase folder structure
2. Audit the codebase for the new phase's scope
3. Generate comprehensive task breakdown with AI assistance
4. Update roadmap and phase README

---

## 💡 Best Practices

### For Documentation
- **Use emojis** for visual scanning (✅ 🚧 ⏳ 🎯 ⚠️)
- **Keep checkboxes granular** - Each should be ~1-4 hours of work
- **Update status sections** - Future you will thank you
- **Link between documents** - Navigation matters

### For AI Collaboration
- **Seed context** - AI reads your docs to understand the project
- **Reference task IDs** - "Working on Task 3.2" gives clear context
- **Keep tasks atomic** - AI works better with focused tasks
- **Document decisions** - Add notes about why, not just what

### For Progress Tracking
- **Daily updates** - Check boxes as you complete them
- **Phase boundaries** - Don't blur phases together
- **Celebrate wins** - ✅ COMPLETE feels good

---

## 📊 Status Indicators

Use consistently across all documents:

| Indicator | Meaning |
|-----------|---------|
| ✅ | Complete |
| 🚧 | In Progress |
| ⏳ | Not Started |
| 🔴 | Critical Priority |
| 🟡 | Medium Priority |
| 🟢 | Low Priority |
| ⚠️ | Warning/Risk |
| 🎯 | Goal/Target |
| 📋 | Task List |
| 📊 | Statistics |
| 📅 | Timeline |
| 🔗 | Dependencies |

---

## 🎨 Customization Points

Adapt this template for your domain:

1. **Phase Names** - Match your domain (e.g., "Data Pipeline" instead of "API Endpoints")
2. **Success Metrics** - Define what matters for your project
3. **Risk Categories** - Identify domain-specific risks
4. **Timeline Estimates** - Calibrate to your team velocity
5. **Quality Gates** - Set appropriate coverage/latency targets

---

**This document is your starting point. Fork it, adapt it, and make it yours.** 

The goal isn't perfect documentation—it's maintaining momentum while building complex software with AI assistance. Let the checkboxes guide you forward. 🚀

