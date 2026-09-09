import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

const args = new Set(process.argv.slice(2));
const bestEffort = args.has('--best-effort');
const frontendRoot = process.cwd();
const cacheRoot = join(frontendRoot, '.cache');
const repoDir = join(cacheRoot, 'meshstack-hub');
const outputFile = join(frontendRoot, 'src', 'app', 'hub-catalog.generated.ts');
const repoUrl = 'https://github.com/meshcloud/meshstack-hub.git';
const githubBase = 'https://github.com/meshcloud/meshstack-hub/tree/main';
const rawBase = 'https://raw.githubusercontent.com/meshcloud/meshstack-hub/main';

function runGit(args) {
  execFileSync('git', args, { stdio: 'ignore' });
}

function syncRepo() {
  mkdirSync(cacheRoot, { recursive: true });
  if (!existsSync(join(repoDir, '.git'))) {
    rmSync(repoDir, { recursive: true, force: true });
    runGit(['clone', '--depth', '1', repoUrl, repoDir]);
  } else {
    runGit(['-C', repoDir, 'fetch', '--depth', '1', 'origin', 'main']);
    runGit(['-C', repoDir, 'reset', '--hard', 'origin/main']);
  }
}

function walk(dir, result = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, result);
    else result.push(path);
  }
  return result;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

function parseTerraformBlocks(content, keyword) {
  const blocks = [];
  const start = new RegExp(`${keyword}\\s+"([^"]+)"\\s*\\{`, 'g');
  let match;
  while ((match = start.exec(content))) {
    const name = match[1];
    let i = start.lastIndex;
    let depth = 1;
    let inString = false;
    let escaped = false;
    for (; i < content.length && depth > 0; i++) {
      const ch = content[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const body = content.slice(start.lastIndex, i - 1);
    blocks.push({ name, body });
    start.lastIndex = i;
  }
  return blocks;
}

function terraformType(body) {
  const match = body.match(/(?:^|\n)\s*type\s*=\s*([^\n#]+)/);
  const raw = match?.[1]?.trim() ?? 'string';
  if (/^bool(?:ean)?\b/.test(raw)) return 'boolean';
  if (/^number\b/.test(raw)) return 'number';
  if (/^(?:list|set|map|object|tuple)\s*\(/.test(raw)) return 'object';
  return 'string';
}

function terraformDescription(body) {
  const match = body.match(/(?:^|\n)\s*description\s*=\s*("(?:\\.|[^"\\])*")/);
  return match ? unquote(match[1]) : undefined;
}

function titleCase(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function readFirstExisting(paths) {
  for (const path of paths) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return '';
}

function descriptionFromReadme(readme) {
  const lines = readme.split(/\r?\n/).map(line => line.trim());
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('![') || line.startsWith('<')) continue;
    return line.replace(/^>\s*/, '').slice(0, 240);
  }
  return '';
}

function findLogo(buildingBlockDir, moduleDir) {
  const files = [...walk(buildingBlockDir), ...walk(moduleDir)]
    .filter(path => /(?:logo|icon)\.(?:png|svg|jpg|jpeg|webp)$/i.test(basename(path)));
  return files[0];
}

function generateCatalog() {
  const modulesDir = join(repoDir, 'modules');
  if (!existsSync(modulesDir)) throw new Error('meshstack-hub modules directory not found');

  const allFiles = walk(modulesDir);
  const buildingBlockDirs = [...new Set(
    allFiles
      .filter(path => basename(path) === 'variables.tf' && dirname(path).split(sep).includes('buildingblock'))
      .map(path => dirname(path))
  )];

  const items = buildingBlockDirs.map(buildingBlockDir => {
    const moduleDir = dirname(buildingBlockDir);
    const relModule = relative(repoDir, moduleDir).split(sep).join('/');
    const relBuildingBlock = relative(repoDir, buildingBlockDir).split(sep).join('/');
    const parts = relModule.split('/');
    const platform = parts[1] ? titleCase(parts[1]) : 'meshStack Hub';
    const moduleName = basename(moduleDir);
    const id = parts.slice(1).join('-').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    const variables = readFirstExisting([join(buildingBlockDir, 'variables.tf')]);
    const outputs = readFirstExisting([join(buildingBlockDir, 'outputs.tf')]);
    const readme = readFirstExisting([
      join(moduleDir, 'README.md'),
      join(buildingBlockDir, 'README.md'),
      join(moduleDir, 'readme.md'),
      join(buildingBlockDir, 'readme.md')
    ]);

    const inputs = parseTerraformBlocks(variables, 'variable').map(({ name, body }) => ({
      name,
      type: terraformType(body),
      ...(terraformDescription(body) ? { description: terraformDescription(body) } : {})
    }));
    const outputDefs = parseTerraformBlocks(outputs, 'output').map(({ name, body }) => ({
      name,
      type: 'string',
      ...(terraformDescription(body) ? { description: terraformDescription(body) } : {})
    }));

    const heading = readme.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const name = heading && heading.length < 90 ? heading : titleCase(moduleName);
    const description = descriptionFromReadme(readme) || `${platform} Building Block from the meshStack Hub.`;
    const logo = findLogo(buildingBlockDir, moduleDir);
    const logoUrl = logo ? `${rawBase}/${relative(repoDir, logo).split(sep).join('/')}` : undefined;

    return {
      id,
      name,
      description,
      icon: '◈',
      ...(logoUrl ? { logoUrl } : {}),
      platform,
      codeUrl: `${githubBase}/${relBuildingBlock}`,
      source: { type: 'hub', label: 'meshStack Hub', icon: '◆' },
      implementation: { type: 'opentofu', label: 'OpenTofu', icon: '⬡' },
      inputs,
      outputs: outputDefs
    };
  }).sort((a, b) => `${a.platform} ${a.name}`.localeCompare(`${b.platform} ${b.name}`));

  const ts = `// AUTO-GENERATED by scripts/sync-hub.mjs. Do not edit manually.\n` +
    `import { BuildingBlockDefinition } from './models';\n\n` +
    `export const HUB_CATALOG: BuildingBlockDefinition[] = ${JSON.stringify(items, null, 2)};\n`;
  writeFileSync(outputFile, ts, 'utf8');
  console.log(`Generated ${items.length} Hub Building Blocks -> ${relative(frontendRoot, outputFile)}`);
}

try {
  syncRepo();
  generateCatalog();
} catch (error) {
  console.error(`Hub sync failed: ${error instanceof Error ? error.message : error}`);
  if (!bestEffort) process.exit(1);
  console.error('Keeping the existing generated catalog.');
}
