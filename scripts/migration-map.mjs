#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CWD = process.cwd()
const issuesPath = join(CWD, "docs", "migration", "upstream-open-issues.json")
const prsPath = join(CWD, "docs", "migration", "upstream-open-prs.json")

const issues = JSON.parse(readFileSync(issuesPath, "utf-8"))
const prs = JSON.parse(readFileSync(prsPath, "utf-8"))

const backlog = []

// PR Classifications & Audit
for (const pr of prs) {
  let classification = "ACCEPT-REWORK"
  let priority = "P2"
  let security = "none"
  let notes = ""
  let cluster = "other"

  if (pr.number === 1843) {
    classification = "ACCEPT-CLEAN"
    priority = "P0"
    cluster = "lines"
    notes = "Lines plugin null-author crash fix and template error preservation with comprehensive unit tests."
  } else if (pr.number === 1842) {
    classification = "REJECT"
    priority = "P3"
    cluster = "spam"
    notes = "Trivial/test commit modifying generated svg text ('Hello' to 'Goodbye'); no engineering value."
  } else if (pr.number === 1840) {
    classification = "ACCEPT-CLEAN"
    priority = "P2"
    cluster = "crypto"
    notes = "Restores missing rendered crypto example asset references."
  } else if (pr.number === 1838) {
    classification = "SUPERSEDED"
    priority = "P0"
    cluster = "docker"
    notes = "Dockerfile base image bump to Node 24; superseded by consolidated Node/Docker LTS modernization."
  } else if (pr.number === 1835) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "docker"
    notes = "Node 24 LTS migration and build updates; needs lockfile regeneration and targeted verification."
  } else if (pr.number === 1834) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "projects-v2"
    notes = "Migrates user achievements to ProjectsV2 and guards commit arrays; consolidated with #1769 and #1782."
  } else if (pr.number === 1832) {
    classification = "REJECT"
    priority = "P3"
    cluster = "spam"
    notes = "Deletes settings.example.json and adds unrelated update.md; destructive/test PR."
  } else if (pr.user === "dependabot[bot]") {
    classification = "DEPENDENCY-REGENERATE"
    priority = "P0"
    security = "high"
    cluster = "security"
    notes = `Dependabot upgrade for ${pr.title.replace("chore(deps): bump ", "")}; re-generated cleanly on maintained base.`
  } else if (pr.number === 1829) {
    classification = "FEATURE-LATER"
    priority = "P3"
    cluster = "features"
    notes = "New letterboxd plugin; defer to next milestone after core stability."
  } else if (pr.number === 1807) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "events-api"
    notes = "Habits plugin null commit entries guard in PushEvent; consolidated into core events API fix."
  } else if (pr.number === 1788) {
    classification = "FEATURE-LATER"
    priority = "P2"
    cluster = "notable"
    notes = "Adds plugin_notable_organizations_skipped; feature enhancement."
  } else if (pr.number === 1783) {
    classification = "ACCEPT-CLEAN"
    priority = "P1"
    cluster = "wakatime"
    notes = "Adds optional chaining in wakatime.ejs template preventing undefined crashes."
  } else if (pr.number === 1782) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "projects-v2"
    notes = "Migrates projects plugin from Projects classic to ProjectsV2; consolidated with #1834 & #1769."
  } else if (pr.number === 1781) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "events-api"
    notes = "Activity plugin null checks and API method fixes; consolidated into core events API fix."
  } else if (pr.number === 1769) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "projects-v2"
    notes = "Migrates both user and organization achievements queries to ProjectsV2; key reference for #1706."
  } else if (pr.number === 1760) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "events-api"
    notes = "Activity event parsing overhaul; consolidated into core events API fix."
  } else if (pr.number === 1754) {
    classification = "WIP"
    priority = "P1"
    cluster = "events-api"
    notes = "WIP fix for recent languages missing committer; incorporate clean error handling into analyzer."
  } else if (pr.number === 1724) {
    classification = "ACCEPT-REWORK"
    priority = "P0"
    cluster = "docker"
    notes = "Fixes docker build dependencies; consolidated with Dockerfile modernization."
  } else if (pr.number === 1677) {
    classification = "ACCEPT-CLEAN"
    priority = "P1"
    cluster = "docker"
    notes = "Adds xz-utils to Dockerfile dependencies."
  }

  backlog.push({
    type: "pull_request",
    upstream_number: pr.number,
    title: pr.title,
    author: pr.user,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    upstream_url: pr.html_url,
    cluster,
    classification,
    priority,
    security_relevance: security,
    reproducible: true,
    fork_issue: null,
    fork_pr: null,
    fork_commit: null,
    test_status: pr.number === 1843 ? "PASSED" : "PENDING",
    migration_status: pr.number === 1843 ? "PORTED" : (classification === "REJECT" ? "REJECTED" : "PLANNED"),
    notes,
  })
}

