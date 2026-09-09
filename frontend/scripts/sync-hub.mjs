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

const acronymMap = new Map([
  ['stackit', 'STACKIT'],
  ['gcp', 'GCP'],
  ['aws', 'AWS'],
  ['iam', 'IAM'],
  ['ai', 'AI'],
  ['api', 'API'],
  ['github', 'GitHub'],
  ['gitlab', 'GitLab'],
  ['kubernetes', 'Kubernetes']
]);

function titleCase(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => acronymMap.get(token.toLowerCase()) ?? token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function readFirstExisting(paths) {
  for (const path of paths) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return '';
}

function isGenericHeading(value) {
  const normalized = value
    .replace(/[`*_#]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return !normalized || [
    'buildingblock',
    'building block',
    'building blocks',
    'readme',
    'overview',
    'module',
    'terraform module'
  ].includes(normalized);
}

function titleFromReadme(readme, moduleName) {
  const h1 = readme.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return h1 && h1.length < 100 && !isGenericHeading(h1) ? h1 : titleCase(moduleName);
}

function descriptionFromReadme(readme) {
  const lines = readme.split(/\r?\n/).map(line => line.trim());
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('![') || line.startsWith('[![') || line.startsWith('<')) continue;
    if (/^(?:---+|___+|\*\*\*+)$/.test(line)) continue;
    if (/^\|.*\|$/.test(line)) continue;
    if (/^[A-Za-z0-9_.-]+\s*:\s*.*$/.test(line)) continue;
    if (/^[-*+]\s+[A-Za-z0-9_.-]+\s*$/.test(line)) continue;
    const cleaned = line.replace(/^>\s*/, '').trim();
    if (!cleaned || cleaned === '---') continue;
    return cleaned.slice(0, 240);
  }
  return '';
}

function findLogo(buildingBlockRoot, moduleDir) {
  const files = [...walk(buildingBlockRoot), ...walk(moduleDir)]
    .filter(path => /(?:logo|icon)\.(?:png|svg|jpg|jpeg|webp)$/i.test(basename(path)));
  return files[0];
}

function resolveModuleEntry(variableFile, modulesDir) {
  const relativeFile = relative(modulesDir, variableFile);
  const parts = relativeFile.split(sep);
  const buildingBlockIndex = parts.map(part => part.toLowerCase()).lastIndexOf('buildingblock');
  if (buildingBlockIndex <= 0) return undefined;

  const moduleParts = parts.slice(0, buildingBlockIndex);
  const buildingBlockParts = parts.slice(0, buildingBlockIndex + 1);
  return {
    variableFile,
    implementationDir: dirname(variableFile),
    moduleDir: join(modulesDir, ...moduleParts),
    buildingBlockRoot: join(modulesDir, ...buildingBlockParts),
    moduleParts
  };
}

function generateCatalog() {
  const modulesDir = join(repoDir, 'modules');
  if (!existsSync(modulesDir)) throw new Error('meshstack-hub modules directory not found');

  const allFiles = walk(modulesDir);
  const entriesByModule = new Map();

  for (const variableFile of allFiles.filter(path => basename(path) === 'variables.tf')) {
    const entry = resolveModuleEntry(variableFile, modulesDir);
    if (!entry) continue;
    const key = entry.moduleDir;
    const existing = entriesByModule.get(key);
    if (!existing) {
      entriesByModule.set(key, entry);
      continue;
    }

    // Prefer the variables.tf closest to the buildingblock root when a module
    // contains multiple implementation subdirectories.
    const existingDepth = relative(existing.buildingBlockRoot, existing.variableFile).split(sep).length;
    const candidateDepth = relative(entry.buildingBlockRoot, entry.variableFile).split(sep).length;
    if (candidateDepth < existingDepth) entriesByModule.set(key, entry);
  }

  const items = [...entriesByModule.values()].map(entry => {
    const { variableFile, implementationDir, moduleDir, buildingBlockRoot, moduleParts } = entry;
    const relModule = relative(repoDir, moduleDir).split(sep).join('/');
    const relImplementation = relative(repoDir, implementationDir).split(sep).join('/');
    const platform = moduleParts[0] ? titleCase(moduleParts[0]) : 'meshStack Hub';
    const moduleName = basename(moduleDir);
    const id = moduleParts.join('-').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    const variables = readFileSync(variableFile, 'utf8');
    const outputs = readFirstExisting([
      join(implementationDir, 'outputs.tf'),
      join(buildingBlockRoot, 'outputs.tf')
    ]);
    const readme = readFirstExisting([
      join(moduleDir, 'README.md'),
      join(moduleDir, 'readme.md'),
      join(buildingBlockRoot, 'README.md'),
      join(buildingBlockRoot, 'readme.md'),
      join(implementationDir, 'README.md'),
      join(implementationDir, 'readme.md')
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

    const name = titleFromReadme(readme, moduleName);
    const description = descriptionFromReadme(readme) || `${platform} Building Block from the meshStack Hub.`;
    const logo = findLogo(buildingBlockRoot, moduleDir);
    const logoUrl = logo ? `${rawBase}/${relative(repoDir, logo).split(sep).join('/')}` : undefined;

    return {
      id,
      name,
      description,
      icon: '◈',
      ...(logoUrl ? { logoUrl } : {}),
      platform,
      codeUrl: `${githubBase}/${relImplementation}`,
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
