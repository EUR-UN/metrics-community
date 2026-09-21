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
const forceFetch = args.includes("--fetch-fresh")
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "999", 10)
const delaySec = parseFloat(args.find(a => a.startsWith("--delay="))?.split("=")[1] || "4.0")

const NAVIGATION_MARKER = "<!-- yuanweize-metrics-community-navigation:v1 -->"
const LEGACY_MARKER = "<!-- metrics-community-migration:v1 -->"

const targetsPath = path.join(rootDir, "docs/migration/comment-targets.json")
const logPath = path.join(rootDir, "docs/migration/comment-log.json")
const backlogPath = path.join(rootDir, "docs/migration/upstream-backlog.json")

console.log(`=======================================================`)
console.log(`Upstream Issue & PR Community Navigation Comment System`)
console.log(`Mode: ${isExecute ? "EXECUTE (LIVE POSTING)" : "DRY-RUN (AUDIT & SIMULATION)"}`)
console.log(`Limit: ${limit} | Delay: ${delaySec}s`)
console.log(`=======================================================\n`)

// Load existing comment log for deduplication and resume
let commentLog = []
if (fs.existsSync(logPath)) {
  try {
    commentLog = JSON.parse(fs.readFileSync(logPath, "utf-8"))
  } catch (e) {
    commentLog = []
  }
}
const completedKeys = new Set(
  commentLog
    .filter(l => l.status === "posted" || l.status === "already_commented")
    .map(l => `${l.type}_${l.upstream_number || l.number}`)
)

// Map existing port/rework data from backlog if available
let backlogMap = new Map()
if (fs.existsSync(backlogPath)) {
  try {
    const bl = JSON.parse(fs.readFileSync(backlogPath, "utf-8"))
    for (const item of bl) {
      backlogMap.set(`${item.type}_${item.upstream_number}`, item)
    }
  } catch (e) {}
}

/**
 * Step 1: Fetch all open issues and PRs from lowlighter/metrics with pagination
 */
function fetchAllUpstreamItems() {
  console.log("[1/4] Fetching all open issues & pull requests from lowlighter/metrics...")
  
  // 1. Fetch Issues
  const issuesCmd = `gh issue list -R lowlighter/metrics --state open --limit 500 --json number,title,body,author,createdAt,updatedAt,comments,labels`
  const issuesRaw = JSON.parse(execSync(issuesCmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }))
  
  // 2. Fetch PRs
  const prsCmd = `gh pr list -R lowlighter/metrics --state open --limit 500 --json number,title,body,author,createdAt,updatedAt,comments,labels,headRefName,isDraft`
  const prsRaw = JSON.parse(execSync(prsCmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }))

  console.log(`-> Fetched ${issuesRaw.length} open issues and ${prsRaw.length} open pull requests.`)
  return { issues: issuesRaw, prs: prsRaw }
}

let itemsData
if (forceFetch || !fs.existsSync(targetsPath)) {
  const { issues, prs } = fetchAllUpstreamItems()
  itemsData = []

  for (const iss of issues) {
    itemsData.push({
      type: "issue",
      number: iss.number,
      title: iss.title,
      body: iss.body || "",
      author: iss.author?.login || "unknown",
      is_bot: !!iss.author?.is_bot || iss.author?.login?.includes("[bot]") || iss.author?.login === "dependabot",
      createdAt: iss.createdAt,
      updatedAt: iss.updatedAt,
      comments: iss.comments || [],
      labels: (iss.labels || []).map(l => l.name)
    })
  }

  for (const pr of prs) {
    itemsData.push({
      type: "pull_request",
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      author: pr.author?.login || "unknown",
      is_bot: !!pr.author?.is_bot || pr.author?.login?.includes("[bot]") || pr.author?.login === "dependabot",
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      comments: pr.comments || [],
      labels: (pr.labels || []).map(l => l.name),
      headRefName: pr.headRefName,
      isDraft: pr.isDraft
    })
  }
} else {
  console.log(`[1/4] Using cached targets from ${targetsPath} (pass --fetch-fresh to reload).`)
  itemsData = JSON.parse(fs.readFileSync(targetsPath, "utf-8"))
}

/**
 * Step 2: Classify, audit spam, and determine context domain
 */
