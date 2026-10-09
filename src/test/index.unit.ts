import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { CapatazTreeNode } from '../config';
import { nodeFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { createIndex } from '../lint/index';
import { checkProject } from '../lint/check';
import { buildProject, configFileText, generate, projectIssues, readConfig } from '../core/project';

test('init modules resolve relative imports through Roblox parents, not physical directory parents', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = structuredClone(starterConfig);
	await project.write('src/Import.luau', await fs.readFile('templates/src/Import.luau', 'utf8'));
	await project.write('src/Core/Shared/CustomRequirer/init.luau', 'return {}');
	await project.write('src/Systems/TestSystem/Shared/Wrapper/init.luau', 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\nreturn r("./Sibling")');
	await project.write('src/Systems/TestSystem/Shared/Sibling.luau', 'return {}');
	await project.write('src/Systems/TestSystem/Shared/Wrapper/Sibling.luau', 'return {}');
	await generate(project, config);
	const result = await checkProject(project, config);
	const edge = result.dependencies.find(e => e.file.endsWith('/Wrapper/init.luau') && e.custom);
	assert.equal(edge?.target, 'src/Systems/TestSystem/Shared/Sibling.luau');
	assert.deepEqual(result.diagnostics, []);
});
test('custom systemsDir and nonmodule metadata are respected', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = { ...structuredClone(starterConfig), systemsDir: 'features' };
	await project.write('features/InventorySystem/Shared/Data.luau', 'return {}');
	await project.write('features/InventorySystem/Shared/Data.meta.json', '{"className":"LocalScript"}');
	const index = await createIndex(project, config);
	assert.equal(index.modules.get('features/InventorySystem/Shared/Data.luau')?.module, false);
	assert.equal(index.instances.get('ReplicatedStorage/Systems/InventorySystem/Shared/Data')?.side, 'Shared');
});
test('system routes are case-insensitive and support built-in services and custom aliases', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	const config = { ...structuredClone(starterConfig), systemRoutes: { Bootstrap: 'ReplicatedFirst' } };
	const sources = [
		'src/Systems/TestSystem/client/Entry.luau',
		'src/Systems/TestSystem/ReplicatedFirst/Target.luau',
		'src/Systems/TestSystem/Bootstrap/CustomTarget.luau',
	];
	await project.write('src/Import.luau', await fs.readFile('templates/src/Import.luau', 'utf8'));
	await project.write('src/Core/Shared/CustomRequirer/init.luau', 'return {}');
	await project.write('src/Core/Shared/CustomRequirer/init.luau', 'return {}');
	for (const file of sources) {
		await project.write(file, file.endsWith('Entry.luau')
			? 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\nr("@Systems/TestSystem/replicatedfirst/Target")\nr("@systems/TestSystem/bootstrap/CustomTarget")'
			: 'return {}');
	}
	const generated = await buildProject(project, config);
	const node = (...keys: string[]): CapatazTreeNode => {
		let current = generated.tree as CapatazTreeNode;
		for (const key of keys) {
			const next = current[key];
			assert.ok(next && typeof next === 'object');
			current = next;
		}
		return current;
	};
	assert.equal(node('ReplicatedStorage', 'Systems', 'TestSystem', 'Client').$path, 'src/Systems/TestSystem/client');
	assert.equal(node('ReplicatedFirst', 'Systems', 'TestSystem', 'ReplicatedFirst').$path, 'src/Systems/TestSystem/ReplicatedFirst');
	assert.equal(node('ReplicatedFirst', 'Systems', 'TestSystem', 'Bootstrap').$path, 'src/Systems/TestSystem/Bootstrap');
	await generate(project, config);
	const generatedRoutes = await project.read('src/Core/Shared/CustomRequirer/SystemRoutes.luau');
	assert.match(generatedRoutes, /\["server"\] = \{ Service = "ServerScriptService", Name = "Server" \}/);
	assert.match(generatedRoutes, /\["bootstrap"\] = \{ Service = "ReplicatedFirst", Name = "Bootstrap" \}/);
	assert.ok(!(await projectIssues(project, config)).some(issue => issue.includes('SystemRoutes.luau')));
	const result = await checkProject(project, config);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.dependencies.filter(edge => edge.file.endsWith('/Entry.luau') && edge.custom).map(edge => edge.target).filter(Boolean).sort(), [
		'src/Systems/TestSystem/Bootstrap/CustomTarget.luau',
		'src/Systems/TestSystem/ReplicatedFirst/Target.luau',
	]);
});
test('config traversal is rejected, missing mounts are reported, and project comparison ignores key order', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = structuredClone(starterConfig);
	await project.mkdir('src/Systems'); await generate(project, config);
	const projectTree = JSON.parse(await project.read('default.project.json')).tree;
	assert.equal(projectTree.ReplicatedFirst.Core.First.$path, 'src/Core/First');
	assert.equal(projectTree.ReplicatedStorage.Core.First, undefined);
	assert.ok((await projectIssues(project, config)).some(issue => issue.includes('Missing')));
	await project.write('capataz.config.json', configFileText({ ...config, lint: { rules: { 'dynamic-require': 'disabled' as never } } }));
	await assert.rejects(readConfig(project), /must be 'off' or 'warn'/);
	await project.write('capataz.config.json', configFileText({ ...config, systemsDir: '../escape' }));
	await assert.rejects(readConfig(project), /inside the project/);
	await assert.rejects(project.write('../escape/file', 'bad'), /escapes project root/);
	const generated = JSON.parse(await project.read('default.project.json'));
	await project.write('default.project.json', JSON.stringify({ tree: generated.tree, syncbackRules: generated.syncbackRules, emitLegacyScripts: generated.emitLegacyScripts }));
	assert.ok(!(await projectIssues(project, config)).some(issue => issue.includes('stale')));
});
test('config files nest Rojo project settings and require the project object', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	const config = { ...structuredClone(starterConfig), name: 'Example', systemRoutes: { Bootstrap: 'ReplicatedFirst' }, lint: { rules: { 'dynamic-require': 'off' as const } } };
	await project.write('capataz.config.json', configFileText(config));
	const nested = JSON.parse(await project.read('capataz.config.json'));
	assert.equal(nested.project.name, 'Example');
	assert.equal(nested.project.systemsDir, 'src/Systems');
	assert.deepEqual(nested.systemRoutes, config.systemRoutes);
	assert.deepEqual(nested.lint, config.lint);
	assert.equal(nested.tree, undefined);
	assert.deepEqual(await readConfig(project), config);
	await project.write('capataz.config.json', JSON.stringify(config));
	await assert.rejects(readConfig(project), /missing 'project' object/);
});
