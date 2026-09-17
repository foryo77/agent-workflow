import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsRoot = fileURLToPath(new URL('../templates/skills/', import.meta.url));

export async function loadSkillTemplates() {
  const files = new Map();
  async function collect(relative) {
    const entries = await readdir(path.join(skillsRoot, relative), { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile()) {
        files.set(child.replaceAll('\\', '/'), await readFile(path.join(skillsRoot, child)));
      } else throw new Error(`不支持的技能模板条目：${child}`);
    }
  }
  await collect('');
  return files;
}
