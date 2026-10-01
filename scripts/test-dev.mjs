import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const executable = process.argv[2] ?? process.env.CAPATAZ_TEST_ROJO;
if (!executable) throw new Error('Pass an installed Rojo executable, or set CAPATAZ_TEST_ROJO. Run npm run compile-tests and npm run build:cli first.');
const root = await mkdtemp(join(tmpdir(), 'capataz-dev-'));
const previousPath = process.env.PATH;
process.env.PATH = dirname(resolve(executable)) + (process.platform === 'win32' ? ';' : ':') + previousPath;
const { main } = createRequire(import.meta.url)('../out/cli.js');
const waitFor = async predicate => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for dev regeneration/sourcemap');
};
let active;
try {
  const initialized = spawnSync(process.execPath, ['dist/cli.cjs', 'init', '--root', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  active = main(['dev', '--root', root, '--port', '34991']);
  await waitFor(async () => { try { return (await stat(join(root, 'sourcemap.json'))).size > 0; } catch { return false; } });
  await mkdir(join(root, 'src/Systems/WatcherSystem/Shared'), { recursive: true });
  await writeFile(join(root, 'src/Systems/WatcherSystem/Shared/Data.luau'), 'return {}\n');
  await waitFor(async () => JSON.parse(await readFile(join(root, 'default.project.json'), 'utf8')).tree.ReplicatedStorage.Systems.WatcherSystem);
  process.emit('SIGINT');
  assert.equal(await active, 0);
  active = undefined;
  console.log('Verified real Rojo serve, sourcemap generation, system-change regeneration, and signal shutdown.');
} finally {
  if (active) { process.emit('SIGINT'); await active; }
  process.env.PATH = previousPath;
  await rm(root, { recursive: true, force: true });
}
