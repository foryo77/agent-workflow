#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const startMarker = '<!-- agent-workflow:start -->';
const endMarker = '<!-- agent-workflow:end -->';
const decoder = new TextDecoder('utf-8', { fatal: true });
const tools = {
  codex: { guidance: 'AGENTS.md', skills: '.agents/skills' },
  claude: { guidance: 'CLAUDE.md', skills: '.claude/skills' },
  trae: { guidance: '.trae/rules/agent-workflow.md', skills: '.trae/skills' },
};

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readOptional(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function decodeUtf8(bytes, file) {
  try {
    const text = decoder.decode(bytes);
    const hasBom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
    return hasBom ? `\ufeff${text}` : text;
  } catch {
    throw new Error(`${file} 不是 UTF-8 编码；请先明确转换编码再执行同步。`);
  }
}

function managedRoot(existing, guidance, file) {
  const text = existing === null ? '' : decodeUtf8(existing, file);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const body = guidance.trim().replace(/\r\n?/g, '\n').replace(/\n/g, newline);
  const block = `${startMarker}${newline}${body}${newline}${endMarker}`;
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 && end === -1) {
    if (!text) return Buffer.from(`${block}${newline}`, 'utf8');
    const separator = text.endsWith('\n') ? newline : `${newline}${newline}`;
    return Buffer.from(`${text}${separator}${block}${newline}`, 'utf8');
  }

  if (
    start === -1 || end === -1 || end < start ||
    text.indexOf(startMarker, start + startMarker.length) !== -1 ||
    text.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new Error(`${file} 中的 agent-workflow 托管标记格式有误；未修改任何文件。`);
  }

  return Buffer.from(
    `${text.slice(0, start)}${block}${text.slice(end + endMarker.length)}`,
    'utf8',
  );
}

async function listFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`不支持的模板条目：${child}`);
  }
  return files;
}

async function loadManifest(file) {
  const bytes = await readOptional(file);
  if (bytes === null) return { schemaVersion: 1, files: {} };
  let value;
  try {
    value = JSON.parse(decodeUtf8(bytes, file));
  } catch {
    throw new Error(`${file} 不是有效的 agent-workflow 清单文件。`);
  }
  if (
    value?.schemaVersion !== 1 ||
    !value.files || typeof value.files !== 'object' || Array.isArray(value.files)
  ) {
    throw new Error(`${file} 使用了不受支持的清单格式。`);
  }
  return value;
}

export async function sync(projectRoot, dryRun = false, tool = 'all') {
  if (tool !== 'all' && !Object.hasOwn(tools, tool)) {
    throw new Error(`未知工具：${tool}。请使用 codex、claude、trae 或 all。`);
  }
  const selected = tool === 'all' ? Object.keys(tools) : [tool];
  const templateRoot = path.join(packageRoot, 'templates');
  const guidanceFile = path.join(templateRoot, 'guidance.md');
  const guidance = decodeUtf8(await readFile(guidanceFile), guidanceFile);
  const manifestPath = path.join(projectRoot, '.agent-workflow', 'manifest.json');
  const previous = await loadManifest(manifestPath);
  const nextFiles = { ...previous.files };
  const plans = [];

  for (const toolName of selected) {
    const relative = tools[toolName].guidance;
    const destination = path.join(projectRoot, relative);
    const current = await readOptional(destination);
    const desired = toolName === 'trae'
      ? Buffer.from(`---\nalwaysApply: true\n---\n\n${guidance.trim()}\n`, 'utf8')
      : managedRoot(current, guidance, destination);
    if (toolName === 'trae') {
      const key = relative.replaceAll('\\', '/');
      if (
        current !== null && !current.equals(desired) &&
        previous.files[key] !== digest(current)
      ) {
        throw new Error(`${destination} 已在本包之外被修改；未修改任何文件。`);
      }
      nextFiles[key] = digest(desired);
    }
    plans.push({ destination, current, desired });
  }

  const skillsRoot = path.join(templateRoot, 'skills');
  const skillNames = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const skillName of skillNames) {
    const sourceRoot = path.join(skillsRoot, skillName);
    const files = await listFiles(sourceRoot);
    if (!files.includes('SKILL.md')) {
      throw new Error(`技能 ${skillName} 缺少 SKILL.md。`);
    }
    for (const relative of files) {
      const desired = await readFile(path.join(sourceRoot, relative));
      for (const toolName of selected) {
        const targetRelative = path.join(tools[toolName].skills, skillName, relative);
        const destination = path.join(projectRoot, targetRelative);
        const current = await readOptional(destination);
        const key = targetRelative.replaceAll('\\', '/');
        if (
          current !== null && !current.equals(desired) &&
          previous.files[key] !== digest(current)
        ) {
          throw new Error(`${destination} 已在本包之外被修改；未修改任何文件。`);
        }
        nextFiles[key] = digest(desired);
        plans.push({ destination, current, desired });
      }
    }
  }

  const packageInfo = JSON.parse(
    decodeUtf8(await readFile(path.join(packageRoot, 'package.json')), 'package.json'),
  );
  const manifest = {
    schemaVersion: 1,
    packageVersion: packageInfo.version,
    files: Object.fromEntries(Object.entries(nextFiles).sort(([a], [b]) => a.localeCompare(b))),
  };
  const manifestCurrent = await readOptional(manifestPath);
  const manifestDesired = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  plans.push({ destination: manifestPath, current: manifestCurrent, desired: manifestDesired });

  let changed = 0;
  for (const plan of plans) {
    const relative = path.relative(projectRoot, plan.destination);
    if (plan.current?.equals(plan.desired)) continue;
    changed++;
    console.log(`${dryRun ? '将写入' : '已写入'} ${relative}`);
    if (!dryRun) {
      await mkdir(path.dirname(plan.destination), { recursive: true });
      await writeFile(plan.destination, plan.desired);
    }
  }
  console.log(dryRun
    ? `预览完成：${changed} 个文件待修改。`
    : `同步完成：${changed} 个文件已修改。`);
  return changed;
}

async function main() {
  const args = process.argv.slice(2);
  const usage = '用法：agent-workflow sync [--tool codex|claude|trae|all] [--dry-run]';
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (args[0] !== 'sync') throw new Error(usage);

  let dryRun = false;
  let tool = 'all';
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--tool' && args[i + 1]) {
      tool = args[++i];
    } else {
      throw new Error(usage);
    }
  }
  await sync(process.cwd(), dryRun, tool);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`agent-workflow: ${error.message}`);
    process.exitCode = 1;
  });
}
