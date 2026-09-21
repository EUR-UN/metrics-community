# Upstream v4 & v4-dev Assessment Report

> **Document Version**: 1.0.0  
> **Date**: 2026-09-21  
> **Author**: `yuanweize/metrics-community` Maintainers  
> **Target Upstream Branches**: `upstream/v4`, `upstream/v4-dev` (Commit baseline: `366f8b9d` / umbrella issue lowlighter/metrics#1573)

---

## 1. Executive Summary

During the audit of `lowlighter/metrics`, the upstream branches `v4` and `v4-dev` were analyzed to determine whether the community fork should adopt v4 as its primary base or maintain the existing v3 architecture.

**Key Finding**:  
Upstream `v4-dev` is a **radical, incomplete prototype rewrite from Node.js to Deno**. It is **not production-ready** and would result in an immediate breakage for >85% of users. The independent community fork (`yuanweize/metrics-community`) will maintain and stabilize the proven **v3 architecture (Node.js LTS)** for production releases while keeping v4 tracked as an experimental research topic.

---

## 2. Architectural Analysis: v3 vs. v4-dev

| Dimension | v3 (Current Stable / Community Maintained) | v4-dev (Upstream Prototype) |
| :--- | :--- | :--- |
| **Runtime Environment** | Node.js (v20, v22, v24 LTS supported) | Deno (`deno.jsonc`, `deno.lock`) |
| **Language** | JavaScript (ESM + CommonJS interop) | TypeScript (`.ts`) |
| **Package Management** | `npm` / `package.json` | Deno URL imports / `deno.jsonc` |
| **Container Base** | `node:22-bookworm-slim` | Custom Deno container |
| **Web Service Engine** | Express.js (`source/app/web`) | None / Incomplete |
| **Action Contract** | Proven composite action with prebuilt container | Untested Deno CLI wrapper |
| **Plugin Count** | **52 plugins** fully implemented | **Only 7 plugins** partially ported |

---

## 3. Plugin Coverage Deficit

In `upstream/v4-dev`, only 7 plugins were ported:
- `activity`
- `calendar`
- `gists`
- `introduction`
- `lines`
- `rss`
- `webscraping`

**Over 45 core and community plugins are completely absent in v4-dev**, including:
- `achievements`
- `languages` (including Linguist analysis)
- `habits`
- `wakatime`
- `isocalendar`
- `projects`
- `topics`
- `repositories`
- `notable`
- `followup`
- `stars`
- `stackoverflow`
- `music`
- All community plugins (crypto, leetcode, etc.)

---

## 4. Stability & Ecosystem Risks

1. **Mass Feature Regression**: Switching to `v4-dev` would immediately break configurations for millions of workflow runs relying on `languages`, `achievements`, `habits`, or `wakatime`.
2. **Deno Ecosystem Incompatibilities**: Native libraries like `sharp` (libvips), `linguist-js`, and `licensed` (Ruby gem) have complex bindings under Node.js that are partially unsupported or cumbersome under Deno.
3. **Incomplete Web App**: The web app generator (`metrics.lecoq.io` or self-hosted web instance) has no working counterpart in `v4-dev`.

---

## 5. Decision & Fork Strategy

1. **Production Fork Track (v3 Line)**:
   - Primary branch: `main` (tracking cleaned `upstream/master`).
   - Runtime: Node.js 22 LTS / Bookworm slim with multi-arch Docker support.
   - Versioning: `v3.35.0-community.1` (no hijacking of the `v4` semantic version).
2. **Experimental Track (v4 Line)**:
   - Upstream `v4` and `v4-dev` branches will be mirrored as reference branches in `yuanweize/metrics-community` without polluting `main`.
   - If a community effort emerges to complete the Deno port, it will be developed in an isolated `next` or `v4-experimental` branch.
