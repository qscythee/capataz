import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { nodeFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { createIndex } from '../lint/index';
import { checkProject } from '../lint/check';
import { generate, projectIssues, readConfig } from '../core/project';

test('init modules resolve relative imports through Roblox parents, not physical directory parents', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = structuredClone(starterConfig);
	await project.write('src/Import.luau', 'return {}');
	await project.write('src/Systems/TestSystem/Shared/Wrapper/init.luau', 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\nreturn r("./Sibling")');
	await project.write('src/Systems/TestSystem/Shared/Sibling.luau', 'return {}');
	await project.write('src/Systems/TestSystem/Shared/Wrapper/Sibling.luau', 'return {}');
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
test('config traversal is rejected, missing mounts are reported, and project comparison ignores key order', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = structuredClone(starterConfig);
	await project.mkdir('src/Systems'); await generate(project, config);
	assert.ok((await projectIssues(project, config)).some(issue => issue.includes('Missing')));
	await project.write('capataz.config.json', JSON.stringify({ ...config, systemsDir: '../escape' }));
	await assert.rejects(readConfig(project), /inside the project/);
	await assert.rejects(project.write('../escape/file', 'bad'), /escapes project root/);
	const generated = JSON.parse(await project.read('default.project.json'));
	await project.write('default.project.json', JSON.stringify({ tree: generated.tree, syncbackRules: generated.syncbackRules, emitLegacyScripts: generated.emitLegacyScripts }));
	assert.ok(!(await projectIssues(project, config)).some(issue => issue.includes('stale')));
});
