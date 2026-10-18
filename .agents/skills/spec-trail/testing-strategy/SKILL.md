---
name: testing-strategy
description: Design test strategies and test plans. Trigger with "how should we test", "test strategy for", "write tests for", "test plan", "what tests do we need", or when the user needs help with testing approaches, coverage, or test architecture.
license: Apache-2.0
metadata:
  upstream: anthropics/knowledge-work-plugins
  upstream-path: engineering/skills/testing-strategy
  upstream-commit: 33eeda1e8fd856455b05479d13a0f85b5f803744
---

# Testing Strategy

Adapted for SpecTrail on 2026-10-18 from [Anthropic's testing-strategy](https://github.com/anthropics/knowledge-work-plugins/blob/33eeda1e8fd856455b05479d13a0f85b5f803744/engineering/skills/testing-strategy/SKILL.md). Local changes make test selection and output proportional to the change. The upstream [license](./LICENSE) is included.

Design effective testing strategies balancing coverage, speed, and maintenance.

## Proportionality First

Do not overdesign testing. These constraints govern the examples below:

- Start with acceptance behavior, actual failure risks, and existing coverage. Reuse the project's tools and tests; add only checks that close a meaningful gap. Preserve required project checks.
- Choose the least costly test level that can observe the relevant behavior reliably. Multiple levels are justified only when they catch different important failures; do not mirror implementation details or duplicate the same assertion across layers.
- Low-risk documentation, styling, or reversible changes can use review, static checks, or a focused smoke check without new automated tests. Data integrity, authorization, and other consequential risks still need suitable verification.
- Do not invent coverage percentages, test counts, or layer quotas. Introduce frameworks, elaborate mocks, new test infrastructure, load tests, or chaos tests only for a concrete unmet need. Component examples below are options, not a checklist.
- Prefer representative cases and relevant failure boundaries over exhaustive combinations or large snapshots. Stop after the selected checks pass unless a new change, failure, or unresolved concern warrants more testing.

## Testing Pyramid

Use this as a cost heuristic, not a required distribution or a reason to create every layer:

```
        /  E2E  \         Few, slow, high confidence
       / Integration \     Some, medium speed
      /    Unit Tests  \   Many, fast, focused
```

## Strategy by Component Type

- **API endpoints**: Unit tests for business logic, integration tests for HTTP layer, contract tests for consumers
- **Data pipelines**: Input validation, transformation correctness, idempotency tests
- **Frontend**: Component tests, interaction tests, visual regression, accessibility
- **Infrastructure**: Smoke tests, chaos engineering, load tests

## What to Cover

Focus on: business-critical paths, error handling, edge cases, security boundaries, data integrity.

Skip tests of trivial getters/setters, framework internals, or behavior already adequately covered. Assess one-off scripts by their effects: a harmless helper may need only a focused check, while a destructive data migration needs verification of its actual risks.

## Output

Record what to verify, the selected method, and the pass criteria in the current technical design; for a small SpecTrail Change, use the Requirement's solution notes. Mention material coverage gaps or limits when they affect confidence. Add numeric targets or example cases only when an agreed requirement or actual risk makes them useful. Do not create a separate test-plan document or new testing system by default.