function classifyItem(item) {
  const text = `${item.title} ${item.body}`.toLowerCase()
  const author = item.author || "unknown"

  // Bot check
  if (
    item.is_bot ||
    author.includes("[bot]") ||
    author.includes("bot") ||
    author.includes("dependabot") ||
    author === "github-actions" ||
    item.title.startsWith("chore(deps")
  ) {
    return {
      human: false,
      meaningful: false,
      comment: false,
      reason: "Automated bot / dependency manager",
      domain: "bot",
      community_target: null,
      status: "skipped_bot"
    }
  }

  // Self check
  if (author.toLowerCase() === "yuanweize") {
    return {
      human: true,
      meaningful: true,
      comment: false,
      reason: "Self-authored item by maintainer",
      domain: "self",
      community_target: null,
      status: "skipped_self"
    }
  }

  // Obvious Spam / Junk PR check
  const isJunkPR = item.type === "pull_request" && (
    (text.includes("hello") && text.includes("goodbye")) ||
    item.title.toLowerCase().includes("add uptade") ||
    (text.length < 15 && (text.includes("test") || text.includes("asdf")))
  )
  const isSpam = text.includes("crypto") || text.includes("casino") || text.includes("seo promotion") || text.includes("free followers")

  if (isJunkPR || isSpam) {
    return {
      human: true,
      meaningful: false,
      comment: false,
      reason: isSpam ? "Obvious spam/promotion" : "Practice/junk/unrelated submission",
      domain: "spam",
      community_target: null,
      status: "skipped_spam"
    }
  }

  // Determine Domain Context
  let domain = "general"
  let contextLine = "I’ve included this upstream issue in the fork’s migration/backlog tracking and plan to continue triaging it there."

  if (text.includes("lines") || text.includes("contributor") || text.includes("author") || text.includes("additions") || text.includes("deletions")) {
    domain = "lines"
    contextLine = "I’m tracking this as part of the lines plugin null-safety, author handling, and commit diff statistics backlog."
  } else if (text.includes("event") || text.includes("pushevent") || text.includes("payload") || text.includes("events api")) {
    domain = "events"
    contextLine = "I’m tracking this as part of the GitHub Events API payload compatibility and schema modernization work."
  } else if (text.includes("project") || text.includes("projects v2") || text.includes("projectsv2") || text.includes("classic projects")) {
    domain = "projects"
    contextLine = "I’m tracking this as part of the Projects V2 migration and GraphQL API updates."
  } else if (text.includes("docker") || text.includes("node") || text.includes("alpine") || text.includes("action.yml") || text.includes("arm64") || text.includes("puppeteer")) {
    domain = "docker"
    contextLine = "I’m tracking this as part of the Node 22 LTS modernization, multi-arch Docker image pipeline, and Puppeteer updates."
  } else if (text.includes("music") || text.includes("apple music") || text.includes("spotify") || text.includes("playlist")) {
    domain = "music"
    contextLine = "I’m tracking this as part of the music plugin explicit content handling and media sanitization fixes."
  } else if (text.includes("steam") || text.includes("game") || text.includes("playtime") || text.includes("pubg")) {
    domain = "steam"
    contextLine = "I’m tracking this as part of the Steam plugin recent games API integration and free-to-play compatibility work."
  } else if (text.includes("language") || text.includes("linguist") || text.includes("color") || text.includes("percentage")) {
    domain = "languages"
    contextLine = "This looks related to the language statistics, linguist colors, and percentage breakdown compatibility backlog."
  } else if (text.includes("wakatime") || text.includes("habits") || text.includes("activity")) {
    domain = "activity"
    contextLine = "I’m tracking this as part of the user activity, habits, and external metrics provider integrations."
  }

  // Check backlog map for mirrored tracker / ported PR
  const key = `${item.type}_${item.number}`
  const backlogEntry = backlogMap.get(key)
  let communityTarget = backlogEntry?.fork_issue || backlogEntry?.fork_pr || backlogEntry?.fork_commit || null

  return {
    human: true,
    meaningful: true,
    comment: true,
    reason: "Valid human-authored technical contribution/issue",
    domain,
    contextLine,
    community_target: communityTarget,
    status: "pending"
  }
}

// Process targets
console.log("[2/4] Auditing and classifying items...")
const auditedTargets = itemsData.map(item => {
  const classification = classifyItem(item)
  const key = `${item.type}_${item.number}`

  // Check already commented
  let hasMarker = false
  if (Array.isArray(item.comments)) {
    hasMarker = item.comments.some(c => c.body && (c.body.includes(NAVIGATION_MARKER) || c.body.includes(LEGACY_MARKER)))
  }

  let finalStatus = classification.status
  if (completedKeys.has(key) || hasMarker) {
    finalStatus = "already_commented"
  }

  return {
    type: item.type,
    number: item.number,
    author: item.author,
    title: item.title,
    human: classification.human,
    meaningful: classification.meaningful,
    comment: classification.comment && finalStatus !== "already_commented",
    reason: classification.reason,
    domain: classification.domain,
    contextLine: classification.contextLine,
    community_target: classification.community_target,
    status: finalStatus
  }
})

