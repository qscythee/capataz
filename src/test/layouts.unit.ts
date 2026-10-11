import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { nodeFs } from '../core/fs';
import { starterConfig, initialize } from '../core/init';
import { configFileText, readConfig, newSystem, generate, projectIssues } from '../core/project';
import { selectLayout, layouts, routeFile } from '../core/layout';
import { checkTargets } from '../lint/targets';
import { prepareWatch } from '../core/watch';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-layouts-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	const config = { ...starterConfig, projectFile: 'places/lobby.project.json', projects: {
		lobby: { projectFile: 'places/lobby.project.json', systemsDir: 'places/lobby/src/Systems', coreDir: 'shared/Core' },
		match: { projectFile: 'places/match.project.json', systemsDir: 'places/match/src/Systems', coreDir: 'shared/Core' },
	} };
	await project.write('capataz.config.json', configFileText(config));
	for (const layout of Object.values(config.projects)) { await initialize(project, nodeFs(path.resolve('templates')), layout.projectFile); }
	return { root, project, config: await readConfig(project) };
}

test('managed layouts share Core but isolate same-name systems and route metadata', async t => {
	const { project, config, root } = await fixture(t);
	const [lobby, match] = layouts(config);
	await newSystem(project, lobby, 'Player');
	const lobbyRoutes = await project.read(routeFile(lobby));
	await newSystem(project, match, 'Player');
	await newSystem(project, match, 'MatchOnly');
	assert.equal(await project.read(routeFile(lobby)), lobbyRoutes);
	assert.doesNotMatch(lobbyRoutes, /MatchOnlySystem/);
	assert.match(await project.read(routeFile(match)), /MatchOnlySystem/);
	assert.ok(await project.exists('places/lobby/src/Systems/PlayerSystem'));
	assert.ok(await project.exists('places/match/src/Systems/PlayerSystem'));
	assert.equal(await project.exists('src/Core'), false);
	for (const layout of [lobby, match]) {
		const generated = JSON.parse(await project.read(layout.projectFile!));
		assert.equal(generated.tree.ReplicatedStorage.Core.Client.$path, '../shared/Core/Client');
		assert.equal(generated.tree.ReplicatedStorage.CapatazSystemRoutes.$path, '../' + routeFile(layout));
		assert.equal(generated.projects, undefined); assert.equal(generated.coreDir, undefined);
		assert.deepEqual(await projectIssues(project, layout), []);
	}
	assert.deepEqual((await checkTargets(project, config)).diagnostics, []);
	const cli = (...args: string[]) => spawnSync(process.execPath, [path.resolve('dist/cli.cjs'), ...args, '--root', root], { encoding: 'utf8', timeout: 15000 });
	const remove = cli('system', 'remove', 'Player', '--target', 'match', '--yes');
	assert.equal(remove.status, 0, remove.stderr);
	assert.ok(await project.exists('places/lobby/src/Systems/PlayerSystem'));
	assert.equal(await project.exists('places/match/src/Systems/PlayerSystem'), false);
	assert.equal(cli('system', 'new', 'Player', '--project-file', match.projectFile!).status, 0);
	assert.equal(cli('project', 'generate', '--all-targets').status, 0);
	assert.equal(cli('project', 'check', '--all-targets').status, 0);
	assert.equal(cli('system', 'list', '--target', 'lobby').stdout.includes('MatchOnlySystem'), false);
	assert.equal(cli('system', 'list', '--target', 'match').stdout.includes('MatchOnlySystem'), true);
	assert.equal(cli('check', '--target', 'match').status, 0);
});

test('watch generates registered projects and preserves authored lint-only projects', async t => {
	const { project, config } = await fixture(t);
	await project.remove('places/match.project.json');
	await prepareWatch(project, config, 'places/match.project.json');
	assert.ok(await project.exists('places/match.project.json'));
	const authored = '{"tree":{"$className":"DataModel"}}';
	await project.write('authored.project.json', authored);
	await prepareWatch(project, config, 'authored.project.json');
	assert.equal(await project.read('authored.project.json'), authored);
});

test('layout validation rejects ambiguous output files and escaping source paths', async t => {
	const { project, config } = await fixture(t);
	config.projects!.match.projectFile = config.projects!.lobby.projectFile;
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(readConfig(project), /unique/);
	config.projects!.match.projectFile = 'places/match.project.json';
	config.projects!.match.systemsDir = '../outside';
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(readConfig(project), /workspace-relative/);
	config.projects!.match.systemsDir = config.projects!.lobby.systemsDir + '/Nested';
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(readConfig(project), /non-overlapping/);
});

test('explicit Core tree mappings are preserved during generation', async t => {
	const { project, config } = await fixture(t);
	config.projects!.match.tree = { ReplicatedStorage: { Core: { Client: { $path: 'custom/client' } } } };
	await project.mkdir('custom/client');
	await generate(project, selectLayout(config, 'places/match.project.json'));
	const generated = JSON.parse(await project.read('places/match.project.json'));
	assert.equal(generated.tree.ReplicatedStorage.Core.Client.$path, '../custom/client');
});

test('real Rojo mounts shared CustomRequirer with separate generated route children', { skip: !process.env.ROJO_BIN && 'Set ROJO_BIN to verify generated multi-place mounts' }, async t => {
	const { root, project, config } = await fixture(t);
	for (const layout of layouts(config)) {
		const result = spawnSync(process.env.ROJO_BIN!, ['sourcemap', layout.projectFile!], { cwd: root, encoding: 'utf8', timeout: 15000 });
		assert.equal(result.status, 0, result.stderr);
		const tree = JSON.parse(result.stdout);
		const child = (node: { children: { name: string }[] }, name: string) => { const found = node.children?.find(item => item.name === name); assert.ok(found, name + ': ' + JSON.stringify(node)); return found as unknown as typeof node & { filePaths?: string[] }; };
		const requirer = child(child(child(child(tree, 'ReplicatedStorage'), 'Core'), 'Shared'), 'CustomRequirer');
		assert.ok(requirer.filePaths?.some(file => file.replace(/\\/g, '/').endsWith('shared/Core/Shared/CustomRequirer/init.luau')));
		const routes = child(child(tree, 'ReplicatedStorage'), 'CapatazSystemRoutes');
		assert.ok(routes.filePaths?.some(file => file.replace(/\\/g, '/').endsWith(routeFile(layout))));
		assert.ok(await project.exists(routeFile(layout)));
	}
});
