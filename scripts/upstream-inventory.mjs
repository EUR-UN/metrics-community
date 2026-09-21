#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const CWD = process.cwd()
const OUT_DIR = join(CWD, "docs", "migration")
mkdirSync(OUT_DIR, { recursive: true })

function ghJson(args) {
  try {
    const stdout = execFileSync("gh", args, { maxBuffer: 100 * 1024 * 1024, encoding: "utf-8" })
    return JSON.parse(stdout)
  } catch (err) {
    console.error(`Error running gh ${args.join(" ")}:`, err.message)
    return null
  }
}

function ghText(args) {
  try {
    return execFileSync("gh", args, { maxBuffer: 100 * 1024 * 1024, encoding: "utf-8" }).trim()
  } catch (err) {
    return ""
  }
}

console.log("1. Gathering authenticated user & baseline repo metadata...")
const authUser = ghText(["api", "user", "-q", ".login"]) || "yuanweize"
const upstreamRepo = ghJson(["repo", "view", "lowlighter/metrics", "--json", "name,owner,defaultBranchRef,stargazerCount,forkCount,isArchived,createdAt,pushedAt,description,topics"])
const forkRepo = ghJson(["repo", "view", `${authUser}/metrics`, "--json", "name,owner,defaultBranchRef,isFork,parent,url,createdAt,pushedAt"])

console.log("2. Fetching branch SHAs...")
const upstreamMasterSha = ghText(["api", "repos/lowlighter/metrics/commits/master", "-q", ".sha"])
const forkMasterSha = ghText(["api", `repos/${authUser}/metrics/commits/master`, "-q", ".sha"])

console.log("3. Fetching branches, tags, releases...")
const upstreamBranches = ghJson(["api", "--paginate", "repos/lowlighter/metrics/branches"]) || []
const upstreamTags = ghJson(["api", "--paginate", "repos/lowlighter/metrics/tags"]) || []
const upstreamReleases = ghJson(["api", "--paginate", "repos/lowlighter/metrics/releases"]) || []
const forkBranches = ghJson(["api", "--paginate", `repos/${authUser}/metrics/branches`]) || []

const baseline = {
  timestamp_utc: new Date().toISOString(),
  authenticated_user: authUser,
  upstream: {
    repo: "lowlighter/metrics",
    master_sha: upstreamMasterSha,
    metadata: upstreamRepo,
    branches: upstreamBranches.map(b => ({ name: b.name, sha: b.commit?.sha })),
    tags: upstreamTags.map(t => ({ name: t.name, sha: t.commit?.sha })),
    releases: upstreamReleases.map(r => ({ tag_name: r.tag_name, name: r.name, published_at: r.published_at })),
  },
  fork: {
    repo: `${authUser}/metrics`,
    master_sha: forkMasterSha,
    metadata: forkRepo,
    branches: forkBranches.map(b => ({ name: b.name, sha: b.commit?.sha })),
  },
}

writeFileSync(join(OUT_DIR, "repository-baseline.json"), JSON.stringify(baseline, null, 2))
console.log("Saved repository-baseline.json")

console.log("4. Fetching all open upstream issues (with pagination)...")
// Using gh api repos/lowlighter/metrics/issues?state=open
// Note: GitHub issues API returns both issues and PRs; we filter out pull_request objects
const allOpenIssuesAndPRs = ghJson(["api", "--paginate", "repos/lowlighter/metrics/issues?state=open&per_page=100"]) || []
const openIssuesRaw = allOpenIssuesAndPRs.filter(item => !item.pull_request)
const openPRsRaw = allOpenIssuesAndPRs.filter(item => item.pull_request)

console.log(`Found ${openIssuesRaw.length} open issues and ${openPRsRaw.length} open PR summaries. Fetching issue details...`)

const openIssues = []
for (const issue of openIssuesRaw) {
  process.stdout.write(`Fetching issue #${issue.number}... `)
  const comments = ghJson(["api", "--paginate", `repos/lowlighter/metrics/issues/${issue.number}/comments`]) || []
  openIssues.push({
    number: issue.number,
    title: issue.title,
    user: issue.user?.login,
    author_association: issue.author_association,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    labels: issue.labels?.map(l => l.name) || [],
    state: issue.state,
    body: issue.body,
    html_url: issue.html_url,
    comments_count: issue.comments,
    comments: comments.map(c => ({
      id: c.id,
      user: c.user?.login,
      created_at: c.created_at,
      body: c.body,
    })),
  })
  console.log("done.")
}

writeFileSync(join(OUT_DIR, "upstream-open-issues.json"), JSON.stringify(openIssues, null, 2))
console.log(`Saved upstream-open-issues.json (${openIssues.length} issues)`)

