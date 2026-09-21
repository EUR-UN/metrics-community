# Maintainers Guide & Contribution Rubric

Welcome to `yuanweize/metrics-community`. This document outlines the governance, triage criteria, and quality standards for this independent community-maintained fork.

---

## 1. Principles of Maintenance

1. **Evidence Before Assumptions**: Every bug fix must include clear reproduction evidence or targeted unit/regression tests.
2. **Attribution Integrity**: When porting or adapting PRs from `lowlighter/metrics` or other forks:
   - Preserve the original git author when cherry-picking cleanly.
   - For reworks or consolidated implementations, explicitly credit contributors via `Co-authored-by: Name <public-email>` and reference `Based on lowlighter/metrics#XXXX`.
3. **No Blind Cherry-Picks**: Do not merge PRs purely to increase commit counts. Ensure root causes are understood and test suites pass.
4. **Minimal Blast Radius**: When fixing breaking API changes (e.g. GitHub GraphQL or REST shifts), preserve existing interfaces and add backward-compatible fallbacks where possible.

---

## 2. PR Review & Triage Rubric

All upstream and fork pull requests are evaluated against the following classifications:

| Category | Description | Policy |
| :--- | :--- | :--- |
| **`ACCEPT-CLEAN`** | Code is complete, correctly solves the issue, passes CI, and has no conflicts. | Port with original author attribution. |
| **`ACCEPT-REWORK`** | Intent and direction are correct, but requires rebasing, additional tests, or edge-case handling. | Rework on a dedicated topic branch, adding regression tests and co-author credits. |
| **`DEPENDENCY-REGENERATE`**| Automated dependency bumps (e.g. Dependabot). | Do not cherry-pick stale lockfiles. Re-audit and upgrade cleanly on the current base. |
| **`DUPLICATE`** / **`SUPERSEDED`** | Covered by another more complete or newer implementation. | Reference the primary PR and credit contributors in the consolidated work. |
| **`FEATURE-LATER`** | Non-breaking new features or enhancements that can be scheduled for future releases. | Queue after core stability, security, and runtime goals are achieved. |
| **`REJECT`** | Inappropriate, spam, destructive, or breaking changes without utility. | Document rejection reason clearly in the migration inventory. |

---

## 3. Branching & Release Workflow

1. `master` tracks `upstream/master` (read-only mirror).
2. `main` is the primary stable development branch.
3. Feature / fix development:
   - Branch from `main`: `git checkout -b <type>/<description> main`
   - Run tests: `NODE_OPTIONS="--experimental-vm-modules" npx jest tests/`
   - Merge via PR with `--no-ff` to preserve branch history.
4. Version tags: Semantic versioning with `-community.<N>` suffix during stabilization (e.g., `v3.35.0-community.1`).
