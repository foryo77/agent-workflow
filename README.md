# Agent Workflow 中文工作流

为 Codex、Claude Code 和 Trae 统一分发中文协作规则与可复用技能。通过 npm 包 `@tanlifei/agent-workflow` 安装，再执行 `sync`，将模板写入各工具读取的项目目录。

当前包含通用编码协作约定，以及用于任务复盘的 `workflow-retro` 技能。运行环境要求 **Node.js 20 或更高版本**，并安装 npm。

## 快速开始

先进入**需要使用工作流的项目根目录**。下面以 Codex 为例，安装后预览并同步：

```powershell
npm install --save-dev @tanlifei/agent-workflow --registry=https://registry.npmjs.org/
npx agent-workflow sync --tool codex --dry-run
npx agent-workflow sync --tool codex
```

安装包本身只会把文件放进 `node_modules`；需要执行 `sync` 才会写入规则和技能。`--dry-run` 只列出待修改的文件，不写入内容。

## 选择使用的工具

安装后，按工具选择同步命令：

| 工具                    | 同步命令                                | 写入的项目文件                                   |
| ----------------------- | --------------------------------------- | ------------------------------------------------ |
| Codex                   | `npx agent-workflow sync --tool codex`  | `AGENTS.md`、`.agents/skills/`                   |
| Claude Code             | `npx agent-workflow sync --tool claude` | `CLAUDE.md`、`.claude/skills/`                   |
| Trae IDE / TraeCode CLI | `npx agent-workflow sync --tool trae`   | `.trae/rules/agent-workflow.md`、`.trae/skills/` |
| 三者都用                | `npx agent-workflow sync --tool all`    | 以上全部                                         |

