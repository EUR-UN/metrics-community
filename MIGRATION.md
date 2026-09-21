# Migration Guide: Switching to Community Fork

This guide provides step-by-step instructions for switching your existing GitHub Actions workflow from `lowlighter/metrics` to `yuanweize/metrics-community`.

---

## 1. Why Switch?

Due to the lack of recent updates on the upstream repository since December 2023, several changes in the GitHub API and runtime ecosystems have caused workflows to fail:
- **GitHub Events API Payload Changes**: Commits in PushEvents can be sparse or missing, causing `TypeError` crashes in `habits` and `activity` plugins.
- **Projects Classic Sunset**: Deprecation of Projects Classic caused queries and the `Manager`/`Managers` achievements to fail.
- **Lines Plugin Crashes**: Repositories with missing contributor authors or empty section configurations crashed SVG generation.
- **Container Runtime**: Debian and Node runtime deprecations.

`yuanweize/metrics-community` provides backwards-compatible bug fixes and stability enhancements while keeping all 50+ plugins intact.

---

## 2. Quick Migration (GitHub Actions)

In your `.github/workflows/metrics.yml`, update the `uses:` line:

### Before:
```yaml
- name: Generate metrics
  uses: lowlighter/metrics@latest
  with:
    token: ${{ secrets.METRICS_TOKEN }}
    # ... your existing parameters
```

### After (Recommended: Maintained Stable Branch):
```yaml
- name: Generate metrics
  uses: yuanweize/metrics-community@main
  with:
    token: ${{ secrets.METRICS_TOKEN }}
    # ... your existing parameters unchanged!
```

### Or Pin to a Release Tag:
```yaml
- name: Generate metrics
  uses: yuanweize/metrics-community@v3.35.0-community.1
  with:
    token: ${{ secrets.METRICS_TOKEN }}
```

---

## 3. Configuration & Compatibility

All inputs, parameters, and plugins remain **100% compatible** with upstream configurations:
- No changes to your YAML input names or values are required.
- If you were using `docker` container hot-patches (such as `sed` replacements or custom Dockerfiles) to bypass upstream bugs, you can safely remove them.

---

## 4. Reporting Issues

If you encounter an issue on `yuanweize/metrics-community`, please open a report at:
👉 [https://github.com/yuanweize/metrics-community/issues](https://github.com/yuanweize/metrics-community/issues)
