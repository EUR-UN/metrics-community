import assert from "node:assert/strict"
import { test } from "node:test"
import activity from "../../source/plugins/activity/index.mjs"

const before = "a".repeat(40)
const head = "b".repeat(40)
const event = (type, payload, offset = 0) => ({type, payload, actor: {login: "test-user"}, repo: {name: "example/repository"}, created_at: new Date(Date.now() - offset * 1000).toISOString(), public: true})
const pr = {number: 7, user: {login: "author"}, title: "Real PR title", body: "Description", additions: 3, deletions: 2, changed_files: 1, merged: true}
const trimmed = (action = "opened", offset = 0) => event("PullRequestEvent", {action, number: 7, pull_request: {number: 7, url: "https://untrusted.invalid/pulls/7"}}, offset)
async function run(events, {get = async () => ({data: pr}), compare = async () => ({data: {commits: [], total_commits: 0}}), inputs = {}, repoMode = false, ignoredUser = null} = {}) {
  const calls = {pulls: [], compare: [], pages: []}
  const recordGet = async params => {
    calls.pulls.push(params)
    return get(params)
  }
  const recordCompare = async params => {
    calls.compare.push(params)
    return compare(params)
  }
  const result = await activity({
    login: "test-user",
    account: "user",
    q: {activity: true, repo: repoMode},
    data: {user: {repositories: {nodes: [{name: "repository", owner: {login: "example"}}]}}, shared: {"repositories.skipped": [], "users.ignored": []}},
    rest: {
      pulls: {get: recordGet},
      repos: {compareCommitsWithBasehead: recordCompare},
      activity: {
        listEventsForAuthenticatedUser: async () => ({data: events}),
        listRepoEvents: async params => {
          calls.pages.push(params)
          return {data: events}
        },
      },
    },
    imports: {
      filters: {repo: (repo, skipped) => !skipped.includes(repo), text: user => user !== ignoredUser},
      markdown: async text => text,
      format: {error: error => error},
      metadata: {plugins: {activity: {enabled: () => true, inputs: () => ({limit: 5, load: 100, days: 30, filter: ["push", "pr", "review", "issue", "release"], visibility: "public", skipped: [], ignored: [], ...inputs})}}},
    },
  }, {enabled: true})
  return {result, calls}
}

test("trimmed PRs fetch real details using repository and number, never payload URL", async () => {
  const {result, calls} = await run([trimmed()])
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].title, pr.title)
  assert.equal(result.events[0].user, "author")
  assert.equal(result.events[0].action, "opened")
  assert.deepEqual(result.events[0].lines, {added: 3, deleted: 2})
  assert.deepEqual(calls.pulls, [{owner: "example", repo: "repository", pull_number: 7}])
})

test("explicit merged actions render as merged; cached details do not rewrite earlier opened events", async () => {
  const {result, calls} = await run([trimmed("opened", 1), trimmed("merged")])
  assert.deepEqual(result.events.map(e => e.action), ["merged", "opened"])
  assert.equal(calls.pulls.length, 1)
})

test("legacy complete PR payloads need no extra lookup", async () => {
  const {result, calls} = await run([event("PullRequestEvent", {action: "closed", pull_request: pr})])
  assert.equal(result.events[0].action, "merged")
  assert.equal(calls.pulls.length, 0)
})

test("trimmed review events share the PR lookup", async () => {
  const {result, calls} = await run([event("PullRequestReviewEvent", {pull_request: {number: 7}, review: {state: "approved"}}), trimmed()])
  assert.equal(result.events.length, 2)
  assert.equal(result.events[0].review, "approved")
  assert.equal(calls.pulls.length, 1)
})

for (const status of [403, 404, 429, 500]) {
  test(`failed PR lookup (${status}) preserves other valid events and caches failure`, async () => {
    const {result, calls} = await run([trimmed(), trimmed(), event("PullRequestEvent", {action: "opened", pull_request: {...pr, number: 8}})], {
      get: async () => {
        throw Object.assign(new Error("Unavailable"), {status})
      },
    })
    assert.equal(result.events.length, 1)
    assert.equal(result.events[0].number, 8)
    assert.equal(calls.pulls.length, 1)
  })
}

