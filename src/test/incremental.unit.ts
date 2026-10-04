import { test, TestContext } from 'node:test';
import { CapatazTreeNode } from '../config';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { nodeFs, ProjectFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { configFileText } from '../core/project';
import { IncrementalLinter } from '../lint/incremental';
import { checkProject } from '../lint/check';

const client = 'src/Systems/TestSystem/Client/Main.luau';
const shared = 'src/Systems/TestSystem/Shared/Target.luau';
const server = 'src/Systems/TestSystem/Server/Target.luau';
const prefix = 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\n';
const source = (side: string) => prefix + `return r("@Systems/TestSystem/${side}/Target")`;
async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-incremental-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	await project.write('capataz.config.json', configFileText(starterConfig));
	await project.write('src/Import.luau', 'return {}');
	await project.write(client, source('Server'));
	await project.write(shared, 'return {}');
	await project.write(server, 'return {}');
	return project;
}

test('editing an overlay uses no filesystem operations and preserves other files', async t => {
	const project = await fixture(t);
	const other = client.replace('Main', 'Other'); await project.write(other, source('Server'));
	const calls: string[] = [];
	const counted: ProjectFs = { ...project,
		read: p => { calls.push('read:' + p); return project.read(p); },
		entries: p => { calls.push('entries:' + p); return project.entries(p); },
		exists: p => { calls.push('exists:' + p); return project.exists(p); },
	};
	const linter = new IncrementalLinter(counted);
	const initial = await linter.refresh({});
	assert.equal(initial.get(other)?.diagnostics[0]?.code, 'cross-boundary');
	calls.length = 0;
	const updates = await linter.refresh({ files: [client] }, new Map([[client, source('Shared')]]));
	assert.deepEqual([...updates.keys()], [client]); assert.deepEqual(updates.get(client)?.diagnostics, []);
	assert.deepEqual(calls, []);
	assert.equal((await linter.refresh({ files: [client] }, new Map([[client, source('Shared')]]))).size, 0);
	// Closing an unsaved document returns to disk content and its error.
	assert.equal((await linter.refresh({ files: [client] })).get(client)?.diagnostics[0]?.code, 'cross-boundary');
	assert.deepEqual(calls, ['read:' + client]);
});

test('structural changes recheck importers, clear deleted files and match a full check', async t => {
	const project = await fixture(t); const linter = new IncrementalLinter(project);
	await project.write(client, source('Shared')); await linter.refresh({});
	await project.remove(shared);
	let updates = await linter.refresh({ rebuild: true });
	assert.equal(updates.get(client)?.diagnostics[0]?.code, 'unresolved-require');
	assert.deepEqual(updates.get(shared)?.diagnostics, []);
	await project.write(shared, 'return {}');
	updates = await linter.refresh({ rebuild: true });
	assert.deepEqual(updates.get(client)?.diagnostics, []);
	await project.write(shared.replace('.luau', '.meta.json'), '{"className":"LocalScript"}');
	updates = await linter.refresh({ rebuild: true });
	assert.equal(updates.get(client)?.diagnostics[0]?.code, 'not-module');
	const full = await checkProject(project, structuredClone(starterConfig));
	assert.deepEqual([...updates.values()].flatMap(a => a.diagnostics).sort((a, b) => a.file.localeCompare(b.file)), full.diagnostics);
	await project.remove('capataz.config.json');
	updates = await linter.refresh({ rebuild: true });
	assert.ok(updates.has(client)); assert.ok([...updates.values()].every(a => a.diagnostics.length === 0));
});

test('alias and mount changes invalidate previously valid importers', async t => {
	const project = await fixture(t); const linter = new IncrementalLinter(project);
	await project.write('.luaurc', '{"aliases":{"Test":"src/Systems/TestSystem/Shared"}}');
	await project.write(client, 'return require("@Test/Target")');
	assert.deepEqual((await linter.refresh({})).get(client)?.diagnostics, []);
	await project.write('.luaurc', '{"aliases":{"Test":"src/Systems/TestSystem/Server"}}');
	assert.equal((await linter.refresh({ rebuild: true })).get(client)?.diagnostics[0]?.code, 'cross-boundary');
	const config = structuredClone(starterConfig); delete (config.tree.ReplicatedStorage as CapatazTreeNode).Import;
	await project.write('capataz.config.json', configFileText(config)); await project.write(client, source('Shared'));
	assert.ok((await linter.refresh({ rebuild: true })).get(client)?.diagnostics.some(d => d.code === 'unresolved-require'));
});

test('cancelled scans stop at the current read and do not commit partial results', async t => {
	const project = await fixture(t);
	let reads = 0; let pause = false;
	let started!: () => void; let release!: () => void;
	const begun = new Promise<void>(resolve => { started = resolve; });
	const blocked = new Promise<void>(resolve => { release = resolve; });
	const counted: ProjectFs = { ...project, read: async p => {
		reads++; if (pause) { pause = false; started(); await blocked; } return project.read(p);
	} };
	const linter = new IncrementalLinter(counted); await linter.refresh({});
	await project.write(client, source('Shared')); reads = 0; pause = true;
	const controller = new AbortController();
	const scan = linter.refresh({ full: true }, new Map(), controller.signal);
	await begun; controller.abort(); release();
	await assert.rejects(scan, { name: 'AbortError' }); assert.equal(reads, 1);
	const updates = await linter.refresh({ files: [client] }, new Map([[client, source('Shared')]]));
	assert.deepEqual([...updates.keys()], [client]); assert.deepEqual(updates.get(client)?.diagnostics, []);
});

test('index construction and entirely in-memory scans are cancellable', async t => {
	const project = await fixture(t); let operations = 0;
	const controller = new AbortController();
	const counted: ProjectFs = { ...project, exists: async p => { operations++; controller.abort(); return project.exists(p); } };
	await assert.rejects(new IncrementalLinter(counted).refresh({}, new Map(), controller.signal), { name: 'AbortError' });
	assert.equal(operations, 1);
	for (let i = 0; i < 40; i++) { await project.write(client.replace('Main', 'Extra' + i), source('Server')); }
	const linter = new IncrementalLinter(project); await linter.refresh({});
	const overlays = new Map(Array.from({ length: 40 }, (_, i) => [client.replace('Main', 'Extra' + i), source('Shared')]));
	const next = new AbortController(); setImmediate(() => next.abort());
	await assert.rejects(linter.refresh({ files: overlays.keys() }, overlays, next.signal), { name: 'AbortError' });
	assert.equal((await linter.refresh({ files: overlays.keys() }, overlays)).size, 40);
});
