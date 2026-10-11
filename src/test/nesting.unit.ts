import { test, TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { nodeFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { buildProject, discoverSystems, existingSystem, generate, newSystem, systemName } from '../core/project';
import { createIndex } from '../lint/index';
import { checkProject } from '../lint/check';

async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-nesting-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	await project.mkdir('features');
	const config = { ...structuredClone(starterConfig), systemsDir: 'features', systemRoutes: { First: 'ReplicatedFirst' } };
	await project.write('src/Import.luau', await fs.readFile('templates/src/Import.luau', 'utf8'));
	await project.write('src/Core/Shared/CustomRequirer/init.luau', 'return {}');
	return { project, config };
}
const use = (specifier: string) => `local r = require(game:GetService("ReplicatedStorage").Import)(script)\nreturn r("${specifier}")`;

test('nested suffix and marked legacy systems preserve service-named groups, routes and module subfolders', async t => {
	const { project, config } = await fixture(t);
	await project.write('features/Players/First/Legacy/system.json', '{}');
	await project.write('features/Players/First/Legacy/Server/Secret.luau', 'return {}');
	await project.write('features/Players/First/Legacy/Shared/Data.luau', 'return {}');
	await project.write('features/Players/First/Legacy/First/Boot.luau', 'return {}');
	await project.write('features/Players/First/Legacy/ReplicatedFirst/Boot.luau', 'return {}');
	await project.write('features/Teams/MovementSystem/Client/Entry.luau', use('@Systems/Players/First/Legacy/Shared/Data'));
	await project.write('features/Teams/MovementSystem/Shared/Internal/HelperSystem/Value.luau', 'return {}');
	await project.write('features/FlatSystem/Shared/Value.luau', 'return {}');
	const systems = await discoverSystems(project, config);
	assert.deepEqual(systems.map(s => s.name), ['FlatSystem', 'Players/First/Legacy', 'Teams/MovementSystem']);
	await generate(project, config);
	assert.equal(await generate(project, config), false);
	const tree = JSON.parse(await project.read('default.project.json')).tree;
	assert.equal(tree.ReplicatedFirst.Systems.Players.First.Legacy.First.$path, 'features/Players/First/Legacy/First');
	assert.equal(tree.ReplicatedFirst.Systems.Players.First.Legacy.ReplicatedFirst.$path, 'features/Players/First/Legacy/ReplicatedFirst');
	assert.equal(tree.ServerScriptService.Systems.Players.First.Legacy.Server.$path, 'features/Players/First/Legacy/Server');
	assert.equal(tree.ReplicatedStorage.Systems.Players.First.Legacy.Server, undefined);
	const index = await createIndex(project, config);
	assert.equal(index.modules.get('features/Teams/MovementSystem/Client/Entry.luau')?.side, 'Client');
	assert.equal(index.modules.get('features/Players/First/Legacy/First/Boot.luau')?.side, 'Client');
	let checked = await checkProject(project, config);
	assert.deepEqual(checked.diagnostics, []);
	assert.ok(checked.dependencies.some(d => d.target === 'features/Players/First/Legacy/Shared/Data.luau'));
	await project.write('features/Teams/MovementSystem/Client/Entry.luau', use('@Systems/Players/First/Legacy/Server/Secret'));
	await project.write('features/Players/First/Legacy/Server/Entry.luau', use('@Systems/Players/First/Legacy/Server/Secret'));
	checked = await checkProject(project, config);
	assert.equal(checked.diagnostics.length, 1);
	assert.equal(checked.diagnostics[0].code, 'cross-boundary');
	assert.equal(checked.diagnostics[0].file, 'features/Teams/MovementSystem/Client/Entry.luau');
});

test('invalid legacy layouts and malformed markers fail before replacing generated outputs', async t => {
	const { project, config } = await fixture(t);
	await newSystem(project, config, 'Player/Good');
	const before = await project.read('default.project.json');
	await project.write('features/Player/Test/Client/Main.luau', 'return {}');
	await assert.rejects(generate(project, config), /Test\/system.json/);
	assert.equal(await project.read('default.project.json'), before);
	for (const bad of ['{', 'null', '[]', '{"enabled": true}']) {
		await project.write('features/Player/Test/system.json', bad);
		await assert.rejects(generate(project, config), /system.json/);
		assert.equal(await project.read('default.project.json'), before);
	}
	await project.write('features/Player/Test/system.json', '{}');
	await generate(project, config);
	assert.equal(await existingSystem(project, config, 'Player/Test'), 'Player/Test');
	await project.write('features/Player/GoodSystem/system.json', '{}');
	assert.equal(await generate(project, config), false, 'redundant marker does not change output');
	await project.mkdir('features/Player/GoodSystem/ChildSystem');
	await assert.rejects(buildProject(project, config), /systems cannot contain other systems/);
});

test('creation appends only the leaf suffix and deletion resolves exact systems rather than groups', async t => {
	const { project, config } = await fixture(t);
	assert.equal(await newSystem(project, config, 'Player/Teams/CharacterController'), 'Player/Teams/CharacterControllerSystem');
	assert.equal(await existingSystem(project, config, 'Player/Teams/CharacterController'), 'Player/Teams/CharacterControllerSystem');
	await assert.rejects(existingSystem(project, config, 'Player'), /group, not a system/);
	await assert.rejects(newSystem(project, config, 'Player/Teams/CharacterControllerSystem/Nested'), /inside system/);
	await assert.rejects(newSystem(project, config, 'MissingSystem/Nested'), /Grouping folder/);
	assert.equal(await project.exists('features/MissingSystem'), false);
	for (const invalid of ['../Escape', '/Player/Test', 'Player//Test', 'Player/../Test', 'Player\\Test', 'C:/Test']) {
		assert.throws(() => systemName(invalid), /System paths/);
	}
	// Duplicate leaf names are distinct systems when their full paths differ.
	await newSystem(project, config, 'Combat/CharacterController');
	assert.equal((await discoverSystems(project, config)).length, 2);
});

test('discovery stops at routes rather than walking every module directory', async t => {
	const { project, config } = await fixture(t);
	await project.write('features/Player/MovementSystem/Shared/Internal/Deep/Module.luau', 'return {}');
	const calls: string[] = [];
	await discoverSystems({ ...project, entries: p => { calls.push(p); return project.entries(p); } }, config);
	assert.deepEqual(calls, ['features', 'features/Player', 'features/Player/MovementSystem']);
});
