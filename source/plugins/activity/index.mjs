//Setup
export default async function({login, data, rest, q, account, imports}, {enabled = false, markdown = "inline", extras = false} = {}) {
  //Plugin execution
  try {
    //Check if plugin is enabled and requirements are met
    if ((!q.activity) || (!imports.metadata.plugins.activity.enabled(enabled, {extras})))
      return null

    //Context
    let context = {mode: "user"}
    if (q.repo) {
      console.debug(`metrics/compute/${login}/plugins > activity > switched to repository mode`)
      const {owner, repo} = data.user.repositories.nodes.map(({name: repo, owner: {login: owner}}) => ({repo, owner})).shift()
      context = {...context, mode: "repository", owner, repo}
    }

    //Load inputs
    let {limit, load, days, filter, visibility, timestamps, skipped, ignored} = imports.metadata.plugins.activity.inputs({data, q, account})
    if (!days)
      days = Infinity
    skipped.push(...data.shared["repositories.skipped"])
    ignored.push(...data.shared["users.ignored"])
    const pages = Math.ceil(load / 100)
    const codelines = 2

    //Get user recent activity
    console.debug(`metrics/compute/${login}/plugins > activity > querying api`)
    const events = []
    try {
      for (let page = 1; page <= pages; page++) {
        console.debug(`metrics/compute/${login}/plugins > activity > loading page ${page}/${pages}`)
        events.push(...(context.mode === "repository" ? await rest.activity.listRepoEvents({owner: context.owner, repo: context.repo, per_page: 100, page}) : await rest.activity.listEventsForAuthenticatedUser({username: login, per_page: 100, page})).data)
      }
    }
    catch {
      console.debug(`metrics/compute/${login}/plugins > activity > no more page to load`)
    }
    console.debug(`metrics/compute/${login}/plugins > activity > ${events.length} events loaded`)

    //Filter before looking up details omitted by the Events API.
    const types = {
      CommitCommentEvent: "comment",
      CreateEvent: "ref/create",
      DeleteEvent: "ref/delete",
      ForkEvent: "fork",
      GollumEvent: "wiki",
      IssueCommentEvent: "comment",
      IssuesEvent: "issue",
      MemberEvent: "member",
      PublicEvent: "public",
      PullRequestEvent: "pr",
      PullRequestReviewEvent: "review",
      PullRequestReviewCommentEvent: "comment",
      PushEvent: "push",
      ReleaseEvent: "release",
      WatchEvent: "star",
    }
    const candidates = events
      .filter(({actor}) => account === "organization" || actor?.login?.toLocaleLowerCase() === login.toLocaleLowerCase())
      .filter(({created_at}) => !Number.isFinite(days) || new Date(created_at) > new Date(Date.now() - days * 24 * 60 * 60 * 1000))
      .filter(event => visibility !== "public" || event.public)
      .filter(({repo}) => imports.filters.repo(repo?.name, skipped))
      .filter(({type}) => types[type] && (filter.includes("all") || filter.includes(types[type])))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    //Cache successes and failures within this render; one inaccessible object must not fail the feed.
    const details = new Map()
    const lookup = async (key, request) => {
      if (!details.has(key))
        details.set(key, Promise.resolve().then(request).then(response => response?.data ?? null).catch(() => null))
      return details.get(key)
    }
    const parse = async ({type, payload, actor: {login: actor}, repo: {name: repo}, created_at}) => {
      //See https://docs.github.com/en/free-pro-team@latest/developers/webhooks-and-events/github-event-types
      const timestamp = new Date(created_at)
      if (!imports.filters.repo(repo, skipped))
        return null
      const [owner, repository] = repo.split("/")
      if (["PullRequestEvent", "PullRequestReviewEvent", "PullRequestReviewCommentEvent"].includes(type)) {
        if ((type === "PullRequestEvent") && !["opened", "closed", "merged"].includes(payload.action))
          return null
        if ((type === "PullRequestReviewCommentEvent") && (payload.action !== "created"))
          return null
        if (!payload.pull_request?.user?.login || (typeof payload.pull_request?.title !== "string")) {
          const number = payload.pull_request?.number ?? payload.number
          if (!Number.isSafeInteger(number) || (number < 1) || !owner || !repository)
            return null
          const pull_request = await lookup(`pr:${repo}:${number}`, () => rest.pulls.get({owner, repo: repository, pull_number: number}))
          if (!pull_request?.user?.login || (typeof pull_request.title !== "string"))
            return null
          payload = {...payload, pull_request}
        }
      }
      switch (type) {
        //Commented on a commit
        case "CommitCommentEvent": {
          if (!["created"].includes(payload.action))
            return null
          if (!payload.comment?.user)
            return null
          const {comment: {user: {login: user}, commit_id: sha, body: content}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "comment", on: "commit", actor, timestamp, repo, content: await imports.markdown(content, {mode: markdown, codelines}), user, mobile: null, number: sha.substring(0, 7), title: ""}
        }
        //Created a git branch or tag
        case "CreateEvent": {
          const {ref: name, ref_type: type} = payload
          return {type: "ref/create", actor, timestamp, repo, ref: {name, type}}
        }
        //Deleted a git branch or tag
        case "DeleteEvent": {
          const {ref: name, ref_type: type} = payload
          return {type: "ref/delete", actor, timestamp, repo, ref: {name, type}}
        }
        //Forked repository
        case "ForkEvent": {
          const {forkee: {full_name: forked}} = payload
          return {type: "fork", actor, timestamp, repo, forked}
        }
        //Wiki changes
        case "GollumEvent": {
          const {pages} = payload
          return {type: "wiki", actor, timestamp, repo, pages: pages.map(({title}) => title)}
        }
        //Commented on an issue
        case "IssueCommentEvent": {
          if (!["created"].includes(payload.action))
            return null
          if (!payload.issue?.user)
            return null
          const {issue: {user: {login: user}, title, number}, comment: {body: content, performed_via_github_app: mobile}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "comment", on: "issue", actor, timestamp, repo, content: await imports.markdown(content, {mode: markdown, codelines}), user, mobile, number, title}
        }
        //Issue event
        case "IssuesEvent": {
          if (!["opened", "closed", "reopened"].includes(payload.action))
            return null
          if (!payload.issue?.user)
            return null
          const {action, issue: {user: {login: user}, title, number, body: content}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "issue", actor, timestamp, repo, action, user, number, title, content: await imports.markdown(content, {mode: markdown, codelines})}
        }
        //Activity from repository collaborators
        case "MemberEvent": {
          if (!["added"].includes(payload.action))
            return null
          const {member: {login: user}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "member", actor, timestamp, repo, user}
        }
        //Made repository public
        case "PublicEvent": {
          return {type: "public", actor, timestamp, repo}
        }
        //Pull requests events
        case "PullRequestEvent": {
          if (!["opened", "closed", "merged"].includes(payload.action))
            return null
          if (!payload.pull_request?.user)
            return null
          const {action, pull_request: {user: {login: user}, title, number, body: content, additions: added, deletions: deleted, changed_files: changed, merged}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "pr", actor, timestamp, repo, action: (action === "closed") && (merged) ? "merged" : action, user, title, number, content: await imports.markdown(content, {mode: markdown, codelines}), lines: {added, deleted}, files: {changed}}
        }
        //Reviewed a pull request
        case "PullRequestReviewEvent": {
          if (!payload.pull_request?.user)
            return null
          const {review: {state: review}, pull_request: {user: {login: user}, number, title}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "review", actor, timestamp, repo, review, user, number, title}
        }
        //Commented on a pull request
        case "PullRequestReviewCommentEvent": {
          if (!["created"].includes(payload.action))
            return null
          if (!payload.pull_request?.user)
            return null
          const {pull_request: {user: {login: user}, title, number}, comment: {body: content, performed_via_github_app: mobile}} = payload
          if (!imports.filters.text(user, ignored))
            return null
          return {type: "comment", on: "pr", actor, timestamp, repo, content: await imports.markdown(content, {mode: markdown, codelines}), user, mobile, number, title}
        }
        //Pushed commits
        case "PushEvent": {
          let {size, commits, ref} = payload
          if (!Array.isArray(commits)) {
            const {before, head} = payload
            if (!/^[a-f0-9]{40}$/i.test(before ?? "") || !/^[a-f0-9]{40}$/i.test(head ?? "") || !owner || !repository)
              return null
            const comparison = await lookup(`push:${repo}:${before}:${head}`, () => rest.repos.compareCommitsWithBasehead({owner, repo: repository, basehead: `${before}...${head}`}))
            if (!Array.isArray(comparison?.commits))
              return null
            size = comparison.total_commits ?? comparison.commits.length
            commits = comparison.commits.map(commit => commit && ({sha: commit.sha, message: commit.commit?.message, author: commit.commit?.author}))
          }
          commits = commits.filter(commit => commit && commit.author && imports.filters.text(commit.author.email, ignored))
          if (!commits.length)
            return null
          if (commits.slice(-1).pop()?.message?.startsWith?.("Merge branch "))
            commits = commits.slice(-1)
          return {type: "push", actor, timestamp, repo, size, branch: typeof ref === "string" ? ref.match(/refs.heads.(?<branch>.*)/)?.groups?.branch ?? null : null, commits: commits.reverse().map(({sha, message}) => ({sha: sha ? sha.substring(0, 7) : "", message: message ?? ""}))}
        }
        //Released
        case "ReleaseEvent": {
          if (!["published"].includes(payload.action))
            return null
          const {action, release: {name, tag_name, prerelease, draft, body: content}} = payload
          return {type: "release", actor, timestamp, repo, action, name: name || tag_name, prerelease, draft, content: await imports.markdown(content, {mode: markdown, codelines})}
        }
        //Starred a repository
        case "WatchEvent": {
          if (!["started"].includes(payload.action))
            return null
          const {action} = payload
          return {type: "star", actor, timestamp, repo, action}
        }
        //Unknown event
        default: {
          return null
        }
      }
    }

    //Process in display order and stop at the limit instead of hydrating every fetched event.
    const activity = []
    for (const candidate of candidates) {
      if (activity.length >= limit)
        break
      const parsed = await parse(candidate)
      if (parsed)
        activity.push(parsed)
    }

    //Results
    return {timestamps, events: activity}
  }
  //Handle errors
  catch (error) {
    throw imports.format.error(error)
  }
}
