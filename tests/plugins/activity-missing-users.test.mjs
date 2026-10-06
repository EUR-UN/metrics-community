import {test} from "node:test"
import assert from "node:assert/strict"
import activity from "../../source/plugins/activity/index.mjs"

const event = (type, payload) => ({type, payload, actor: {login: "heykatie"}, repo: {name: "example/repo"}, created_at: new Date().toISOString(), public: true})
async function run(events) {
  return activity({login: "heykatie", account: "user", q: {activity: true},
    data: {shared: {"repositories.skipped": [], "users.ignored": []}},
    rest: {activity: {listEventsForAuthenticatedUser: async () => ({data: events})}},
    imports: {filters: {repo: () => true, text: () => true}, markdown: async text => text,
      format: {error: error => error}, metadata: {plugins: {activity: {enabled: () => true,
        inputs: () => ({limit: 20, load: 100, days: 30, filter: ["push", "pr", "review", "issue", "release"], visibility: "public", skipped: [], ignored: []})}}}}}, {enabled: true})
}

for (const type of ["PullRequestEvent", "PullRequestReviewEvent", "PullRequestReviewCommentEvent", "IssuesEvent", "IssueCommentEvent", "CommitCommentEvent"]) {
  for (const user of [undefined, null]) {
    test(`${type} skips missing user without losing valid events (${user})`, async () => {
      const subject = {user, title: "Example", number: 1, body: "Body", commit_id: "abcdef123"}
      const malformed = event(type, {action: type === "PullRequestEvent" || type === "IssuesEvent" ? "opened" : "created", pull_request: subject, issue: subject, comment: subject, review: {state: "approved"}})
      const valid = event("PullRequestEvent", {action: "closed", pull_request: {...subject, user: {login: "author"}, merged: true, additions: 2, deletions: 1, changed_files: 1}})
      const result = await run([malformed, valid])
      assert.equal(result.events.length, 1)
      assert.equal(result.events[0].action, "merged")
      assert.equal(result.events[0].user, "author")
      assert.deepEqual(result.events[0].lines, {added: 2, deleted: 1})
    })
  }
}

test("PushEvent protection survives the backport", async () => {
  const result = await run([event("PushEvent", {}), event("PushEvent", {commits: null}), event("PushEvent", {ref: "refs/heads/main", commits: [null, {}, {author: {email: "a@example.com"}, sha: "abcdef123", message: "Example"}]})])
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].commits[0].sha, "abcdef1")
})
