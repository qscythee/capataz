import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createLintIgnore } from '../lint/ignore';
import { readConfig, configFileText } from '../core/project';
import { starterConfig } from '../core/init';
import { ProjectFs } from '../core/fs';

test('ignore globs match root, nested, hidden and Windows paths without overmatching', () => {
	const ignored = createLintIgnore(['**/Packages/**', '**/ServerPackages/**']);
	for (const file of ['Packages/A.luau', 'src/Packages/A.lua', 'ServerPackages/A.luau', 'Packages/.hidden/A.luau', 'src\\Packages\\A.luau']) { assert.ok(ignored(file), file); }
	for (const file of ['src/PackagesExtra/A.luau', 'src/Main.luau', 'src/Packages.luau']) { assert.ok(!ignored(file), file); }
	assert.ok(!createLintIgnore()('Packages/A.luau'));
	assert.ok(createLintIgnore(['./src/*.lua'])('src/A.lua'));
	assert.ok(!createLintIgnore(['src/*.lua'])('src/nested/A.lua'));
});

test('project config validates ignore glob arrays before optional rules', async () => {
	for (const ignoreGlobs of ['Packages/**', [123], [''], null]) {
		const config = { ...starterConfig, lint: { ignoreGlobs } };
		const fs = { exists: async () => true, read: async () => configFileText(config as typeof starterConfig) } as unknown as ProjectFs;
		await assert.rejects(readConfig(fs), /lint.ignoreGlobs/);
	}
	const config = { ...starterConfig, lint: { ignoreGlobs: ['**/Packages/**'] } };
	const fs = { exists: async () => true, read: async () => configFileText(config) } as unknown as ProjectFs;
	assert.deepEqual((await readConfig(fs)).lint, config.lint);
});
