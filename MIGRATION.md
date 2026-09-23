# 🚀 Migration Guide: Switching to Community Fork

本指南提供将你的 GitHub Actions 工作流从官方已停止维护的 `lowlighter/metrics` 迁移至 `EUR-UN/metrics-community` 的简易步骤。

---

## 1. 为什么迁移？(Why Switch?)

由于官方上游自 2023 年底停滞维护，GitHub API、Node 运行时和 Docker 基础环境的变化导致大量 Action 出现红叉报错：
- **GitHub Events API 变更**：PushEvents 格式更新导致 `habits` 和 `activity` 插件抛出 `TypeError` 崩溃。
- **Projects Classic 下线**：旧版 Projects 接口废弃导致项目与成就卡片报错。
- **Lines 插件崩溃**：包含匿名/已注销作者（`author: null`）或空 section 配置的仓库会导致 SVG 渲染崩溃。
- **Steam 插件游玩状态不准**：缺乏时间窗口，数月前游玩的游戏永久挂在 Recently played 甚至无法正确抓取 F2P 免费游戏。
- **构建环境与安全警告**：旧版 Docker 镜像环境过旧，缺少多架构支持。

`EUR-UN/metrics-community` 提供经过同行评审的修复与持续维护，保持原有参数语法兼容。

---

## 2. 极简迁移步骤 (Quick Migration)

打开你的个人 Profile 仓库工作流文件（通常是 `.github/workflows/metrics.yml`），修改 `uses:` 指向：

### 方案 A：锁定稳定版本 Tag（推荐，最稳定）
在生产工作流中锁定经过特定验证的版本：

```yaml
- name: Generate metrics
  uses: EUR-UN/metrics-community@v3.35.0-community.2  # 👈 锁定稳定验证版本
  with:
    token: ${{ secrets.METRICS_TOKEN }}
    # ... 其余参数与插件配置保持原样
```

### 方案 B：跟随最新维护代码（适合测试）
如果希望动态跟进最新维护分支：

```yaml
- name: Generate metrics
  uses: EUR-UN/metrics-community@main
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