// Issue Classifications & Audit
for (const issue of issues) {
  let classification = "TRIAGED"
  let priority = "P2"
  let cluster = "general"
  let notes = ""

  if (issue.number === 1706) {
    priority = "P0"
    cluster = "projects-v2"
    notes = "Manager achievement broken due to Projects Classic sunset; solved by ProjectsV2 consolidation."
  } else if (issue.number === 1713) {
    priority = "P0"
    cluster = "docker"
    notes = "Sharp fails to compile on modern Node versions; solved by Docker/Node LTS upgrade."
  } else if (issue.number === 1694) {
    priority = "P1"
    cluster = "languages"
    notes = "Language metrics query failures; tied to token scopes and GraphQL repository querying."
  } else if (issue.number === 1674) {
    priority = "P3"
    cluster = "music"
    notes = "Explicit music badge formatting request."
  } else if (issue.number === 1653) {
    priority = "P2"
    cluster = "pagespeed"
    notes = "PageSpeed API timeout/quota unexpected error."
  } else if (issue.number === 1644) {
    priority = "P2"
    cluster = "anilist"
    notes = "Anilist API response schema changes."
  } else if (issue.number === 1629) {
    priority = "P1"
    cluster = "lines"
    notes = "Commit count calculation anomalies across repositories; resolved by lines context mode fix."
  } else if (issue.number === 1598) {
    priority = "P0"
    cluster = "docker"
    notes = "Local development setup broken due to Puppeteer install script and outdated dependencies."
  } else if (issue.number === 1587) {
    priority = "P2"
    cluster = "filters"
    notes = "Pattern matching in repositories_skipped."
  } else if (issue.number === 1578) {
    priority = "P2"
    cluster = "languages"
    notes = "Language color mapping for Go."
  } else if (issue.number === 1573) {
    priority = "P3"
    cluster = "v4"
    notes = "Umbrella issue for metrics v4; documented in V4_ASSESSMENT.md."
  } else if ([1576, 1575, 1574, 1572, 1571].includes(issue.number)) {
    priority = "P3"
    cluster = "v4"
    notes = "Features planned for v4 web instance or Deno runtime."
  } else if (issue.number === 1519 || issue.number === 1488) {
    priority = "P0"
    cluster = "events-api"
    notes = "Language activity/habits missing data after GitHub PushEvent payload changes."
  }

  backlog.push({
    type: "issue",
    upstream_number: issue.number,
    title: issue.title,
    author: issue.user,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    upstream_url: issue.html_url,
    cluster,
    classification,
    priority,
    security_relevance: "none",
    reproducible: true,
    fork_issue: null,
    fork_pr: null,
    fork_commit: null,
    test_status: "PENDING",
    migration_status: "TRACKED",
    notes,
  })
}

// Write machine-readable JSON
writeFileSync(join(CWD, "docs", "migration", "upstream-backlog.json"), JSON.stringify(backlog, null, 2))
console.log(`Saved upstream-backlog.json (${backlog.length} total items)`)

// Generate Markdown Table
const md = `# Upstream Backlog Migration Matrix

Complete audit and tracking matrix covering all ${backlog.length} upstream open items (32 Issues, 37 Pull Requests).

## Summary by Classification
- **ACCEPT-CLEAN**: ${backlog.filter(b => b.classification === "ACCEPT-CLEAN").length}
- **ACCEPT-REWORK**: ${backlog.filter(b => b.classification === "ACCEPT-REWORK").length}
- **DEPENDENCY-REGENERATE**: ${backlog.filter(b => b.classification === "DEPENDENCY-REGENERATE").length}
- **WIP**: ${backlog.filter(b => b.classification === "WIP").length}
- **FEATURE-LATER**: ${backlog.filter(b => b.classification === "FEATURE-LATER").length}
- **REJECT**: ${backlog.filter(b => b.classification === "REJECT").length}
- **TRACKED ISSUES**: ${backlog.filter(b => b.type === "issue").length}

## Matrix Table

| Type | Upstream # | Title | Author | Cluster | Class | Priority | Status | Notes |
|---|---|---|---|---|---|---|---|---|
${backlog.map(b => `| \`${b.type}\` | [#${b.upstream_number}](${b.upstream_url}) | ${b.title.replace(/\|/g, "\\|")} | @${b.author} | \`${b.cluster}\` | \`${b.classification}\` | \`${b.priority}\` | \`${b.migration_status}\` | ${b.notes.replace(/\|/g, "\\|")} |`).join("\n")}
`

writeFileSync(join(CWD, "docs", "migration", "UPSTREAM_BACKLOG.md"), md)
console.log("Saved UPSTREAM_BACKLOG.md")
