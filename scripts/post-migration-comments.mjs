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
const delaySec = parseFloat(args.find(a => a.startsWith("--delay="))?.split("=")[1] || "3.5")

const MARKER = "<!-- metrics-community-migration:v1 -->"

console.log(`=== Upstream Community Navigation Comment Tool ===`)
console.log(`Mode: ${isExecute ? "EXECUTE (Posting live comments)" : "DRY-RUN (Simulated)"}`)
console.log(`Limit: ${limit}`)
console.log(`Delay between comments: ${delaySec}s`)

const backlogPath = path.join(rootDir, "docs/migration/upstream-backlog.json")
const logPath = path.join(rootDir, "docs/migration/comment-log.json")

if (!fs.existsSync(backlogPath)) {
  console.error("Missing docs/migration/upstream-backlog.json")
  process.exit(1)
}

const backlog = JSON.parse(fs.readFileSync(backlogPath, "utf-8"))
let commentLog = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : []
const loggedItems = new Set(commentLog.filter(l => l.status === "posted" || l.status === "already_commented").map(l => `${l.type}_${l.upstream_number}`))

let count = 0
let postedCount = 0
let skippedCount = 0

for (const item of backlog) {
  if (count >= limit) break

  const itemKey = `${item.type}_${item.upstream_number}`

  // 1. Skip Bot authors (e.g. dependabot)
  if (!item.author || item.author.includes("[bot]") || item.author === "dependabot" || item.classification === "DEPENDENCY-REGENERATE") {
    console.log(`[SKIP-BOT] #${item.upstream_number} authored by bot/dependabot (${item.author})`)
    skippedCount++
    continue
  }

  // 2. Skip Rejected / Spam PRs
  if (item.classification === "REJECT") {
    console.log(`[SKIP-REJECT] #${item.upstream_number} classified as REJECT (${item.notes})`)
    skippedCount++
    continue
  }

  // 3. Skip if already recorded in comment-log.json
  if (loggedItems.has(itemKey)) {
    console.log(`[SKIP-LOGGED] #${item.upstream_number} already in comment-log.json`)
    skippedCount++
    continue
  }

  count++

  console.log(`\n--------------------------------------------------`)
  console.log(`Processing #${item.upstream_number} (${item.type.toUpperCase()}) by @${item.author}: "${item.title}"`)

  // Check if marker already exists on GitHub thread
  let hasMarker = false
  try {
    const viewCmd = item.type === "issue" 
      ? `gh issue view ${item.upstream_number} -R lowlighter/metrics --json comments`
      : `gh pr view ${item.upstream_number} -R lowlighter/metrics --json comments`
    const output = execSync(viewCmd, { encoding: "utf-8" })
    const data = JSON.parse(output)
    if (data.comments && data.comments.some(c => c.body && c.body.includes(MARKER))) {
      hasMarker = true
    }
  } catch (err) {
    console.warn(`[WARN] Failed to inspect upstream thread #${item.upstream_number}: ${err.message}`)
  }

  if (hasMarker) {
    console.log(`[SKIP-MARKER] #${item.upstream_number} thread already contains migration marker`)
    commentLog.push({
      type: item.type,
      upstream_number: item.upstream_number,
      target_url: item.fork_issue || item.fork_pr || "https://github.com/yuanweize/metrics-community",
      timestamp: new Date().toISOString(),
      status: "already_commented",
      notes: "Marker detected on upstream thread"
    })
    fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")
    skippedCount++
    continue
  }

  // Generate customized, professional comment body
  let commentBody = ""
  if (item.type === "issue") {
    const trackerUrl = item.fork_issue || "https://github.com/yuanweize/metrics-community/issues"
    commentBody = `${MARKER}
Hi @${item.author} — I am maintaining an independent community fork of lowlighter/metrics focused on compatibility, security fixes, and ongoing maintenance:
https://github.com/yuanweize/metrics-community

I have mirrored and am tracking this issue in the community fork tracker here:
${trackerUrl}

The original report and attribution remain credited to this upstream issue. The fork is independent and is not an official successor to lowlighter/metrics.
If this problem still affects your workflows, testing or further feedback on the maintained fork would be very welcome.`
  } else {
    // PR
    if (item.fork_pr || item.fork_commit) {
      const link = item.fork_pr || `https://github.com/yuanweize/metrics-community/commit/${item.fork_commit}`
      commentBody = `${MARKER}
Hi @${item.author} — thank you for this contribution! I am maintaining an independent community fork of lowlighter/metrics focused on compatibility and ongoing maintenance:
https://github.com/yuanweize/metrics-community

Your change has been ported/reworked and integrated here:
${link}

Original contribution: lowlighter/metrics#${item.upstream_number}
Your original contribution is explicitly credited in the fork git history and release notes. This repository is an independent community fork and this does not imply acceptance by the upstream maintainer.`
    } else {
      commentBody = `${MARKER}
Hi @${item.author} — thank you for this contribution! I am maintaining an independent community fork of lowlighter/metrics focused on compatibility and ongoing maintenance:
https://github.com/yuanweize/metrics-community

This pull request is cataloged in our community migration backlog:
https://github.com/yuanweize/metrics-community/blob/main/docs/migration/UPSTREAM_BACKLOG.md

Original contribution: lowlighter/metrics#${item.upstream_number}
Your contribution remains credited to you. If you would like to test or contribute further to the community fork, your participation is very welcome.`
    }
  }

  if (isDryRun) {
    console.log(`[DRY-RUN] Would comment on lowlighter/metrics#${item.upstream_number}:`)
    console.log(commentBody)
    commentLog.push({
      type: item.type,
      upstream_number: item.upstream_number,
      target_url: item.fork_issue || item.fork_pr || "https://github.com/yuanweize/metrics-community",
      timestamp: new Date().toISOString(),
      status: "dry_run_simulated"
    })
    postedCount++
  } else {
    try {
      const tmpCommentFile = path.join(rootDir, `.tmp_comment_${item.upstream_number}.md`)
      fs.writeFileSync(tmpCommentFile, commentBody, "utf-8")

      const commentCmd = item.type === "issue"
        ? `gh issue comment ${item.upstream_number} -R lowlighter/metrics --body-file ${JSON.stringify(tmpCommentFile)}`
        : `gh pr comment ${item.upstream_number} -R lowlighter/metrics --body-file ${JSON.stringify(tmpCommentFile)}`

      const out = execSync(commentCmd, { encoding: "utf-8" }).trim()
      fs.unlinkSync(tmpCommentFile)

      console.log(`[POSTED] Successfully commented on #${item.upstream_number}: ${out}`)
      commentLog.push({
        type: item.type,
        upstream_number: item.upstream_number,
        target_url: item.fork_issue || item.fork_pr || "https://github.com/yuanweize/metrics-community",
        comment_url: out,
        timestamp: new Date().toISOString(),
        status: "posted"
      })
      postedCount++

      fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")

      // Rate limit safety pause
      execSync(`sleep ${delaySec}`)
    } catch (err) {
      console.error(`[ERROR] Failed to post comment on #${item.upstream_number}:`, err.message)
      commentLog.push({
        type: item.type,
        upstream_number: item.upstream_number,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: err.message
      })
      fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")

      // If secondary rate limit encountered, break immediately
      if (err.message.includes("rate limit") || err.message.includes("abuse")) {
        console.error("SECONDARY RATE LIMIT DETECTED! Stopping comment batch.")
        break
      }
    }
  }
}

console.log(`\n=== Navigation Comment Summary ===`)
console.log(`Total considered: ${count}`)
console.log(`Posted / Simulated: ${postedCount}`)
console.log(`Skipped (bot/reject/logged): ${skippedCount}`)

fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")
console.log(`Saved log to docs/migration/comment-log.json`)