// Save comment-targets.json
fs.writeFileSync(targetsPath, JSON.stringify(auditedTargets, null, 2), "utf-8")
console.log(`-> Saved classified target table to ${targetsPath}`)

/**
 * Step 3: Display dry-run metrics & statistics
 */
const totalIssues = auditedTargets.filter(t => t.type === "issue").length
const totalPRs = auditedTargets.filter(t => t.type === "pull_request").length
const meaningfulHumanIssues = auditedTargets.filter(t => t.type === "issue" && t.human && t.meaningful).length
const meaningfulHumanPRs = auditedTargets.filter(t => t.type === "pull_request" && t.human && t.meaningful).length
const alreadyCommentedCount = auditedTargets.filter(t => t.status === "already_commented").length
const botSkippedCount = auditedTargets.filter(t => t.status === "skipped_bot").length
const spamSkippedCount = auditedTargets.filter(t => t.status === "skipped_spam").length
const plannedToComment = auditedTargets.filter(t => t.comment && t.status === "pending").length

console.log(`\n================== AUDIT SUMMARY ==================`)
console.log(`Total Open Issues:             ${totalIssues}`)
console.log(`Total Open PRs:                ${totalPRs}`)
console.log(`Meaningful Human Issues:       ${meaningfulHumanIssues}`)
console.log(`Meaningful Human PRs:          ${meaningfulHumanPRs}`)
console.log(`Already Commented:             ${alreadyCommentedCount}`)
console.log(`Bot / Dependabot Skipped:      ${botSkippedCount}`)
console.log(`Spam / Junk Skipped:           ${spamSkippedCount}`)
console.log(`Planned for New Comments:      ${plannedToComment}`)
console.log(`===================================================\n`)

/**
 * Step 4: Generate Comment Templates
 */
function renderCommentBody(target) {
  if (target.type === "issue") {
    if (target.community_target) {
      return `${NAVIGATION_MARKER}
Hi @${target.author} — I’m maintaining an independent community-maintained fork of \`lowlighter/metrics\` focused on compatibility fixes, security updates, and continued maintenance:
https://github.com/yuanweize/metrics-community

${target.contextLine}
This issue is tracked in the community fork here:
${target.community_target}

The original report and discussion remain here and attribution stays with the original contributors. The fork is independent and is not an official successor to \`lowlighter/metrics\`.
If this still affects you, additional reproduction details or testing against the maintained fork would be very helpful.`
    } else {
      return `${NAVIGATION_MARKER}
Hi @${target.author} — I’m maintaining an independent community-maintained fork of \`lowlighter/metrics\` focused on compatibility fixes, security updates, and continued maintenance:
https://github.com/yuanweize/metrics-community

${target.contextLine}
I’ve included this upstream issue in the fork’s migration/backlog tracking and plan to continue triaging it there:
https://github.com/yuanweize/metrics-community/blob/main/docs/migration/UPSTREAM_BACKLOG.md

The original report and discussion remain here and attribution stays with the original contributors. The fork is independent and is not an official successor to \`lowlighter/metrics\`.
If this issue still affects you, current reproduction details would be very helpful.`
    }
  } else {
    // Pull Request
    if (target.community_target) {
      return `${NAVIGATION_MARKER}
Thanks for this contribution. I’m maintaining an independent community-maintained fork of \`lowlighter/metrics\`:
https://github.com/yuanweize/metrics-community

${target.contextLine}
This change has been ported/reworked in the community fork here:
${target.community_target}

I’ve kept a reference to this original PR so the contribution and discussion remain attributed correctly. The community fork is independent and is not an official successor to \`lowlighter/metrics\`.
If you’re still interested in this change, review/testing on the maintained implementation would be very welcome.`
    } else {
      return `${NAVIGATION_MARKER}
Thanks for this contribution. I’m maintaining an independent community-maintained fork of \`lowlighter/metrics\`:
https://github.com/yuanweize/metrics-community

${target.contextLine}
I’ve added this PR to the community fork’s migration backlog for review and porting:
https://github.com/yuanweize/metrics-community/blob/main/docs/migration/UPSTREAM_BACKLOG.md

The original contribution and discussion remain here and will stay credited to this PR. The fork is independent and is not an official successor to \`lowlighter/metrics\`.
If you’re still interested in maintaining or testing this change, contributions on the community fork are welcome.`
    }
  }
}

