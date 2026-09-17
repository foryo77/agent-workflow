import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sync } from '../bin/agent-workflow.mjs';

async function withProject(action) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-test-'));
  try {
    await action(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

test('sync installs all agent formats and is repeatable', async () => {
  await withProject(async (project) => {
    assert.equal(await sync(project), 7);

    const agents = await readFile(path.join(project, 'AGENTS.md'), 'utf8');
    const claude = await readFile(path.join(project, 'CLAUDE.md'), 'utf8');
    assert.equal(agents, claude);
    assert.match(agents, /agent-workflow:start/);

    const codexSkill = await readFile(
      path.join(project, '.agents/skills/workflow-retro/SKILL.md'), 'utf8',
    );
    const claudeSkill = await readFile(
      path.join(project, '.claude/skills/workflow-retro/SKILL.md'), 'utf8',
    );
    assert.equal(codexSkill, claudeSkill);

    assert.equal(await sync(project), 0);
  });
});

test('sync preserves project guidance outside the managed block', async () => {
  await withProject(async (project) => {
    const file = path.join(project, 'AGENTS.md');
    await writeFile(file, '# Project rules\r\n\r\n- Use pnpm.\r\n', 'utf8');
    assert.equal(await sync(project), 7);
    const first = await readFile(file, 'utf8');
    assert.match(first, /- Use pnpm\./);
    assert.equal(first.replaceAll('\r\n', '').includes('\n'), false);

    await writeFile(file, `${first}\r\n- Keep this local rule.\r\n`, 'utf8');
    assert.equal(await sync(project), 0);
    const second = await readFile(file, 'utf8');
    assert.match(second, /- Keep this local rule\./);
    assert.equal(second.match(/agent-workflow:start/g)?.length, 1);
  });
});

test('sync stops before writing when a copied skill has local changes', async () => {
  await withProject(async (project) => {
    assert.equal(await sync(project), 7);
    const skill = path.join(project, '.agents/skills/workflow-retro/SKILL.md');
    await writeFile(skill, 'local replacement\n', 'utf8');
    const agents = path.join(project, 'AGENTS.md');
    const original = await readFile(agents);
    await assert.rejects(sync(project), /已在本包之外被修改/);
    assert.deepEqual(await readFile(agents), original);
    assert.equal(await readFile(skill, 'utf8'), 'local replacement\n');
  });
});

test('dry run writes nothing and invalid encoding is rejected', async () => {
  await withProject(async (project) => {
    assert.equal(await sync(project, true), 7);
    await assert.rejects(readFile(path.join(project, 'AGENTS.md')));

    const file = path.join(project, 'AGENTS.md');
    const original = Buffer.from([0xff, 0xfe, 0x41, 0x00]);
    await writeFile(file, original);
    await assert.rejects(sync(project), /不是 UTF-8 编码/);
    assert.deepEqual(await readFile(file), original);
    await assert.rejects(readFile(path.join(project, 'CLAUDE.md')));
  });
});

test('sync preserves a UTF-8 BOM in an existing guidance file', async () => {
  await withProject(async (project) => {
    const file = path.join(project, 'AGENTS.md');
    await writeFile(file, Buffer.from('\ufeff# Project rules\n', 'utf8'));
    assert.equal(await sync(project), 7);
    const updated = await readFile(file);
    assert.deepEqual(updated.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
    assert.match(updated.toString('utf8'), /# Project rules/);
  });
});

test('tool selection installs only the selected agent files', async () => {
  const cases = [
    ['codex', 'AGENTS.md', '.agents/skills/workflow-retro/SKILL.md'],
    ['claude', 'CLAUDE.md', '.claude/skills/workflow-retro/SKILL.md'],
    ['trae', '.trae/rules/agent-workflow.md', '.trae/skills/workflow-retro/SKILL.md'],
  ];
  for (const [tool, guidance, skill] of cases) {
    await withProject(async (project) => {
      assert.equal(await sync(project, false, tool), 3);
      const rule = await readFile(path.join(project, guidance), 'utf8');
      assert.match(rule, /协作约定/);
      assert.match(rule, /所有提示词、计划、进度和结果说明统一使用中文/);
      if (tool === 'trae') assert.match(rule, /^---\nalwaysApply: true\n---/);
      await readFile(path.join(project, skill));
      for (const [, otherGuidance] of cases.filter(([name]) => name !== tool)) {
        await assert.rejects(readFile(path.join(project, otherGuidance)));
      }
    });
  }
});

test('incremental tool sync retains the manifest for earlier tools', async () => {
  await withProject(async (project) => {
    assert.equal(await sync(project, false, 'codex'), 3);
    assert.equal(await sync(project, false, 'claude'), 3);
    assert.equal(await sync(project, false, 'trae'), 3);
    assert.equal(await sync(project), 0);
    const manifest = JSON.parse(await readFile(
      path.join(project, '.agent-workflow/manifest.json'), 'utf8',
    ));
    assert.equal(Object.keys(manifest.files).length, 4);
  });
});

test('Trae rule changes are protected from overwrite', async () => {
  await withProject(async (project) => {
    assert.equal(await sync(project, false, 'trae'), 3);
    const rule = path.join(project, '.trae/rules/agent-workflow.md');
    await writeFile(rule, 'local Trae rule\n', 'utf8');
    await assert.rejects(sync(project, false, 'trae'), /已在本包之外被修改/);
    assert.equal(await readFile(rule, 'utf8'), 'local Trae rule\n');
  });
});