想先预览写入内容，在任一命令末尾加 `--dry-run`。Trae 的专用规则设为始终生效；若同时同步 `all`，并在 Trae 设置中开启了导入 `AGENTS.md` 或 `CLAUDE.md`，相同规则可能重复加载，可以关闭那两个导入开关。[Codex 技能位置](https://learn.chatgpt.com/docs/build-skills)、[Claude Code 技能位置](https://code.claude.com/docs/en/skills)、[Trae 规则](https://docs.trae.cn/ide_rules)和[Trae 技能](https://docs.trae.cn/ide_skills)均以各自官方文档为准。

省略 `--tool` 时默认同步全部工具；`npx agent-workflow --help` 可以查看命令用法。

## 不安装依赖，直接同步

也可以不安装为开发依赖，直接用一条命令下载并同步指定版本。执行前先进入**需要使用工作流的项目根目录**，不要在本包的源码目录 `D:\aaa-yyl-project\agent-workflow` 运行；源码目录与要执行的包同名同版本时，`npx` 可能找不到 `agent-workflow` 命令。以下四条任选其一：

```powershell
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool codex
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool claude
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool trae
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool all
```

这种方式不会将包加入项目的 `package.json`。长期维护的项目建议安装为开发依赖，并将同步后的规则、技能和 `.agent-workflow/manifest.json` 提交到项目仓库，保证其他人拿到相同的配置。[npm exec 文档](https://docs.npmjs.com/cli/npm-exec/)说明了本地和远程包的执行方式。

## 更新已接入的项目

先更新依赖，再重新同步。以 Codex 为例：

```powershell
npm install --save-dev @tanlifei/agent-workflow@latest --registry=https://registry.npmjs.org/
npx agent-workflow sync --tool codex --dry-run
npx agent-workflow sync --tool codex
```

同步会保留 `AGENTS.md`、`CLAUDE.md` 中托管区块以外的内容；区块内由模板维护。其他托管文件的上次同步散列保存在 `.agent-workflow/manifest.json`；若使用方改动了这些文件，同步会报冲突并停止，不覆盖本地修改。

遇到冲突时，先保存本地修改，再对照包中模板决定如何处理，不要通过删除清单跳过冲突检查。当前模板不会自动删除已从包中移除的旧技能，需要在使用项目中手动清理；文件写入中途失败时，也尚不支持自动恢复。

## 本地开发与验证

在本包源码目录维护 `templates/guidance.md` 和 `templates/skills/`。同步逻辑位于 `bin/agent-workflow.mjs`。项目没有第三方依赖，可以直接运行：

```powershell
npm test
npm run pack:check
```

`npm test` 包含同步行为测试和安装验证。安装验证会实际执行 `npm pack`，在带空格和中文路径的临时项目中离线安装生成的压缩包，再通过安装后的 `agent-workflow` 命令检查：

- 发布包包含命令入口和全部技能模板，不包含测试、CI 或项目本地配置。
- `codex`、`claude`、`trae` 和 `all` 四种同步方式正常工作。
- 帮助命令、预览不写入、工具选择和重复同步行为正确。
- 清单记录的版本与安装的版本一致。

测试结束会清理临时目录，不会发布到 npm。只运行安装验证时使用 `npm run test:install`。测试需要允许启动本地子进程；若受限环境出现 `spawn EPERM`，应在允许执行子进程的环境中运行。

GitHub Actions 在推送和 Pull Request 时运行相同的验证，覆盖 Windows、Linux，以及 Node.js `20.0.0`、`20.x`、`22.x`、`24.x`、`26.x`。`20.0.0` 用于验证声明的最低版本兼容性，日常开发请使用仍受官方支持的 Node.js 版本。

## 维护者发布流程

这个模板可以在私有源码仓库中维护，通过公开 npm 包分发给不同项目。首次发布前请确认当前 npm 账号拥有 `tanlifei` scope。公开发布后，包内所有文件都可被任何人下载，不能放密钥、内部架构或不愿公开的个人资料。

首次发布前，先登录 [npm 网站](https://www.npmjs.com/)，进入头像菜单的 **Account → Two-Factor Authentication → Enable 2FA**，按页面提示设置验证方式并妥善保存恢复码。npm 要求发布包时启用账号 2FA，或使用允许绕过 2FA 的细粒度访问令牌；本地手动发布建议使用账号 2FA。详见 [npm 的 2FA 配置说明](https://docs.npmjs.com/configuring-two-factor-authentication/)和[发布要求](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)。

在 PowerShell 中进入本项目，按顺序操作：

```powershell
cd D:\aaa-yyl-project\agent-workflow
npm config get registry
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm test
npm run pack:check
npm publish --access public --registry=https://registry.npmjs.org/
```

如果 `npm config get registry` 显示 `https://registry.npmmirror.com/`，普通的 `npm login` 会进入 CNPM 页面；该页面不开放公开注册。请在 [npm 官方网站注册账号](https://www.npmjs.com/signup)，登录和发布时使用上面的官方 registry 命令。这里不会修改全局镜像设置；`package.json` 的 `publishConfig.registry` 也固定为 npm 官方地址，避免从本项目误发到镜像。

发布前检查 `templates/guidance.md` 和 `templates/skills/` 没有不应公开的内容。`npm run pack:check` 会列出实际上传文件；确认清单后才运行 `npm publish`。发布过程中按提示完成 2FA 验证，不要把验证码或恢复码写进命令、项目文件或聊天消息。如果此前收到 `E403` 和 “Two-factor authentication … is required” 错误，启用 2FA 后重新运行发布命令即可。发布后用 `npm view @tanlifei/agent-workflow version --registry=https://registry.npmjs.org/` 检查注册表版本。详见 [npm 的公开 scoped 包发布说明](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)。

后续修改模板或同步逻辑时，提升 `package.json` 的版本号（例如从 `0.1.1` 改为 `0.1.2`），运行上述测试与打包检查，再发布新版本。同一包名和版本号不能重复发布。示例 `workflow-retro` 技能用于从完成的任务中提炼下一版值得加入的规则。
