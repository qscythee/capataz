import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const binary = path.resolve('dist/cli.cjs');
function run(root: string, ...args: string[]) { return spawnSync(process.execPath, [binary, ...args, '--root', root], { encoding: 'utf8', timeout: 15000 }); }
async function fixture(t: { after(fn: () => Promise<void>): void }): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-cli-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	return root;
}

test('init dry run writes nothing, init is idempotent, project is current', async t => {
	const root = await fixture(t);
	const preview = run(root, 'init', '--dry-run', '--format', 'json'); assert.equal(preview.status, 0, preview.stderr);
	assert.ok(JSON.parse(preview.stdout).changes.length > 0); assert.deepEqual(await fs.readdir(root), []);
	assert.equal(run(root, 'init').status, 0);
	assert.deepEqual(JSON.parse(run(root, 'init', '--format', 'json').stdout).created, []);
	assert.equal(run(root, 'project', 'check').status, 0);
	const checked = run(root, 'check', '--format', 'json');
	assert.equal(checked.status, 0, checked.stdout); assert.ok(JSON.parse(checked.stdout).files > 0);
});
test('system commands list, preview, create, detect stale project and remove safely', async t => {
	const root = await fixture(t); run(root, 'init');
	assert.equal(run(root, 'system', 'new', 'Inventory', '--dry-run').status, 0);
	await assert.rejects(fs.stat(path.join(root, 'src/Systems/InventorySystem')));
	assert.equal(run(root, 'system', 'new', 'Inventory').status, 0);
	assert.equal(run(root, 'system', 'new', 'Inventory').status, 2);
	assert.equal(JSON.parse(run(root, 'system', 'list', '--format', 'json').stdout).length, 3);
	await fs.mkdir(path.join(root, 'src/Systems/ExtraSystem/Shared'), { recursive: true });
	assert.equal(run(root, 'project', 'check').status, 1);
	assert.equal(run(root, 'project', 'generate').status, 0);
	assert.equal(run(root, 'system', 'remove', 'Inventory').status, 2);
	assert.equal(run(root, 'system', 'remove', 'Inventory', '--dry-run').status, 0);
	assert.ok(await fs.stat(path.join(root, 'src/Systems/InventorySystem')));
	assert.equal(run(root, 'system', 'remove', 'Inventory', '--yes').status, 0);
	assert.equal(run(root, 'system', 'new', '../oops').status, 2);
});
test('custom imports cause CI failure, graph exposes edges, explain traces indirect violations', async t => {
	const root = await fixture(t); run(root, 'init');
	const shared = 'src/Systems/CounterSystem/Shared/Counter.luau';
	await fs.writeFile(path.join(root, shared), 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\nreturn r("@Systems/CounterSystem/Server/CounterService")');
	const checked = run(root, 'check', '--format', 'json'); assert.equal(checked.status, 1);
	const issue = JSON.parse(checked.stdout).diagnostics.find((d: { code: string }) => d.code === 'cross-boundary'); assert.equal(issue.file, shared);
	const explained = run(root, 'explain', 'src/Systems/CounterSystem/Client/CounterController.luau', '--format', 'json'); assert.equal(explained.status, 1);
	assert.equal(JSON.parse(explained.stdout).diagnostics.find((d: { code: string }) => d.code === 'cross-boundary').chain.length, 3);
	const graph = JSON.parse(run(root, 'graph').stdout); assert.ok(graph.edges.some((e: { file: string }) => e.file === shared));
	assert.match(run(root, 'graph', '--format', 'dot').stdout, /^digraph Capataz/);
});
test('server-to-client advice warns without failing ordinary checks; strict checks fail', async t => {
	const root = await fixture(t); run(root, 'init');
	await fs.writeFile(path.join(root, 'src/Systems/CounterSystem/Server/Advice.luau'), 'local import = require(game:GetService("ReplicatedStorage").Import)(script)\nreturn import("@Systems/CounterSystem/Client/CounterController")');
	const ordinary = run(root, 'check', '--format', 'json'); assert.equal(ordinary.status, 0, ordinary.stdout);
	const issue = JSON.parse(ordinary.stdout).diagnostics.find((d: { code: string }) => d.code === 'cross-boundary');
	assert.equal(issue.severity, 'warning'); assert.match(issue.message, /discouraged/);
	assert.equal(run(root, 'check', '--strict').status, 1);
});
test('adoption preserves authored source, settings, packages and unrelated mounts', async t => {
	const root = await fixture(t);
	await fs.mkdir(path.join(root, 'src/Client'), { recursive: true });
	await fs.writeFile(path.join(root, 'src/Client/Bootstrap.client.luau'), '-- mine');
	await fs.writeFile(path.join(root, 'default.project.json'), JSON.stringify({ name: 'Existing', emitLegacyScripts: true, tree: { ReplicatedStorage: { Packages: { $path: 'Packages' } }, Workspace: { $className: 'Workspace' } } }));
	assert.equal(run(root, 'init').status, 0);
	assert.equal(await fs.readFile(path.join(root, 'src/Client/Bootstrap.client.luau'), 'utf8'), '-- mine');
	const project = JSON.parse(await fs.readFile(path.join(root, 'default.project.json'), 'utf8'));
	assert.equal(project.name, 'Existing'); assert.equal(project.tree.ReplicatedStorage.Packages.$path, 'Packages');
});
test('malformed config and invalid flags report structured errors', async t => {
	const root = await fixture(t);
	await fs.writeFile(path.join(root, 'capataz.config.json'), '{bad');
	const result = run(root, 'check', '--format=json'); assert.equal(result.status, 2); assert.ok(JSON.parse(result.stdout).error);
	assert.equal(run(root, 'graph', '--format', 'csv').status, 2);
	assert.equal(run(root, 'check', '--dry-run').status, 2);
});
