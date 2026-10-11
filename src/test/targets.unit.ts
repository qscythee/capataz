import { test, TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { nodeFs, ProjectFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { configFileText, readConfig } from '../core/project';
import { checkTargets, TargetLinter } from '../lint/targets';

async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-targets-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	const config = { ...starterConfig, lint: { targets: {
		lobby: { projectFile: 'places/lobby.project.json', includeGlobs: ['common/**'] },
		match: { projectFile: 'places/match.project.json', includeGlobs: ['common/**'] },
	} } };
	await project.write('capataz.config.json', configFileText(config));
	await project.write('common/Use.luau', 'return require(game:GetService("ReplicatedStorage").Target)');
	await project.write('deps/Target.luau', 'return {}');
	await project.write('unmounted/Unused.luau', 'return require("./Missing")');
	for (const name of ['lobby', 'match']) {
		await project.write(`places/${name}.project.json`, JSON.stringify({ tree: {
			ReplicatedStorage: { Common: { $path: '../common' }, ...(name === 'match' ? { Target: { $path: '../deps/Target.luau' } } : {}) },
		} }));
	}
	return { project, config, root };
}

test('targets use their actual trees, label shared-file diagnostics and retain excluded dependencies', async t => {
	const { project, config, root } = await fixture(t);
	const result = await checkTargets(project, config);
	assert.equal(result.files, 2);
	assert.equal(result.diagnostics.length, 1);
	assert.equal(result.diagnostics[0].lintTarget, 'lobby');
	assert.equal(result.diagnostics[0].code, 'unresolved-require');
	assert.ok(result.dependencies.some(edge => edge.lintTarget === 'match' && edge.target === 'deps/Target.luau'));
	assert.deepEqual((await checkTargets(project, config, 'match')).diagnostics, []);
	await assert.rejects(checkTargets(project, config, 'missing'), /Unknown lint target/);
	const cli = (...args: string[]) => spawnSync(process.execPath, [path.resolve('dist/cli.cjs'), ...args, '--root', root], { encoding: 'utf8' });
	assert.equal(cli('check', '--target', 'match').status, 0);
	const all = cli('check', '--all-targets', '--format', 'json');
	assert.equal(all.status, 1); assert.equal(JSON.parse(all.stdout).diagnostics[0].lintTarget, 'lobby');
	assert.equal(cli('check', '--target', 'match', '--all-targets').status, 2);
	assert.equal(cli('dev').status, 2);
	assert.equal(cli('watch', '--port', '34872').status, 2);
});

test('automatic membership excludes unmounted files and empty includes opt out of reporting', async t => {
	const { project, config } = await fixture(t);
	const automatic = { ...config, lint: { targets: { match: { projectFile: 'places/match.project.json' } } } };
	assert.equal((await checkTargets(project, automatic)).files, 2);
	assert.equal((await checkTargets(project, { ...config, lint: { targets: { match: { ...config.lint.targets.match, includeGlobs: [] } } } })).files, 0);
});

test('target caches update shared files without filesystem rescans and clear removed target diagnostics', async t => {
	const { project, config } = await fixture(t);
	const calls: string[] = [];
	const counted: ProjectFs = { ...project,
		read: p => { calls.push('read:' + p); return project.read(p); },
		entries: p => { calls.push('entries:' + p); return project.entries(p); },
		exists: p => { calls.push('exists:' + p); return project.exists(p); },
	};
	const linter = new TargetLinter(counted);
	assert.equal((await linter.refresh({})).get('common/Use.luau')?.diagnostics[0].lintTarget, 'lobby');
	calls.length = 0;
	const changed = await linter.refresh({ files: ['common/Use.luau'] }, new Map([['common/Use.luau', 'return {}']]));
	assert.deepEqual(changed.get('common/Use.luau')?.diagnostics, []);
	assert.deepEqual(calls, []);
	await linter.refresh({ files: ['common/Use.luau'] });
	await project.write('capataz.config.json', configFileText({ ...config, lint: { targets: { match: config.lint.targets.match } } }));
	assert.deepEqual((await linter.refresh({ rebuild: true })).get('common/Use.luau')?.diagnostics, []);
});

test('project mappings determine module side instead of source directory names', async t => {
	const { project, config } = await fixture(t);
	await project.write('src/Core/Server/Moved.luau', 'return require(game:GetService("ServerScriptService").Secret)');
	await project.write('deps/Secret.luau', 'return {}');
	await project.write('places/match.project.json', JSON.stringify({ tree: {
		ReplicatedStorage: { Moved: { $path: '../src/Core/Server/Moved.luau' } },
		ServerScriptService: { Secret: { $path: '../deps/Secret.luau' } },
	} }));
	const result = await checkTargets(project, { ...config, lint: { targets: { match: { projectFile: 'places/match.project.json' } } } });
	assert.equal(result.diagnostics[0].code, 'cross-boundary');
});

test('invalid target config and missing mounts produce actionable errors', async t => {
	const { project, config } = await fixture(t);
	await project.write('capataz.config.json', configFileText({ ...config, lint: { targets: { broken: { projectFile: '../escape.project.json' } } } }));
	await assert.rejects(readConfig(project), /projectFile/);
	await project.write('places/match.project.json', JSON.stringify({ tree: { ReplicatedStorage: { X: { $path: '../missing' } } } }));
	await assert.rejects(checkTargets(project, config, 'match'), /\[match\].*Missing mount/);
});

test('excluded dependency edits invalidate included importers without a rescan', async t => {
	const { project, config } = await fixture(t);
	await project.write('deps/Factory.luau', 'return game:GetService("ReplicatedStorage").Target');
	await project.write('common/Use.luau', 'local target = require(game:GetService("ReplicatedStorage").Factory)\nreturn require(target)');
	await project.write('places/match.project.json', JSON.stringify({ tree: { ReplicatedStorage: {
		Common: { $path: '../common' }, Factory: { $path: '../deps/Factory.luau' }, Target: { $path: '../deps/Target.luau' },
	} } }));
	await project.write('capataz.config.json', configFileText({ ...config, lint: { targets: { match: config.lint.targets.match } } }));
	const linter = new TargetLinter(project);
	assert.deepEqual((await linter.refresh({})).get('common/Use.luau')?.diagnostics, []);
	const updates = await linter.refresh({ files: ['deps/Factory.luau'] }, new Map([['deps/Factory.luau', 'return game:GetService("ReplicatedStorage").Missing']]));
	assert.equal(updates.get('common/Use.luau')?.diagnostics[0].code, 'unresolved-require');
	assert.equal(updates.has('deps/Factory.luau'), false);
});

test('nested project mounts resolve relative to their own project and reject cycles', async t => {
	const { project, config } = await fixture(t);
	await project.write('places/shared/common.project.json', JSON.stringify({ tree: { $path: '../../common' } }));
	await project.write('places/match.project.json', JSON.stringify({ tree: { ReplicatedStorage: {
		Common: { $path: 'shared/common.project.json' }, Target: { $path: '../deps/Target.luau' },
	} } }));
	assert.deepEqual((await checkTargets(project, config, 'match')).diagnostics, []);
	await project.write('places/shared/common.project.json', JSON.stringify({ tree: { $path: '../match.project.json' } }));
	await assert.rejects(checkTargets(project, config, 'match'), /Cyclic project mount/);
});

test('places share external Core and resolve identically named systems from separate source roots', async t => {
	const { project, config } = await fixture(t);
	await project.write('shared/Core/Use.luau', 'return require(game:GetService("ReplicatedStorage").Systems.PlayerSystem.Shared.State)');
	for (const name of ['lobby', 'match'] as const) {
		config.lint.targets[name].includeGlobs = ['shared/**', `places/${name}/**`];
		await project.write(`places/${name}/src/Systems/PlayerSystem/Shared/State.luau`, 'return {}');
		await project.write(`places/${name}.project.json`, JSON.stringify({ tree: {
			ReplicatedStorage: { Core: { $path: '../shared/Core' }, Systems: { $path: `${name}/src/Systems` } },
		} }));
	}
	const result = await checkTargets(project, config);
	assert.deepEqual(result.diagnostics, []);
	for (const name of ['lobby', 'match']) {
		assert.ok(result.dependencies.some(edge => edge.file === 'shared/Core/Use.luau' && edge.lintTarget === name && edge.target === `places/${name}/src/Systems/PlayerSystem/Shared/State.luau`));
	}
});
