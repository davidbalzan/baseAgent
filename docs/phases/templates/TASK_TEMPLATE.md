# [PROJECT NAME] [TASK TYPE] Tasks

## Overview
[Brief description of the project/task. Explain what is being migrated/refactored/implemented and why it's necessary.]

## 🔍 [TASK TYPE] Audit Summary

**CRITICAL FINDINGS**: [Summary of key discoveries during initial analysis]

### 📊 **Components [TO BE MIGRATED/IMPLEMENTED]**:
- **[Category 1]**: [Number] [Component Type] ([specific examples])
- **[Category 2]**: [Number] [Component Type] ([specific examples])
- **[Category 3]**: [Number] [Component Type] ([specific examples])
- **[Supporting Infrastructure]**: [Details about supporting files, configs, etc.]

### ⚠️ **Impact Assessment**:
- **[Risk Type 1]**: [Description of risk and potential impact]
- **[Risk Type 2]**: [Description of risk and potential impact]
- **[Risk Type 3]**: [Description of risk and potential impact]
- **[Architecture Impact]**: [How this affects system architecture]

### 📈 **Scale of [TASK TYPE]**:
- **[X] Major Tasks** ([Task IDs]) → ✅ **[Y] COMPLETE**, **[Z] REMAINING**
- **[X]+ Sub-Steps** → ✅ **[Y] COMPLETED**, **[Z]+ REMAINING**
- **[X-Y] Days** estimated completion time → **~[Z] Days REMAINING**
- **[X] [Task Type] Phases** from [priority level] to [priority level]

### 🎉 **COMPLETED [TASKS]**:
- ✅ **[Task ID]: [Task Name]** - [Brief description of what was accomplished] ([metrics, lines of code, endpoints, etc.])
- ✅ **[Task ID]: [Task Name]** - [Brief description of what was accomplished] ([metrics])

## 🚨 Components Not Yet [MIGRATED/IMPLEMENTED]

### [Category 1] ([source location/])
- **[Component Name]** - [Description and importance] ([line count/size if relevant])
- **[Component Name]** - [Description and importance] ([line count/size if relevant])

### [Category 2] ([source location/])
- **[Component Name]** - [Description and purpose]
- **[Component Name]** - [Description and purpose]

### [Additional Categories as needed]
[Continue pattern for all major categories of components]

## 🎯 Target Architecture

### [System] Structure
```
[target structure]/
├── [package1]/           # [Purpose and contents]
│   ├── [subdir]/        # [Purpose]
│   └── [subdir]/        # [Purpose]
├── [package2]/           # [Purpose and contents]
├── [package3]/           # [Purpose and contents]
└── [package4]/           # [Purpose and contents]
```

### [Integration] Pattern
- **[Pattern 1]**: [Description of how components will work together]
- **[Pattern 2]**: [Description of architectural decision]
- **[Pattern 3]**: [Description of key principle]
- **[Pattern 4]**: [Description of important constraint]

### Architecture Principles
1. **[Principle 1]**: [Description]
2. **[Principle 2]**: [Description]
3. **[Principle 3]**: [Description]
4. **[Principle 4]**: [Description]
5. **[Principle 5]**: [Description]

## 📋 [Task Type] Tasks

### Phase 1: [Phase Name - Priority Level]

#### [x] Task [ID]: [Task Name]
**Priority**: [CRITICAL/HIGH/MEDIUM/LOW] ✅ **[STATUS]**
**Package**: `[target location]`
**Dependencies**: 
- [Dependency 1 description]
- [Dependency 2 description]
- [Dependency 3 description]

**Sub-Steps**:
- [x] [Task ID].[Sub-ID]: [Detailed sub-task description]
- [x] [Task ID].[Sub-ID]: [Detailed sub-task description]
- [ ] [Task ID].[Sub-ID]: [Detailed sub-task description]
- [ ] [Task ID].[Sub-ID]: [Detailed sub-task description]
- [ ] [Task ID].[Sub-ID]: **[Special task category if needed]**
- [ ] [Task ID].[Sub-ID]: **Add OpenAPI annotations for [task] endpoints**
- [ ] [Task ID].[Sub-ID]: **Create OpenAPI schemas for [component] requests/responses**
- [ ] [Task ID].[Sub-ID]: **Document [service endpoints] endpoints with OpenAPI**
- [ ] [Task ID].[Sub-ID]: **Update main OpenAPI spec to include [service]**
- [ ] [Task ID].[Sub-ID]: **Make sure everything builds**
- [ ] [Task ID].[Sub-ID]: **Make sure everything is in running condition**

**[✅ COMPLETION STATUS]**: [Detailed summary of what was accomplished, metrics, and current status]

#### [ ] Task [ID]: [Task Name]
**Priority**: [PRIORITY LEVEL]
**Package**: `[target location]`
**Dependencies**: 
- [Dependencies listed]

**Sub-Steps**:
- [ ] [Task ID].[Sub-ID]: [Sub-task description]
- [ ] [Task ID].[Sub-ID]: [Sub-task description]

**Expected Deliverables**: 
- **[Deliverable 1]**: [Description of what will be created]
- **[Deliverable 2]**: [Description of what will be created]
- **[Integration/API Component]**: [Description of interfaces/endpoints]
- **[Documentation]**: [Description of docs to be created]

**🔄 Rollback Plan** _(for risky tasks)_:
- **Revert trigger**: [Condition that triggers rollback - e.g., "Tests fail after migration"]
- **Rollback steps**: [How to undo - e.g., "git revert to commit X, restore DB backup"]
- **Data recovery**: [If applicable - backup locations, restore procedures]
- **Notification**: [Who to inform if rollback occurs]

### Phase 2: [Phase Name - Priority Level]

[Continue pattern for remaining phases...]

### Phase [N]: [Final Phase Name]

#### [ ] Task [ID]: [Final Task Name]
**Priority**: [PRIORITY]
**Package**: [Location]
**Dependencies**: 
- [All previous tasks must be complete]
- [Any specific dependencies]

**Sub-Steps**:
- [ ] [Task ID].1: **[Audit/Review step]**
- [ ] [Task ID].2: **[Validation step]**
- [ ] [Task ID].3: **[Documentation step]**
- [ ] [Task ID].[N]: **[Final verification step]**

**🎯 SUCCESS CRITERIA**: [Detailed description of how to know this phase is complete]

## 🎯 Success Criteria

### Functional Requirements
- [ ] [Functional requirement 1]
- [ ] [Functional requirement 2]
- [ ] [Functional requirement 3]
- [ ] [Performance/metrics requirement]
- [ ] [Quality requirement]

### Quality Requirements
- [ ] [Quality gate 1]
- [ ] [Quality gate 2]
- [ ] [Documentation requirement]
- [ ] [Security requirement]
- [ ] [Performance requirement]

### Architecture Requirements
- [ ] [Architecture validation 1]
- [ ] [Architecture validation 2]
- [ ] [Build/deployment requirement]
- [ ] [Development workflow requirement]
- [ ] [Production readiness requirement]

## 📅 Estimated Timeline

**Phase 1 ([Phase Name])**: [X-Y] days
- [Brief description of what's included]
- [Number]+ sub-steps across [X] major [components/services]

**Phase 2 ([Phase Name])**: [X-Y] days  
- [Brief description of what's included]
- [Number]+ sub-steps for [category description]

**Phase [N] ([Final Phase])**: [X-Y] days
- [Brief description of what's included]
- [Number]+ sub-steps for [category description]

**Total Estimated Time**: [X-Y] days → **~[Z] Days REMAINING** ✅ **[A] Days COMPLETED**
**Total Sub-Steps**: [X]+ detailed checkboxes → ✅ **[Y] COMPLETED**, **[Z]+ REMAINING**
**[Special Category] Tasks**: [X]+ dedicated sub-steps → ✅ **[Y] COMPLETED**, **[Z]+ REMAINING**

## 🚀 [Task Type] Progress

1. ✅ **Task [ID] ([Name])** - [STATUS] with [metrics/deliverables]
2. ✅ **Task [ID] ([Name])** - [STATUS] with [metrics/deliverables]  
3. 🚧 **Task [ID] ([Name])** - [IN PROGRESS] with [current status]
4. Continue with remaining tasks by priority
5. Validate each phase before proceeding to the next

## 🎯 **CURRENT STATUS**: [X]/[Y] Major Tasks [Status] ([Z]% Progress)

**✅ PREVIOUS COMPLETION**: [Description of most recently completed major task with detailed summary]

**🚧 CURRENT WORK**: [Description of current task in progress with detailed progress summary]

**🎯 NEXT**: [Description of next steps and upcoming tasks]

## 🔄 Rollback & Contingency Plans

> _For phases with significant risk, document how to safely undo changes._

### High-Risk Tasks Identified

| Task | Risk Level | Rollback Complexity | Backup Required |
|------|------------|---------------------|-----------------|
| Task X.X | 🔴 High | Medium | ✅ Yes - DB snapshot |
| Task Y.Y | 🟡 Medium | Low | ❌ No - code only |

### Pre-Phase Checklist

- [ ] Database backup created: `[backup location/timestamp]`
- [ ] Current branch tagged: `git tag pre-phase-N-backup`
- [ ] Dependent services notified of potential rollback window
- [ ] Rollback runbook reviewed by team

### Emergency Rollback Procedure

**If critical failure occurs:**

1. **Stop** - Don't make additional changes
2. **Assess** - Identify what broke and impact scope
3. **Communicate** - Notify stakeholders: [contact list]
4. **Rollback** - Execute steps below:

```bash
# Code rollback
git revert --no-commit HEAD~N  # N = number of commits to undo
git commit -m "Rollback: [reason]"

# Database rollback (if applicable)
# [Database-specific restore commands]
```

5. **Verify** - Run smoke tests to confirm system stability
6. **Document** - Add post-mortem notes to this section

### Post-Mortem Notes

_Add notes here if rollback was executed:_

- **Date**: 
- **Trigger**: 
- **Resolution**: 
- **Prevention**: 

---

## 📝 Notes

- [Important note about testing/validation requirements]
- [Note about documentation requirements]
- [Note about compatibility requirements]
- [Note about migration/change management]
- [Note about automation/tooling considerations]