/**
 * Step 5: Execute or Simulate Posting
 */
let postedNow = 0
let failedNow = 0

const targetsToProcess = auditedTargets.filter(t => t.comment && t.status === "pending")

for (const target of targetsToProcess) {
  if (postedNow >= limit) {
    console.log(`[STOP] Reached batch limit of ${limit}.`)
    break
  }

  const commentBody = renderCommentBody(target)
  console.log(`\n-------------------------------------------------------------`)
  console.log(`[#${target.number}] ${target.type.toUpperCase()} by @${target.author} (${target.domain})`)
  console.log(`Title: "${target.title}"`)

  if (isDryRun) {
    console.log(`[DRY-RUN WOULD POST]:\n${commentBody.split("\n").map(l => "  | " + l).join("\n")}`)
    postedNow++
  } else {
    // Check again before posting to be 100% sure
    try {
      const chkCmd = target.type === "issue"
        ? `gh issue view ${target.number} -R lowlighter/metrics --json comments`
        : `gh pr view ${target.number} -R lowlighter/metrics --json comments`
      const chkOut = JSON.parse(execSync(chkCmd, { encoding: "utf-8" }))
      if (chkOut.comments && chkOut.comments.some(c => c.body && (c.body.includes(NAVIGATION_MARKER) || c.body.includes(LEGACY_MARKER)))) {
        console.log(`[SKIP] Marker detected dynamically on #${target.number}, skipping.`)
        target.status = "already_commented"
        commentLog.push({
          type: target.type,
          upstream_number: target.number,
          target_url: target.community_target || "https://github.com/yuanweize/metrics-community",
          timestamp: new Date().toISOString(),
          status: "already_commented",
          notes: "Marker detected on upstream thread prior to post"
        })
        fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")
        continue
      }
    } catch (e) {
      console.warn(`[WARN] Could not double-check comments on #${target.number}: ${e.message}`)
    }

    // Write temp comment file
    const tmpFile = path.join(rootDir, `.tmp_comment_${target.number}.md`)
    try {
      fs.writeFileSync(tmpFile, commentBody, "utf-8")
      const postCmd = target.type === "issue"
        ? `gh issue comment ${target.number} -R lowlighter/metrics --body-file ${JSON.stringify(tmpFile)}`
        : `gh pr comment ${target.number} -R lowlighter/metrics --body-file ${JSON.stringify(tmpFile)}`
      
      const outUrl = execSync(postCmd, { encoding: "utf-8" }).trim()
      fs.unlinkSync(tmpFile)

      console.log(`[POSTED] Successfully posted comment on #${target.number}: ${outUrl}`)
      postedNow++
      target.status = "posted"
      commentLog.push({
        type: target.type,
        upstream_number: target.number,
        author: target.author,
        title: target.title,
        domain: target.domain,
        comment_url: outUrl,
        timestamp: new Date().toISOString(),
        status: "posted"
      })
      fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")

      // Delay between posts to protect secondary rate limit
      console.log(`[WAIT] Sleeping ${delaySec}s...`)
      execSync(`sleep ${delaySec}`)
    } catch (err) {
      console.error(`[ERROR] Failed to post comment on #${target.number}: ${err.message}`)
      failedNow++
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)

      commentLog.push({
        type: target.type,
        upstream_number: target.number,
        author: target.author,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: err.message
      })
      fs.writeFileSync(logPath, JSON.stringify(commentLog, null, 2), "utf-8")

      // Halt on secondary rate limit or abuse
      if (err.message.includes("secondary rate limit") || err.message.includes("abuse") || err.message.includes("429") || err.message.includes("403")) {
        console.error("RATE LIMIT / ABUSE DETECTION DETECTED! Halting comment batch immediately.")
        break
      }
    }
  }
}

// Update comment-targets.json with latest status
fs.writeFileSync(targetsPath, JSON.stringify(auditedTargets, null, 2), "utf-8")

console.log(`\n================= BATCH FINISHED =================`)
console.log(`Mode:              ${isExecute ? "EXECUTE" : "DRY-RUN"}`)
console.log(`Processed:         ${postedNow}`)
console.log(`Failures:          ${failedNow}`)
console.log(`Saved log:         ${logPath}`)
console.log(`Saved targets:     ${targetsPath}`)
console.log(`==================================================`)
