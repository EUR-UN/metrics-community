# 🚀 Migration Guide: Switching to Community Fork

本指南提供将你的 GitHub Actions 工作流从官方已停止维护的 `lowlighter/metrics` 迁移至 `yuanweize/metrics-community` 的简易步骤。

---

## 1. 为什么迁移？(Why Switch?)

由于官方上游自 2023 年底停滞维护，GitHub API、Node 运行时和 Docker 基础环境的变化导致大量 Action 出现红叉报错：
- **GitHub Events API 变更**：PushEvents 格式更新导致 `habits` 和 `activity` 插件抛出 `TypeError` 崩溃。
- **Projects Classic 下线**：旧版 Projects 接口废弃导致项目与成就卡片报错。
- **Lines 插件崩溃**：包含匿名/已注销作者（`author: null`）或空 section 配置的仓库会导致 SVG 渲染崩溃。
- **Steam 插件游玩状态不准**：缺乏时间窗口，数月前游玩的游戏永久挂在 Recently played 甚至无法正确抓取 F2P 免费游戏。
- **构建环境与安全警告**：旧版 Docker 镜像环境过旧，缺少多架构支持。

`yuanweize/metrics-community` 提供**完全向后兼容**的修复与持续维护，所有 50+ 个插件与 300+ 个配置项 100% 保持原有语法！

---

## 2. 极简迁移步骤 (Quick Migration)

打开你的个人 Profile 仓库工作流文件（通常是 `.github/workflows/metrics.yml`），只需修改 `uses:` 这一行：

### 方案 A：直接跟随最新代码（推荐，最省心）
直接使用 `@latest` 标签，永远自动享受最新功能、Bug 修复与上游同步，无需日后频繁改动配置。我们配置了 GHCR 预编译容器流水线，**依然只需 ~1 分钟秒级完成渲染**！

```yaml
- name: Generate metrics
  uses: yuanweize/metrics-community@latest   # 👈 直接指向最新版
  with:
    token: ${{ secrets.METRICS_TOKEN }}
    # ... 其余所有已有配置和插件完全不需要动！
```

### 方案 B：锁定稳定版本 Tag（适合追求严格版本固定的用户）
如果你希望锁定在经过特定验证的版本：

```yaml
- name: Generate metrics
  uses: yuanweize/metrics-community@v3.35.0-community.2
  with:
    token: ${{ secrets.METRICS_TOKEN }}
```

---

## 3. 清理旧版 Hack 补丁

如果你之前为了绕过官方 Bug，在工作流中加入了以下临时手段，**现在全部可以安全删除**：
- ❌ 删除 `sed -i` 临时替换源码的命令
- ❌ 删除本地 `docker build` 临时热修复步骤
- ❌ 删除过长的 retry 或 timeout 临时妥协

社区版已在底层原生修复上述问题，工作流恢复清爽原生语法。

---

## 4. 常见问题 (FAQ)

### Q: `@latest` 会导致每次运行都在本地慢速编译 Docker 吗？
**不会。** 社区版配置了自动化的 GitHub Container Registry (GHCR) 预编译镜像发布流水线。每当 `main` 分支合并或发布新代码，GHCR 都会自动推送多架构的 `:latest` 镜像，Action 运行时直接拉取预编译镜像，通常 1 分钟左右即可完成。

### Q: 遇到问题如何反馈？
欢迎前往社区仓库提交 Issue 或 PR：  
👉 [https://github.com/yuanweize/metrics-community/issues](https://github.com/yuanweize/metrics-community/issues)
