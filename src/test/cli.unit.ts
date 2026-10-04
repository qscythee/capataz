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
test('init fills missing example contents from the checked-in templates without changing help alignment', async t => {
	const root = await fixture(t);
	const templateFiles = [
		'src/Core/Client/Bootstrap.client.luau',
		'src/Core/Server/Bootstrap.server.luau',
		'src/Systems/GreetingSystem/Client/GreetingController.luau',
		'src/Systems/GreetingSystem/Server/GreetingService.luau',
		'src/Systems/GreetingSystem/Shared/Messages.luau',
		'src/Systems/CounterSystem/Client/CounterController.luau',
		'src/Systems/CounterSystem/Server/CounterService.luau',
		'src/Systems/CounterSystem/Shared/Counter.luau',
	];
	for (const system of ['GreetingSystem', 'CounterSystem']) {
		for (const part of ['Client', 'Server', 'Shared']) {
			await fs.mkdir(path.join(root, 'src/Systems', system, part), { recursive: true });
		}
	}
	const initialized = run(root, 'init');
	assert.equal(initialized.status, 0, initialized.stderr);
	const config = JSON.parse(await fs.readFile(path.join(root, 'capataz.config.json'), 'utf8'));
	assert.equal(config.project.emitLegacyScripts, false);
	assert.equal(config.project.systemsDir, 'src/Systems');
	assert.ok(config.project.tree);
	assert.equal(config.emitLegacyScripts, undefined);
	assert.equal(config.tree, undefined);
	const project = JSON.parse(await fs.readFile(path.join(root, 'default.project.json'), 'utf8'));
	assert.equal(project.emitLegacyScripts, false);
	assert.equal(project.tree.ReplicatedStorage.Client, undefined);
	assert.equal(project.tree.ReplicatedStorage.Core.Client.$path, 'src/Core/Client');
	assert.equal(project.tree.ReplicatedFirst.Core.First.$path, 'src/Core/First');
	assert.equal(project.tree.ReplicatedStorage.Core.First, undefined);
	assert.equal(project.tree.StarterPlayer, undefined);
	for (const file of templateFiles) {
		assert.equal(
			await fs.readFile(path.join(root, file), 'utf8'),
			await fs.readFile(path.resolve('templates', file), 'utf8'),
		);
	}

	const help = run(root, '--help').stdout;
	const usageLines = help.split('Usage: capataz <command> [options]\n\n')[1].split('\n\n')[0].split('\n');
	const optionLines = help.split('Options:\n')[1].split('\n\n')[0].split('\n');
	const descriptionColumn = (line: string) => {
		const content = line.trimStart();
		const gap = content.match(/\s{2,}/);
		assert.ok(gap);
		return line.indexOf(content) + gap.index! + gap[0].length;
	};
	for (const [name, lines] of [['commands', usageLines], ['options', optionLines]] as const) {
		const descriptionColumns = lines.map(descriptionColumn);
		assert.equal(new Set(descriptionColumns).size, 1, `${name} descriptions should align`);
	}
});
test('init migrates legacy flat config into the nested project shape without dropping settings', async t => {
	const root = await fixture(t);
	assert.equal(run(root, 'init').status, 0);
	const configPath = path.join(root, 'capataz.config.json');
	const current = JSON.parse(await fs.readFile(configPath, 'utf8'));
	const legacy = {
		...current.project,
		name: 'Existing project',
		emitLegacyScripts: true,
		systemRoutes: { Bootstrap: 'ReplicatedFirst' },
		lint: { rules: { 'dynamic-require': 'off' } },
	};
	await fs.writeFile(configPath, JSON.stringify(legacy));
	const initialized = run(root, 'init');
	assert.equal(initialized.status, 0, initialized.stderr);
	const migrated = JSON.parse(await fs.readFile(configPath, 'utf8'));
	assert.equal(migrated.project.name, 'Existing project');
	assert.equal(migrated.project.emitLegacyScripts, false);
	assert.equal(migrated.project.systemsDir, 'src/Systems');
	assert.deepEqual(migrated.systemRoutes, legacy.systemRoutes);
	assert.deepEqual(migrated.lint, legacy.lint);
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
test('configured system routes generate service mounts and appear in system listings', async t => {
	const root = await fixture(t);
	run(root, 'init');
	const configPath = path.join(root, 'capataz.config.json');
	const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
	config.systemRoutes = { Bootstrap: 'ReplicatedFirst' };
	await fs.writeFile(configPath, JSON.stringify(config));
	await fs.mkdir(path.join(root, 'src/Systems/LoaderSystem/bootstrap'), { recursive: true });
	await fs.writeFile(path.join(root, 'src/Systems/LoaderSystem/bootstrap/Loader.luau'), 'return {}');
	assert.equal(run(root, 'project', 'generate').status, 0);
	const project = JSON.parse(await fs.readFile(path.join(root, 'default.project.json'), 'utf8'));
	assert.equal(project.tree.ReplicatedFirst.Systems.LoaderSystem.Bootstrap.$path, 'src/Systems/LoaderSystem/bootstrap');
	const routes = await fs.readFile(path.join(root, 'src/Core/Shared/CustomRequirer/SystemRoutes.luau'), 'utf8');
	assert.match(routes, /\["bootstrap"\] = \{ Service = "ReplicatedFirst", Name = "Bootstrap" \}/);
	const systems = JSON.parse(run(root, 'system', 'list', '--format', 'json').stdout);
	assert.deepEqual(systems.find((system: { name: string }) => system.name === 'LoaderSystem').parts, ['Bootstrap']);
});
test('project lint configuration disables dynamic-require warnings', async t => {
	const root = await fixture(t);
	assert.equal(run(root, 'init').status, 0);
	const configPath = path.join(root, 'capataz.config.json');
	const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
	config.lint = { rules: { 'dynamic-require': 'off' } };
	await fs.writeFile(configPath, JSON.stringify(config));
	await fs.writeFile(path.join(root, 'src/Systems/CounterSystem/Client/DynamicController.luau'), 'local target = getTarget()\nrequire(target)');
	const checked = run(root, 'check', '--format', 'json');
	assert.equal(checked.status, 0, checked.stdout);
	assert.equal(JSON.parse(checked.stdout).diagnostics.some((diagnostic: { code: string }) => diagnostic.code === 'dynamic-require'), false);
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
	await fs.writeFile(path.join(root, 'src/Client/CustomController.luau'), 'return { Start = function() end }');
	await fs.writeFile(path.join(root, 'default.project.json'), JSON.stringify({ name: 'Existing', emitLegacyScripts: true, tree: { ReplicatedStorage: { Packages: { $path: 'Packages' } }, Workspace: { $className: 'Workspace' } } }));
	assert.equal(run(root, 'init').status, 0);
	assert.equal(await fs.readFile(path.join(root, 'src/Core/Client/Bootstrap.client.luau'), 'utf8'), '-- mine');
	assert.equal(await fs.readFile(path.join(root, 'src/Core/Client/CustomController.luau'), 'utf8'), 'return { Start = function() end }');
	await assert.rejects(fs.stat(path.join(root, 'src/Client')));
	const project = JSON.parse(await fs.readFile(path.join(root, 'default.project.json'), 'utf8'));
	assert.equal(project.name, 'Existing'); assert.equal(project.tree.ReplicatedStorage.Packages.$path, 'Packages');
	assert.equal(project.tree.ReplicatedStorage.Core.Client.$path, 'src/Core/Client');
	const config = JSON.parse(await fs.readFile(path.join(root, 'capataz.config.json'), 'utf8'));
	assert.equal(config.project.name, 'Existing');
	assert.equal(config.project.tree.ReplicatedStorage.Packages.$path, 'Packages');
	assert.equal(config.project.systemsDir, 'src/Systems');
});
test('malformed config and invalid flags report structured errors', async t => {
	const root = await fixture(t);
	await fs.writeFile(path.join(root, 'capataz.config.json'), '{bad');
	const result = run(root, 'check', '--format=json'); assert.equal(result.status, 2); assert.ok(JSON.parse(result.stdout).error);
	assert.equal(run(root, 'graph', '--format', 'csv').status, 2);
	assert.equal(run(root, 'check', '--dry-run').status, 2);
});
