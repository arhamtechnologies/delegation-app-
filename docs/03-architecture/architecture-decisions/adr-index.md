# Architecture Decision Records (ADR) Index

**Software/Project Name:** Delegation App
**Document ID:** DOC-ADR-INDEX
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [ADR Overview](#1-adr-overview)
2. [ADR List](#2-adr-list)
3. [ADR Template](#3-adr-template)

---

## 1. ADR Overview

Architecture Decision Records (ADRs) document significant architectural decisions made during the development of the Delegation App. Each ADR captures:

- **Context**: The situation requiring a decision
- **Alternatives**: Options considered
- **Decision**: What was chosen
- **Rationale**: Why this option was selected
- **Consequences**: Trade-offs and implications

### Status Values

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet decided |
| **Accepted** | Decided and implemented |
| **Superseded** | Replaced by a later ADR |
| **Deprecated** | No longer relevant |

---

## 2. ADR List

| ID | Title | Status | Date | Related Documents |
|----|-------|--------|------|-------------------|
| ADR-001 | Direct Database Access vs. API Layer | Accepted | 2026-01-15 | SAD §14, SRS NFR-030 |
| ADR-002 | Row Level Security as Primary Authorization | Accepted | 2026-01-15 | SAD §11, SRS NFR-030 |
| ADR-003 | Unified Work Items View | Accepted | 2026-02-01 | SAD §9, DB Design §5 |
| ADR-004 | Timezone Handling in Application Layer | Accepted | 2026-02-15 | SAD §9, SRS SC-003 |
| ADR-005 | Idempotent Notification Delivery | Accepted | 2026-03-01 | SAD §9, SRS FR-076 |
| ADR-006 | Server Components with Client Hydration | Accepted | 2026-01-20 | SAD §7, SRS NFR-001 |
| ADR-007 | Custom CSS Design System vs. UI Library | Accepted | 2026-01-25 | SAD §7, SRS NFR-040 |
| ADR-008 | Checklist Generation via Vercel Cron | Accepted | 2026-02-10 | SAD §8, SRS FR-023 |
| ADR-009 | Non-Working Day Handling (Sunday/Holiday/Leave) | Accepted | 2026-03-15 | SAD §9, SRS FR-026, FR-044 |
| ADR-010 | Employee Invitation via Recovery Link (No Temp Password) | Accepted | 2026-04-01 | SAD §11, SRS FR-085 |
| ADR-011 | WhatsApp Bot as Optional Extension | Accepted | 2026-05-01 | SAD §10, SRS FR-090 |
| ADR-012 | Proof Screenshots for Task Completion | Accepted | 2026-06-15 | SAD §9, SRS FR-014 |
| ADR-013 | Follow-up Tasks as Metadata on Work Items | Accepted | 2026-07-01 | SAD §6, SRS FR-018 |

---

## 3. ADR Template

```markdown
# ADR-XXX: [Title]

**Status**: [Proposed | Accepted | Superseded | Deprecated]
**Date**: YYYY-MM-DD
**Deciders**: [Names/Roles]
**Technical Story**: [Link to issue/ticket]

## Context

[Describe the situation requiring a decision. What problem are we solving?]

## Alternatives Considered

### Option 1: [Name]
- Pros:
- Cons:

### Option 2: [Name]
- Pros:
- Cons:

### Option 3: [Name]
- Pros:
- Cons:

## Decision

[State the decision clearly. What are we doing?]

## Rationale

[Explain why this option was chosen. Reference principles, constraints, evidence.]

## Consequences

### Positive
- [Benefits gained]

### Negative
- [Trade-offs accepted]

### Risks
- [Potential issues to monitor]

## Implementation Notes

[Any technical details, migration steps, or follow-up tasks]

## Related ADRs

- ADR-XXX: [Related decision]
```

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial index |

---

*End of ADR Index*