test("missing PR identifiers and still-missing users are skipped", async () => {
  const {result, calls} = await run([event("PullRequestEvent", {action: "opened", pull_request: {}}), trimmed()], {get: async () => ({data: {...pr, user: null}})})
  assert.equal(result.events.length, 0)
  assert.equal(calls.pulls.length, 1)
})

test("excluded type, actor, date, visibility, repository and action require no detail calls", async () => {
  const candidates = [event("PullRequestReviewCommentEvent", {action: "created", pull_request: {number: 7}}), {...trimmed(), actor: {login: "other"}}, {...trimmed(), created_at: "2020-01-01"}, {...trimmed(), public: false}, {...trimmed(), repo: {name: "skip/repository"}}, trimmed("labeled")]
  const {result, calls} = await run(candidates, {inputs: {skipped: ["skip/repository"]}})
  assert.equal(result.events.length, 0)
  assert.equal(calls.pulls.length, 0)
})

test("limit and timestamp ordering bound detail calls", async () => {
  const {result, calls} = await run([trimmed("opened", 20), {...trimmed("merged"), payload: {action: "merged", number: 8, pull_request: {number: 8}}}], {inputs: {limit: 1}})
  assert.equal(result.events[0].action, "merged")
  assert.equal(calls.pulls.length, 1)
  assert.equal(calls.pulls[0].pull_number, 8)
})

test("ignored hydrated authors stay ignored", async () => {
  const {result} = await run([trimmed()], {ignoredUser: "author"})
  assert.equal(result.events.length, 0)
})

test("push recovery uses nested commit author/message even with no linked GitHub author", async () => {
  const commits = [null, {sha: head, author: null, commit: {author: {email: "author@example.com"}, message: "Actual commit message"}}, {sha: before, commit: {author: null, message: "Missing author"}}]
  const {result, calls} = await run([event("PushEvent", {before, head, ref: "refs/heads/main"})], {compare: async () => ({data: {commits, total_commits: 2}})})
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].size, 2)
  assert.deepEqual(result.events[0].commits, [{sha: "bbbbbbb", message: "Actual commit message"}])
  assert.deepEqual(calls.compare, [{owner: "example", repo: "repository", basehead: `${before}...${head}`}])
})

test("repeated push ranges reuse a comparison; populated legacy pushes do not fetch", async () => {
  const push = event("PushEvent", {before, head, ref: "refs/heads/main"})
  const {result, calls} = await run([push, push, event("PushEvent", {size: 1, ref: "refs/heads/main", commits: [{sha: head, author: {email: "author@example.com"}, message: "Legacy"}]})], {compare: async () => ({data: {total_commits: 1, commits: [{sha: head, commit: {author: {email: "author@example.com"}, message: "Recovered"}}]}})})
  assert.equal(result.events.length, 3)
  assert.equal(calls.compare.length, 1)
})

test("invalid comparisons or non-array commits cannot crash valid activity", async () => {
  const {result, calls} = await run([event("PushEvent", {head, before: "invalid", commits: null}), event("PushEvent", {head, before, commits: {}}), trimmed()], {
    compare: async () => {
      throw new Error("Gone")
    },
  })
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].type, "pr")
  assert.equal(calls.compare.length, 1)
})

test("empty or malformed comparison responses are skipped", async () => {
  for (const data of [{}, {commits: null}, {commits: {}}, null]) {
    const {result} = await run([event("PushEvent", {before, head})], {compare: async () => ({data})})
    assert.equal(result.events.length, 0)
  }
})

test("repository pagination passes the requested page and size", async () => {
  const {calls} = await run([], {repoMode: true, inputs: {load: 200}})
  assert.deepEqual(calls.pages, [{owner: "example", repo: "repository", per_page: 100, page: 1}, {owner: "example", repo: "repository", per_page: 100, page: 2}])
})
