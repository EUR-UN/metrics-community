# Security Policy

## Supported Versions

| Version | Supported | Notes |
| :--- | :--- | :--- |
| `main` / `v3.35.x-community` | :white_check_mark: | Actively maintained community fork |
| `< v3.34` | :x: | Upstream legacy versions |

---

## Reporting a Vulnerability

The maintainers of `yuanweize/metrics-community` take the security of workflows and automated tokens seriously.

If you believe you have discovered a vulnerability:
1. Please report it privately through GitHub Security Advisory:  
   👉 [New Security Advisory](https://github.com/yuanweize/metrics-community/security/advisories/new)
2. Include reproduction steps, sample configuration, and the affected plugin/component.
3. Please allow maintainers reasonable time to verify and mitigate the issue before public disclosure.

---

## Token & Permission Security

- Always grant the minimal required permissions to your `GITHUB_TOKEN` or Personal Access Token (PAT).
- Avoid granting write or admin access to repository contents unless explicitly required by a specific plugin.
- Secrets and tokens passed to plugins are handled in memory and never logged in action outputs.
