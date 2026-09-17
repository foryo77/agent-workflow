import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadSkillTemplates } from '../test-support/skill-templates.mjs';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const skillTemplates = await loadSkillTemplates();
const formats = {
  codex: ['AGENTS.md', '.agents/skills'],
  claude: ['CLAUDE.md', '.claude/skills'],
  trae: ['.trae/rules/agent-workflow.md', '.trae/skills'],
};

test('打包产物安装后可以通过命令行同步所有工具', { timeout: 180_000 }, async (t) => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, '请通过 npm test 或 npm run test:install 运行安装验证。');

  const tempRoot = await realpath(os.tmpdir());
  const workspace = await mkdtemp(path.join(tempRoot, 'agent-workflow-install-'));
  t.after(async () => {
    assert.equal(path.dirname(workspace), tempRoot);
    assert.ok(path.basename(workspace).startsWith('agent-workflow-install-'));
    await rm(workspace, { recursive: true, force: true });
  });

  async function npm(args, cwd) {
    try {
      const result = await execFileAsync(process.execPath, [npmCli, ...args], {
        cwd,
        windowsHide: true,
        timeout: 30_000,
        env: {
          ...process.env,
          npm_config_cache: path.join(workspace, 'npm-cache'),
          npm_config_offline: 'true',
          npm_config_update_notifier: 'false',
        },
      });
      return result.stdout;
    } catch (error) {
      throw new Error(`npm ${args[0]} 失败：${error.stderr || error.message}`, { cause: error });
    }
  }

  const [packed] = JSON.parse(await npm([
    'pack', '--json', '--ignore-scripts', '--pack-destination', workspace,
  ], packageRoot));
  const included = packed.files.map((file) => file.path);
  for (const required of [
    'package.json', 'README.md', 'bin/agent-workflow.mjs',
    'templates/guidance.md',
    ...Array.from(skillTemplates.keys(), (file) => `templates/skills/${file}`),
  ]) {
    assert.ok(included.includes(required), `打包产物缺少 ${required}`);
  }
  assert.ok(included.every((file) =>
    file === 'package.json' || file === 'README.md' ||
    file.startsWith('bin/') || file.startsWith('templates/')),
  '打包产物不应包含测试、CI 或项目本地配置。');

  const packageInfo = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  for (const tool of [...Object.keys(formats), 'all']) {
    await t.test(`安装后同步 ${tool}`, async () => {
      const project = path.join(workspace, `使用项目 ${tool}`);
      await mkdir(project);
      await writeFile(path.join(project, 'package.json'), JSON.stringify({
        name: `workflow-consumer-${tool}`, version: '1.0.0', private: true,
      }), 'utf8');
      await npm([
        'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund',
        '--package-lock=false', '--engine-strict', path.join(workspace, packed.filename),
      ], project);

      const installed = JSON.parse(await readFile(
        path.join(project, 'node_modules/@tanlifei/agent-workflow/package.json'), 'utf8',
      ));
      assert.equal(installed.version, packageInfo.version);
      assert.match(await npm(['exec', '--', 'agent-workflow', '--help'], project), /用法：/);

      const command = ['exec', '--', 'agent-workflow', 'sync', '--tool', tool];
      const before = (await readdir(project)).sort();
      assert.match(await npm([...command, '--dry-run'], project), /预览完成：/);
      assert.deepEqual((await readdir(project)).sort(), before);

      const selected = tool === 'all' ? Object.keys(formats) : [tool];
      assert.match(await npm(command, project), /同步完成：/);
      for (const [name, [guidance, skillsDirectory]] of Object.entries(formats)) {
        if (selected.includes(name)) {
          const rule = await readFile(path.join(project, guidance), 'utf8');
          assert.match(rule, /协作约定/);
          assert.match(rule, /统一使用中文/);
          if (name === 'trae') assert.match(rule, /^---\nalwaysApply: true\n---/);
          else assert.match(rule, /<!-- agent-workflow:start -->/);
          for (const [file, content] of skillTemplates) {
            assert.deepEqual(await readFile(path.join(project, skillsDirectory, file)), content);
          }
        } else {
          for (const file of [
            guidance, ...Array.from(skillTemplates.keys(), (file) => path.join(skillsDirectory, file)),
          ]) {
            await assert.rejects(readFile(path.join(project, file)), { code: 'ENOENT' });
          }
        }
      }

      const manifestFile = path.join(project, '.agent-workflow/manifest.json');
      const manifestBefore = await readFile(manifestFile);
      assert.equal(JSON.parse(manifestBefore.toString('utf8')).packageVersion, packageInfo.version);
      assert.match(await npm(command, project), /同步完成：0 个文件已修改。/);
      assert.deepEqual(await readFile(manifestFile), manifestBefore);
    });
  }
});
