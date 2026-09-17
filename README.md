# Agent Workflow 中文工作流

这个模板可以在私有源码仓库中维护，通过公开 npm 包分发给不同项目。包名为 `@tanlifei/agent-workflow`，首次发布前请确认当前 npm 账号拥有 `tanlifei` scope。公开发布后，包内所有文件都可被任何人下载，不能放密钥、内部架构或不愿公开的个人资料。

## 首次发布到 npm

首次发布前，先登录 [npm 网站](https://www.npmjs.com/)，进入头像菜单的 **Account → Two-Factor Authentication → Enable 2FA**，按页面提示设置验证方式并妥善保存恢复码。npm 要求发布包时启用账号 2FA，或使用允许绕过 2FA 的细粒度访问令牌；本地手动发布建议使用账号 2FA。详见 [npm 的 2FA 配置说明](https://docs.npmjs.com/configuring-two-factor-authentication/)和[发布要求](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)。

然后在 PowerShell 中进入本项目，按顺序操作：

```powershell
cd D:\aaa-yyl-project\agent-workflow
npm config get registry
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm test
npm pack --dry-run
npm publish --access public --registry=https://registry.npmjs.org/
```

如果 `npm config get registry` 显示 `https://registry.npmmirror.com/`，普通的 `npm login` 会进入 CNPM 页面；该页面不开放公开注册。请在 [npm 官方网站注册账号](https://www.npmjs.com/signup)，登录和发布时使用上面的官方 registry 命令。这里不会修改全局镜像设置；`package.json` 的 `publishConfig.registry` 也固定为 npm 官方地址，避免从本项目误发到镜像。

发布前检查 `templates/guidance.md` 和 `templates/skills/` 没有不应公开的内容。`npm pack --dry-run` 会列出实际上传文件；确认清单后才运行 `npm publish`。发布过程中按提示完成 2FA 验证，不要把验证码或恢复码写进命令、项目文件或聊天消息。如果此前收到 `E403` 和 “Two-factor authentication … is required” 错误，启用 2FA 后重新运行发布命令即可。发布后用 `npm view @tanlifei/agent-workflow version --registry=https://registry.npmjs.org/` 检查注册表版本。详见 [npm 的公开 scoped 包发布说明](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)。

## 下载到开发项目

先进入**需要使用工作流的项目根目录**，安装一次包：

```powershell
npm install --save-dev @tanlifei/agent-workflow --registry=https://registry.npmjs.org/
```

再按工具选择同步命令。安装包本身只会把文件放进 `node_modules`；agent 不会自动从那里读取规则和技能，所以需要执行 `sync`：

| 工具                    | 同步命令                                | 写入的项目文件                                   |
| ----------------------- | --------------------------------------- | ------------------------------------------------ |
| Codex                   | `npx agent-workflow sync --tool codex`  | `AGENTS.md`、`.agents/skills/`                   |
| Claude Code             | `npx agent-workflow sync --tool claude` | `CLAUDE.md`、`.claude/skills/`                   |
| Trae IDE / TraeCode CLI | `npx agent-workflow sync --tool trae`   | `.trae/rules/agent-workflow.md`、`.trae/skills/` |
| 三者都用                | `npx agent-workflow sync --tool all`    | 以上全部                                         |

想先预览写入内容，在任一命令末尾加 `--dry-run`。Trae 的专用规则设为始终生效；若同时同步 `all`，并在 Trae 设置中开启了导入 `AGENTS.md` 或 `CLAUDE.md`，相同规则可能重复加载，可以关闭那两个导入开关。[Codex 技能位置](https://learn.chatgpt.com/docs/build-skills)、[Claude Code 技能位置](https://code.claude.com/docs/en/skills)、[Trae 规则](https://docs.trae.cn/ide_rules)和[Trae 技能](https://docs.trae.cn/ide_skills)均以各自官方文档为准。

也可以不安装为开发依赖，直接用一条命令下载并同步指定版本。执行前先进入**需要使用工作流的项目根目录**，不要在本包的源码目录 `D:\aaa-yyl-project\agent-workflow` 运行；源码目录与要执行的包同名同版本时，`npx` 可能找不到 `agent-workflow` 命令。以下四条任选其一：

```powershell
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool codex
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool claude
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool trae
npx --yes --registry=https://registry.npmjs.org/ @tanlifei/agent-workflow@0.1.1 sync --tool all
```

这种方式不会将包加入项目的 `package.json`。长期维护的项目建议安装为开发依赖，并将同步后的规则、技能和 `.agent-workflow/manifest.json` 提交到项目仓库，保证其他人拿到相同的配置。[npm exec 文档](https://docs.npmjs.com/cli/npm-exec/)说明了本地和远程包的执行方式。

## 更新工作流

在本项目中修改 `templates/guidance.md` 或 `templates/skills/`，运行 `npm test` 和 `npm pack --dry-run`，然后提升 `package.json` 的版本号（例如从 `0.1.1` 改为 `0.1.2`），再次运行 `npm publish --access public --registry=https://registry.npmjs.org/`。同一包名和版本号不能重复发布。使用方运行 `npm install --save-dev @tanlifei/agent-workflow@latest --registry=https://registry.npmjs.org/`，再执行对应工具的 `sync` 命令。

同步会保留 `AGENTS.md`、`CLAUDE.md` 中托管区块以外的内容。其他托管文件的上次同步散列保存在 `.agent-workflow/manifest.json`；若使用方改动了这些文件，同步会报冲突并停止，不覆盖本地修改。当前模板不会自动删除已从包中移除的旧技能，需要在使用项目中手动清理。示例 `workflow-retro` 技能用于从完成的任务中提炼下一版值得加入的规则。