console.log("5. Fetching complete open PR details (commits, files, reviews, checks)...")
const openPRs = []
for (const prSummary of openPRsRaw) {
  const num = prSummary.number
  process.stdout.write(`Fetching PR #${num}... `)
  const prDetail = ghJson(["api", `repos/lowlighter/metrics/pulls/${num}`]) || prSummary
  const prComments = ghJson(["api", "--paginate", `repos/lowlighter/metrics/issues/${num}/comments`]) || []
  const prReviewComments = ghJson(["api", "--paginate", `repos/lowlighter/metrics/pulls/${num}/comments`]) || []
  const prReviews = ghJson(["api", "--paginate", `repos/lowlighter/metrics/pulls/${num}/reviews`]) || []
  const prCommits = ghJson(["api", "--paginate", `repos/lowlighter/metrics/pulls/${num}/commits`]) || []
  const prFiles = ghJson(["api", "--paginate", `repos/lowlighter/metrics/pulls/${num}/files`]) || []

  openPRs.push({
    number: num,
    title: prDetail.title,
    user: prDetail.user?.login,
    author_association: prDetail.author_association,
    created_at: prDetail.created_at,
    updated_at: prDetail.updated_at,
    labels: prDetail.labels?.map(l => l.name) || [],
    state: prDetail.state,
    draft: prDetail.draft,
    html_url: prDetail.html_url,
    body: prDetail.body,
    head: {
      label: prDetail.head?.label,
      ref: prDetail.head?.ref,
      sha: prDetail.head?.sha,
      repo: prDetail.head?.repo?.full_name,
    },
    base: {
      ref: prDetail.base?.ref,
      sha: prDetail.base?.sha,
    },
    mergeable: prDetail.mergeable,
    mergeable_state: prDetail.mergeable_state,
    additions: prDetail.additions,
    deletions: prDetail.deletions,
    changed_files: prDetail.changed_files,
    files: prFiles.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
    })),
    commits: prCommits.map(c => ({
      sha: c.sha,
      author: c.commit?.author,
      committer: c.commit?.committer,
      message: c.commit?.message,
    })),
    reviews: prReviews.map(r => ({
      id: r.id,
      user: r.user?.login,
      state: r.state,
      body: r.body,
      submitted_at: r.submitted_at,
    })),
    review_comments: prReviewComments.map(rc => ({
      id: rc.id,
      user: rc.user?.login,
      body: rc.body,
      path: rc.path,
      position: rc.position,
      line: rc.line,
      created_at: rc.created_at,
    })),
    issue_comments: prComments.map(c => ({
      id: c.id,
      user: c.user?.login,
      body: c.body,
      created_at: c.created_at,
    })),
  })
  console.log("done.")
}

writeFileSync(join(OUT_DIR, "upstream-open-prs.json"), JSON.stringify(openPRs, null, 2))
console.log(`Saved upstream-open-prs.json (${openPRs.length} PRs)`)

console.log("6. Writing BASELINE.md...")
const baselineMd = `# Upstream Baseline Snapshot

- **Timestamp (UTC)**: ${baseline.timestamp_utc}
- **Authenticated User**: \`${authUser}\`
- **Upstream Repository**: [\`lowlighter/metrics\`](https://github.com/lowlighter/metrics)
- **Upstream Master SHA**: \`${upstreamMasterSha}\`
- **Fork Repository**: [\`${authUser}/metrics\`](https://github.com/${authUser}/metrics)
- **Fork Master SHA**: \`${forkMasterSha}\`
- **Total Open Issues**: ${openIssues.length}
- **Total Open PRs**: ${openPRs.length}
- **Latest Upstream Release**: \`v3.34\` (${baseline.upstream.releases[0]?.published_at || "2023-09-13"})
- **Upstream Default Branch**: \`${baseline.upstream.metadata?.defaultBranchRef?.name || "master"}\`

## Upstream Branches
${baseline.upstream.branches.map(b => `- \`${b.name}\` (\`${b.sha?.slice(0, 7)}\`)`).join("\n")}

## Open Pull Requests Overview (${openPRs.length} items)
| PR | Title | Author | Head Branch | Files | Additions | Deletions | Updated At |
|---|---|---|---|---|---|---|---|
${openPRs.map(pr => `| [#${pr.number}](${pr.html_url}) | ${pr.title.replace(/\|/g, "\\|")} | @${pr.user} | \`${pr.head.label}\` | ${pr.changed_files} | +${pr.additions} | -${pr.deletions} | ${pr.updated_at?.slice(0, 10)} |`).join("\n")}

## Open Issues Overview (${openIssues.length} items)
| Issue | Title | Author | Comments | Labels | Updated At |
|---|---|---|---|---|---|
${openIssues.map(i => `| [#${i.number}](${i.html_url}) | ${i.title.replace(/\|/g, "\\|")} | @${i.user} | ${i.comments_count} | ${i.labels.join(", ")} | ${i.updated_at?.slice(0, 10)} |`).join("\n")}
`

writeFileSync(join(OUT_DIR, "BASELINE.md"), baselineMd)
console.log("Saved BASELINE.md successfully.")
console.log("Baseline inventory complete!")
