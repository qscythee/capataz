import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
await import('./build-cli.mjs');
const tests = readdirSync('src/test').filter(name => name.endsWith('.unit.ts'));
mkdirSync('out/unit', { recursive: true });
for (const name of tests) {
  await build({ entryPoints: [`src/test/${name}`], bundle: true, platform: 'node', format: 'cjs', outfile: `out/unit/${name.replace('.ts', '.cjs')}` });
}
const result = spawnSync(process.execPath, ['--test', ...tests.map(name => `out/unit/${name.replace('.ts', '.cjs')}`)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
