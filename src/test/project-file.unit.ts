import { test, TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { nodeFs } from '../core/fs';
import { initialize, starterConfig } from '../core/init';
import { configFileText, defaultProjectFile, generate, projectIssues, readConfig } from '../core/project';
import { prepareWatch } from '../core/watch';

async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-project-file-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	await initialize(project, nodeFs(path.resolve('templates')));
	return project;
}

test('configured project output rebases nested mounts and is shared by init, generation and checks', async t => {
	const project = await fixture(t);
	const original = await project.read('default.project.json');
	const config = { ...starterConfig, projectFile: 'places/game.project.json' };
	await project.write('capataz.config.json', configFileText(config));
	const serialized = JSON.parse(await project.read('capataz.config.json'));
	assert.equal(serialized.projectFile, config.projectFile);
	assert.equal(serialized.project.projectFile, undefined);
	const loaded = await readConfig(project);
	await initialize(project, nodeFs(path.resolve('templates')));
	const generated = JSON.parse(await project.read(config.projectFile));
	assert.equal(generated.tree.ReplicatedStorage.Systems.CounterSystem.Shared.$path, '../src/Systems/CounterSystem/Shared');
	assert.equal(generated.projectFile, undefined);
	assert.equal(generated.name, 'game');
	assert.equal(await project.read('default.project.json'), original);
	assert.deepEqual(await projectIssues(project, loaded), []);
	assert.equal(await generate(project, loaded), false);
	await project.write(config.projectFile, '{}');
	assert.ok((await projectIssues(project, loaded)).some(issue => issue.includes(config.projectFile)));
});

test('watch selects configured default or preserves an explicit alternate', async t => {
	const project = await fixture(t);
	const config = { ...starterConfig, projectFile: 'game.project.json' };
	const implicit = await prepareWatch(project, config);
	assert.equal(implicit.projectFile, 'game.project.json');
	const alternate = '{"name":"Lobby","tree":{"$className":"DataModel"}}\n';
	await project.write('places/lobby.project.json', alternate);
	const selected = await prepareWatch(project, config, 'places/lobby.project.json');
	assert.equal(selected.projectFile, 'places/lobby.project.json');
	assert.equal(await project.read('places/lobby.project.json'), alternate);
	assert.ok(await project.exists('game.project.json'));
	assert.equal((await prepareWatch(project, config, 'game.project.json')).projectFile, 'game.project.json');
});

test('invalid or missing project selections fail before generation writes', async t => {
	const project = await fixture(t);
	for (const projectFile of ['../escape.project.json', '/absolute.project.json', 'C:/escape.project.json', 'bad.json', '', 123, null]) {
		await project.write('capataz.config.json', JSON.stringify({ project: starterConfig, projectFile }));
		await assert.rejects(readConfig(project), /projectFile/);
	}
	await assert.rejects(prepareWatch(project, { ...starterConfig, projectFile: 'new.project.json' }, 'missing.project.json'), /does not exist/);
	assert.equal(await project.exists('new.project.json'), false);
	await project.write('invalid.project.json', '{}');
	await assert.rejects(prepareWatch(project, starterConfig, 'invalid.project.json'), /Rojo tree/);
	assert.equal(defaultProjectFile(starterConfig), 'default.project.json');
});
