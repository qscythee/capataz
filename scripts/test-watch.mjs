import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = await mkdtemp(join(tmpdir(), 'capataz-watch-'));
const previousPath = process.env.PATH;
const { main } = createRequire(import.meta.url)('../out/cli.js');
const originalLog = console.log, originalError = console.error;
const logs = [];
console.log = (...args) => { logs.push(args.join(' ')); originalLog(...args); };
console.error = (...args) => { logs.push(args.join(' ')); originalError(...args); };
const waitFor = async predicate => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for standalone watch: ' + logs.join('\n'));
};
let active;
try {
  const initialized = spawnSync(process.execPath, ['dist/cli.cjs', 'init', '--root', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  await mkdir(join(root, 'places'));
  await mkdir(join(root, 'common'));
  await writeFile(join(root, 'common/Use.luau'), 'return {}');
  const alternate = JSON.stringify({ name: 'Lobby', tree: { ReplicatedStorage: { Common: { $path: '../common' } } } });
  await writeFile(join(root, 'places/lobby.project.json'), alternate);
  // No Rojo or other external executable can be found by the command.
  process.env.PATH = '';
  active = main(['watch', 'places/lobby.project.json', '--root', root]);
  await waitFor(() => logs.some(line => line.startsWith('Watching ')));
  await writeFile(join(root, 'common/Use.luau'), 'return require(game:GetService("ReplicatedStorage").Missing)');
  await waitFor(() => logs.some(line => line.includes('[places/lobby.project.json]') && line.includes('unresolved-require')));
  await writeFile(join(root, 'common/Use.luau'), 'return {}');
  const before = logs.length;
  await waitFor(() => logs.slice(before).some(line => line === 'Lint: 0 errors, 0 warnings.'));
  await mkdir(join(root, 'src/Systems/WatcherSystem/Shared'), { recursive: true });
  await writeFile(join(root, 'src/Systems/WatcherSystem/Shared/Data.luau'), 'return {}');
  await waitFor(async () => JSON.parse(await readFile(join(root, 'default.project.json'), 'utf8')).tree.ReplicatedStorage.Systems.WatcherSystem);
  assert.equal(await readFile(join(root, 'places/lobby.project.json'), 'utf8'), alternate);
  await assert.rejects(stat(join(root, 'sourcemap.json')));
  await assert.rejects(stat(join(root, 'places/lobby.sourcemap.json')));
  process.emit('SIGINT'); assert.equal(await active, 0); active = undefined;
  console.log('Verified standalone watch, target linting and recovery, regeneration, preserved alternate, no tool dependency/sourcemap, and shutdown.');
  const config = JSON.parse(await readFile(join(root, 'capataz.config.json'), 'utf8'));
  config.projectFile = 'managed/lobby.project.json';
  config.projects = Object.fromEntries(['lobby', 'match'].map(name => [name, {
    projectFile: 'managed/' + name + '.project.json', systemsDir: 'managed/' + name + '/Systems', coreDir: 'shared/Core',
    tree: { ReplicatedStorage: { Import: { $path: 'shared/Import.luau' } } },
  }]));
  await writeFile(join(root, 'capataz.config.json'), JSON.stringify(config));
  for (const name of ['lobby', 'match']) { const init = spawnSync(process.execPath, ['dist/cli.cjs', 'init', '--target', name, '--root', root], { encoding: 'utf8' }); assert.equal(init.status, 0, init.stderr); }
  const start = logs.length;
  active = main(['watch', '--root', root]);
  await waitFor(() => logs.slice(start).some(line => line.startsWith('Watching ')));
  await mkdir(join(root, 'managed/match/Systems/MatchOnlySystem/Shared'), { recursive: true });
  await writeFile(join(root, 'managed/match/Systems/MatchOnlySystem/Shared/Data.luau'), 'return {}');
  await waitFor(async () => JSON.parse(await readFile(join(root, 'managed/match.project.json'), 'utf8')).tree.ReplicatedStorage.Systems.MatchOnlySystem);
  assert.equal(JSON.parse(await readFile(join(root, 'managed/lobby.project.json'), 'utf8')).tree.ReplicatedStorage.Systems.MatchOnlySystem, undefined);
  const changed = logs.length;
  await writeFile(join(root, 'shared/Core/Shared/WatchShared.luau'), 'return require(game:GetService("ReplicatedStorage").Missing)');
  await waitFor(() => ['[lobby]', '[match]'].every(name => logs.slice(changed).some(line => line.includes(name) && line.includes('unresolved-require'))));
  assert.equal(await readFile(join(root, 'places/lobby.project.json'), 'utf8'), alternate);
  process.emit('SIGINT'); assert.equal(await active, 0); active = undefined;
  console.log('Verified managed multi-place watch, isolated system generation and shared-source diagnostics for both places.');
  config.projectFile = 'mapped/lobby.project.json';
  config.systemRoots = { universal: 'Universal/Systems' };
  config.project = { emitLegacyScripts: false, tree: { $className: 'DataModel' } };
  config.projects = Object.fromEntries(['lobby', 'match'].map(name => [name, {
    projectFile: 'mapped/' + name + '.project.json', systemMounts: { universal: { Shared: 'ReplicatedStorage/Universal/Systems' } },
  }]));
  await writeFile(join(root, 'capataz.config.json'), JSON.stringify(config));
  for (const name of ['lobby', 'match']) { const init = spawnSync(process.execPath, ['dist/cli.cjs', 'init', '--target', name, '--root', root], { encoding: 'utf8' }); assert.equal(init.status, 0, init.stderr); }
  const mappedStart = logs.length;
  active = main(['watch', '--root', root]);
  await waitFor(() => logs.slice(mappedStart).some(line => line.startsWith('Watching ')));
  await mkdir(join(root, 'Universal/Systems/SharedWatchSystem/Shared'), { recursive: true });
  await writeFile(join(root, 'Universal/Systems/SharedWatchSystem/Shared/Data.luau'), 'return {}');
  await waitFor(async () => (await Promise.all(['lobby', 'match'].map(async name => JSON.parse(await readFile(join(root, 'mapped/' + name + '.project.json'), 'utf8')).tree.ReplicatedStorage.Universal.Systems.SharedWatchSystem))).every(Boolean));
  assert.equal(await readFile(join(root, 'places/lobby.project.json'), 'utf8'), alternate);
  process.emit('SIGINT'); assert.equal(await active, 0); active = undefined;
  console.log('Verified reusable Universal root watch regenerates every consuming project.');


} finally {
  if (active) { process.emit('SIGINT'); await active; }
  console.log = originalLog; console.error = originalError; process.env.PATH = previousPath;
  await rm(root, { recursive: true, force: true });
}
