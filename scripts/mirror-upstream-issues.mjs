#!/usr/bin/env node
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

const args = process.argv.slice(2)
const isExecute = args.includes("--execute")
const isDryRun = !isExecute || args.includes("--dry-run")
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "999", 10)

console.log(`=== Upstream Issue Mirroring Tool ===`)
console.log(`Mode: ${isExecute ? "EXECUTE (Live GitHub API calls)" : "DRY-RUN (Simulated)"}`)
console.log(`Limit: ${limit}`)

const issuesPath = path.join(rootDir, "docs/migration/upstream-open-issues.json")
const backlogPath = path.join(rootDir, "docs/migration/upstream-backlog.json")

if (!fs.existsSync(issuesPath) || !fs.existsSync(backlogPath)) {
  console.error("Missing issues or backlog json in docs/migration/")
  process.exit(1)
}

const issues = JSON.parse(fs.readFileSync(issuesPath, "utf-8"))
const backlog = JSON.parse(fs.readFileSync(backlogPath, "utf-8"))

const issuesMap = new Map(issues.map(i => [i.number, i]))

let processed = 0
let mirroredCount = 0
let skippedCount = 0

for (const item of backlog) {
  if (item.type !== "issue") continue
  if (processed >= limit) break
  processed++

  if (item.fork_issue && item.fork_issue !== "N/A" && item.fork_issue !== "pending") {
    console.log(`[SKIP] #${item.upstream_number} already tracked at ${item.fork_issue}`)
    skippedCount++
    continue
  }

  const issueData = issuesMap.get(item.upstream_number)
  if (!issueData) {
    console.warn(`[WARN] Issue #${item.upstream_number} not found in upstream-open-issues.json`)
    continue
  }

  const title = `[upstream #${item.upstream_number}] ${issueData.title.slice(0, 200)}`
  
  // Truncate/sanitize body to avoid gigantic issues while preserving reproduction details
  let cleanBody = issueData.body || "No description provided."
  if (cleanBody.length > 2500) {
    cleanBody = cleanBody.slice(0, 2500) + "\n\n*(Truncated for mirror readability. See full original upstream discussion at the link above.)*"
  }

  const body = `> [!NOTE]
> Mirrored from [lowlighter/metrics#${item.upstream_number}](${item.upstream_url}) for tracking in this independent community-maintained fork. Original report and attribution remain with upstream author @${item.author}.
>
> **Original Issue**: [lowlighter/metrics#${item.upstream_number}](${item.upstream_url})  
> **Original Author**: @${item.author}  
> **Created At**: ${item.created_at}  
> **Classification**: \`${item.classification}\`  
> **Priority**: \`${item.priority}\`  
> **Initial Fork Status**: \`${item.migration_status}\`  

## Problem Description
${cleanBody}

---

## Community Fork Status & Links
- **Related Items / PRs**: ${item.related_items || "None"}
- **Fork PR / Commit**: ${item.fork_pr || item.fork_commit || "Pending investigation"}
- **Community Fork Tracker**: Mirrored in \`yuanweize/metrics-community\`
`

  console.log(`\n--------------------------------------------------`)
  console.log(`[MIRROR] Upstream #${item.upstream_number}: "${issueData.title}"`)
  console.log(`Author: @${item.author} | Priority: ${item.priority} | Classification: ${item.classification}`)

  if (isDryRun) {
    console.log(`[DRY-RUN] Would create issue with title: "${title}"`)
    item.fork_issue = `https://github.com/yuanweize/metrics-community/issues/simulated-${item.upstream_number}`
    mirroredCount++
  } else {
    try {
      // Create temporary file for issue body
      const tmpBodyFile = path.join(rootDir, `.tmp_issue_body_${item.upstream_number}.md`)
      fs.writeFileSync(tmpBodyFile, body, "utf-8")

      const cmd = `gh issue create -R yuanweize/metrics-community --title ${JSON.stringify(title)} --body-file ${JSON.stringify(tmpBodyFile)}`
      const out = execSync(cmd, { encoding: "utf-8" }).trim()
      fs.unlinkSync(tmpBodyFile)

      console.log(`[SUCCESS] Created: ${out}`)
      item.fork_issue = out
      mirroredCount++

      // Save progress incrementally
      fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2), "utf-8")

      // Rate limit pause (1.5s between calls)
      execSync("sleep 1.5")
    } catch (err) {
      console.error(`[ERROR] Failed to mirror #${item.upstream_number}:`, err.message)
    }
  }
}

console.log(`\n=== Summary ===`)
console.log(`Total checked: ${processed}`)
console.log(`Mirrored: ${mirroredCount}`)
console.log(`Skipped: ${skippedCount}`)

// Save updated backlog
fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2), "utf-8")

// Regenerate markdown table
const header = `# Upstream Backlog Migration Matrix

> Full inventory of all 69 open upstream items (32 issues, 37 PRs) from \`lowlighter/metrics\`.  
> Last updated: ${new Date().toISOString()}

| Type | # | Title | Author | Priority | Classification | Fork Issue | Fork PR / Commit | Status |
| :--- | :-: | :--- | :--- | :-: | :--- | :--- | :--- | :--- |
`

const rows = backlog.map(item => {
  const title = (item.title || "").replace(/\|/g, "\\|")
  const author = item.author ? `[@${item.author}](https://github.com/${item.author})` : "N/A"
  const forkIssue = item.fork_issue ? `[Issue](${item.fork_issue})` : "N/A"
  const forkPr = item.fork_pr ? `[PR](${item.fork_pr})` : (item.fork_commit ? `\`${item.fork_commit.slice(0, 7)}\`` : "N/A")
  return `| ${item.type.toUpperCase()} | [${item.upstream_number}](${item.upstream_url}) | ${title} | ${author} | **${item.priority}** | \`${item.classification}\` | ${forkIssue} | ${forkPr} | \`${item.migration_status}\` |`
}).join("\n")

fs.writeFileSync(path.join(rootDir, "docs/migration/UPSTREAM_BACKLOG.md"), header + rows + "\n", "utf-8")
console.log(`Updated docs/migration/upstream-backlog.json and docs/migration/UPSTREAM_BACKLOG.md`)
