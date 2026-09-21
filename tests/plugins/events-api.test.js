const ejs = require("ejs")
const path = require("path")

describe("Events API & PushEvent Null-Safety Tests", () => {
  test("habits plugin handles PushEvent with missing or null commits gracefully", async () => {
    const habitsPlugin = (await import("../../source/plugins/habits/index.mjs")).default

    const mockEvents = [
      {
        type: "PushEvent",
        created_at: new Date().toISOString(),
        actor: { login: "test-user" },
        repo: { name: "test-user/repo1" },
        payload: {
          // commits field missing (e.g. large push / Events API 2025/2026 change)
        },
      },
      {
        type: "PushEvent",
        created_at: new Date().toISOString(),
        actor: { login: "test-user" },
        repo: { name: "test-user/repo2" },
        payload: {
          commits: [
            null, // null commit element
            {
              author: { login: "test-user", email: "test@example.com", name: "Test User" },
              url: "https://api.github.com/repos/test-user/repo2/commits/sha123",
            },
            {
              // missing author
              url: "https://api.github.com/repos/test-user/repo2/commits/sha456",
            },
          ],
        },
      },
    ]

    const mockRest = {
      activity: {
        listEventsForAuthenticatedUser: async () => ({ data: mockEvents }),
      },
      request: async () => ({
        data: {
          files: [
            { filename: "index.js", patch: "+console.log('hello')\n-console.log('old')" },
          ],
        },
      }),
    }

    const mockImports = {
      paths: path,
      filters: { repo: () => true },
      format: { error: e => e },
      metadata: {
        plugins: {
          habits: {
            enabled: () => true,
            inputs: () => ({
              from: 100,
              days: 14,
              facts: true,
              charts: false,
              "charts.type": "classic",
              trim: false,
            }),
            extras: () => false,
          },
        },
      },
    }

    const result = await habitsPlugin(
      {
        login: "test-user",
        data: {
          shared: {
            "commits.authoring": ["test-user", "test@example.com"],
            "repositories.skipped": [],
          },
        },
        imports: mockImports,
        rest: mockRest,
        q: { habits: true },
        account: "user",
      },
      { enabled: true }
    )

    expect(result).toBeDefined()
    expect(result.commits.fetched).toBe(2)
    expect(result.lines.average.chars).toBeGreaterThan(0)
  })

  test("activity plugin handles PushEvent with missing or null commits safely", async () => {
    const activityPlugin = (await import("../../source/plugins/activity/index.mjs")).default

    const mockEvents = [
      {
        id: "1",
        type: "PushEvent",
        created_at: new Date().toISOString(),
        actor: { login: "test-user" },
        repo: { name: "test-user/repo1" },
        payload: {
          // commits missing
          size: 0,
          ref: "refs/heads/main",
        },
      },
      {
        id: "2",
        type: "PushEvent",
        created_at: new Date().toISOString(),
        actor: { login: "test-user" },
        repo: { name: "test-user/repo2" },
        payload: {
          size: 2,
          ref: "refs/heads/feature",
          commits: [
            null, // null entry
            {
              // missing author
              sha: "abcdef1234567890",
              message: "Initial commit",
            },
            {
              author: { email: "test@example.com" },
              sha: "1234567abcdef",
              message: "Merge branch 'main' into feature",
            },
          ],
        },
      },
    ]

    const mockRest = {
      activity: {
        listEventsForAuthenticatedUser: async () => ({ data: mockEvents }),
      },
    }

    const mockImports = {
      filters: {
        text: () => true,
        repo: () => true,
      },
      markdown: async (text) => text,
      metadata: {
        plugins: {
          activity: {
            enabled: () => true,
            inputs: () => ({
              limit: 5,
              load: 100,
              days: 14,
              filter: "all",
              visibility: "all",
              timestamps: false,
              ignored: [],
              skipped: [],
            }),
          },
        },
      },
    }

    const result = await activityPlugin(
      {
        login: "test-user",
        data: {
          shared: {
            "repositories.skipped": [],
            "users.ignored": [],
          },
        },
        imports: mockImports,
        rest: mockRest,
        q: { activity: true },
        account: "user",
      },
      { enabled: true }
    )

    expect(result).toBeDefined()
    expect(result.events.length).toBe(1)
    expect(result.events[0].type).toBe("push")
    expect(result.events[0].branch).toBe("feature")
    expect(result.events[0].commits.length).toBe(1)
    expect(result.events[0].commits[0].sha).toBe("1234567")
  })

  test("wakatime template renders cleanly when sections is undefined or null", async () => {
    const templatePath = path.resolve(__dirname, "../../source/templates/classic/partials/wakatime.ejs")

    const rendered = await ejs.renderFile(
      templatePath,
      {
        plugins: {
          wakatime: {
            // sections is undefined
          },
        },
        f: (val) => val,
        s: () => "",
        large: 0,
      }
    )

    expect(rendered).toBeDefined()
    expect(typeof rendered).toBe("string")
  })
})
