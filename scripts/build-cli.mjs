import { build } from 'esbuild';
import { readdirSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, relative } from 'node:path';
const templates = {};
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else templates[relative('templates', file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
  }
}
collect('templates');
mkdirSync('dist', { recursive: true });
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', banner: { js: '#!/usr/bin/env node' }, define: { CAPATAZ_TEMPLATES: JSON.stringify(templates), CAPATAZ_VERSION: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) } });
chmodSync('dist/cli.cjs', 0o755);
