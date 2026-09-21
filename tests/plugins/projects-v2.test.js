// Tests for Projects V2 migration across achievements and projects plugin
describe("Projects V2 Migration Tests", () => {
  test("User Manager achievement unlocks using projectsV2", async () => {
    const { faker } = await import("@faker-js/faker")
    const mockUserGenerator = (await import("../mocks/api/github/graphql/achievements.default.mjs")).default
    const mockRankingGenerator = (await import("../mocks/api/github/graphql/achievements.ranking.mjs")).default
    const usersAchievements = (await import("../../source/plugins/achievements/list/users.mjs")).default

    const list = []
    const rawMock = mockUserGenerator({ faker, login: "test-user" })
    const mockUser = rawMock.user
    // Explicitly delete legacy projects and set projectsV2
    delete mockUser.projects
    mockUser.projectsV2 = {
      totalCount: 3,
      nodes: [{ createdAt: "2024-01-01T00:00:00Z" }],
    }

    const mockGraphql = async (query) => {
      if (typeof query === "string" && query.includes("ranking")) {
        return mockRankingGenerator({ faker, login: "test-user" })
      }
      if (typeof query === "string" && query.includes("metrics")) {
        return { repository: { viewerHasStarred: false }, viewer: { login: "test-user" } }
      }
      if (typeof query === "string" && query.includes("octocat")) {
        return { user: { viewerIsFollowing: false }, viewer: { login: "test-user" } }
      }
      return {
        user: mockUser,
      }
    }

    const mockQueries = {
      achievements: Object.assign(() => "query", {
        ranking: () => "ranking",
        metrics: () => "metrics",
        octocat: () => "octocat",
      }),
    }

    const mockRest = {
      packages: {
        listPackagesForUser: async () => ({ data: [] }),
        listPackagesForOrganization: async () => ({ data: [] }),
      },
    }

    await usersAchievements({
      list,
      login: "test-user",
      data: { user: { repositories: { nodes: [] } } },
      computed: { registered: { years: 2 } },
      imports: { s: n => (n > 1 ? "s" : ""), axios: { get: async () => ({ data: "" }) } },
      graphql: mockGraphql,
      queries: mockQueries,
      rest: mockRest,
      account: "user",
      rank: (val, steps) => ({ level: 1 }),
      leaderboard: () => ({}),
    })

    const manager = list.find(a => a.title === "Manager")
    expect(manager).toBeDefined()
    expect(manager.value).toBe(3)
  })

  test("Organization Managers achievement unlocks using projectsV2", async () => {
    const { faker } = await import("@faker-js/faker")
    const mockOrgGenerator = (await import("../mocks/api/github/graphql/achievements.organizations.mjs")).default
    const mockRankingGenerator = (await import("../mocks/api/github/graphql/achievements.ranking.mjs")).default
    const orgAchievements = (await import("../../source/plugins/achievements/list/organizations.mjs")).default

    const list = []
    const rawMock = mockOrgGenerator({ faker, login: "test-org" })
    const mockOrg = rawMock.organization
    // Explicitly delete legacy projects and set projectsV2
    delete mockOrg.projects
    mockOrg.projectsV2 = {
      totalCount: 5,
      nodes: [{ createdAt: "2024-01-01T00:00:00Z" }],
    }

    const mockGraphql = async (query) => {
      if (typeof query === "string" && query.includes("ranking")) {
        return mockRankingGenerator({ faker, login: "test-org" })
      }
      return {
        organization: mockOrg,
      }
    }

    const mockQueries = {
      achievements: {
        organizations: () => "organizations",
        ranking: () => "ranking",
      },
    }

    const mockRest = {
      packages: {
        listPackagesForOrganization: async () => ({ data: [] }),
      },
    }

    await orgAchievements({
      list,
      login: "test-org",
      data: { organization: mockOrg, user: { repositories: { nodes: [] } } },
      computed: { registered: { years: 2 } },
      imports: { s: n => (n > 1 ? "s" : "") },
      graphql: mockGraphql,
      queries: mockQueries,
      rest: mockRest,
      account: "organization",
      rank: (val, steps) => ({ level: 2 }),
      leaderboard: () => ({}),
    })

    const managers = list.find(a => a.title === "Managers")
    expect(managers).toBeDefined()
    expect(managers.value).toBe(5)
  })

  test("Projects plugin handles absence of legacy projects gracefully", async () => {
    const projectsPlugin = (await import("../../source/plugins/projects/index.mjs")).default

    const mockGraphql = async query => {
      // Simulate projectsV2 returning data
      return {
        user: {
          projectsV2: {
            totalCount: 2,
            nodes: [
              { title: "Project Alpha", progress: { done: 5, inProgress: 2, total: 10 } },
              { title: "Project Beta", progress: { done: 8, inProgress: 1, total: 10 } },
            ],
          },
        },
      }
    }

    const mockImports = {
      metadata: {
        plugins: {
          projects: {
            enabled: () => true,
            inputs: () => ({ limit: 4, repositories: [], descriptions: false }),
          },
        },
      },
      format: { error: e => e },
    }

    const result = await projectsPlugin(
      {
        login: "test-user",
        data: {},
        imports: mockImports,
        graphql: mockGraphql,
        q: { projects: true },
        queries: { projects: { user: () => "", "user.legacy": () => { throw new Error("Field 'projects' doesn't exist on type 'User'") } } },
        account: "user",
      },
      { enabled: true }
    )

    expect(result).toBeDefined()
    expect(result.totalCount).toBe(2)
    expect(result.list.length).toBe(2)
    expect(result.list[0].name).toBe("Project Alpha")
  })
})
