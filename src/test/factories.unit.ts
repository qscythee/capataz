import { test, TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { CapatazTreeNode } from '../config';
import { nodeFs, ProjectFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { configFileText, readConfig } from '../core/project';
import { checkProject } from '../lint/check';
import { IncrementalLinter } from '../lint/incremental';

const factory = 'lib/Factory.luau';
const client = 'src/Systems/Example/Client/Main.luau';
const server = 'src/Systems/Example/Server/Main.luau';
const shared = 'src/Systems/Example/Shared/Main.luau';
const preamble = 'local RS = game:GetService("ReplicatedStorage")\nlocal C = require(RS.Core.Shared.CustomRequirer)\n';
const source = preamble + `
local roots = { Packages = RS.Packages }
local run = game:GetService("RunService")
local result
if run:IsClient() then
  result = C.new({ Ancestors = roots, CaseSensitive = true })
else
  roots.ServerPackages = game:GetService("ServerStorage").ServerPackages
  result = C.new({ Ancestors = roots, CaseSensitive = true,
    RootResolver = function(alias: string, segments: {string}, context: Instance): (Instance?, number?)
      local key = string.lower(alias)
      if key == "switched" and string.lower(segments[1] or "") == "server" then
        return game:GetService("ServerStorage").ServerPackages, 1
      end
      return nil
    end,
  })
end
return result
`;
const use = (specifier: string, name = 'Factory') => 'local r = require(game:GetService("ReplicatedStorage").Tools.' + name + ')(script)\nreturn r("' + specifier + '")';
async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-factories-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root), config = structuredClone(starterConfig);
	const rs = config.tree.ReplicatedStorage as CapatazTreeNode;
	rs.Tools = { $path: 'lib' }; rs.Packages = { $path: 'deps/shared' };
	config.tree.ServerStorage = { ServerPackages: { $path: 'deps/server' } };
	config.lint = { ignoreGlobs: ['deps/**'] };
	await project.write(factory, source);
	await project.write('src/Core/Shared/CustomRequirer/init.luau', 'return {}');
	await project.write('deps/shared/RailUtil.luau', 'return require("./missing")');
	await project.write('deps/server/Target.luau', 'return {}');
	await project.write(client, use('@Packages/RailUtil'));
	await project.write(server, use('@ServerPackages/Target'));
	await project.write(shared, use('@Packages/RailUtil'));
	await project.write('capataz.config.json', configFileText(config));
	return { project, config };
}

test('infers aliases from actual factories outside Core/Systems, with separate client/server exports', async t => {
	const { project, config } = await fixture(t);
	let result = await checkProject(project, config);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.dependencies.find(d => d.file === client && d.custom)?.target, 'deps/shared/RailUtil.luau');
	assert.equal(result.dependencies.find(d => d.file === server && d.custom)?.target, 'deps/server/Target.luau');
	await project.write(client, use('@ServerPackages/Target'));
	await project.write(server, use('@Switched/Server/Target'));
	result = await checkProject(project, config);
	assert.deepEqual(result.diagnostics.map(d => [d.file, d.code]), [[client, 'unresolved-require']]);
	assert.equal(result.dependencies.find(d => d.file === server && d.custom)?.target, 'deps/server/Target.luau');
	await project.write(client, 'local RunService = game:GetService("RunService")\nif RunService:IsServer() then ' + use('@ServerPackages/Target') + ' end');
	assert.deepEqual((await checkProject(project, config)).diagnostics, []);
});

test('factories with identical alias names remain independent; .luaurc and directory names do not grant custom aliases', async t => {
	const { project, config } = await fixture(t);
	await project.write('lib/Other.luau', preamble + 'return C.new({Ancestors = { Packages = game:GetService("ServerStorage").ServerPackages }, CaseSensitive = true})');
	await project.write(client, use('@Packages/Target', 'Other'));
	let result = await checkProject(project, config);
	assert.deepEqual(result.diagnostics.map(d => d.code), ['cross-boundary']);
	await project.write('.luaurc', '{"aliases":{"Tools":"lib","Missing":"deps/shared"}}');
	await project.write(client, use('@Tools/Factory'));
	result = await checkProject(project, config);
	assert.ok(result.diagnostics.some(d => d.file === client && d.code === 'unresolved-require'));
	await project.write(client, use('@Missing/RailUtil'));
	assert.ok((await checkProject(project, config)).diagnostics.some(d => d.file === client && d.code === 'unresolved-require'));
	await project.write(client, 'return require("@Missing/RailUtil")');
	assert.deepEqual((await checkProject(project, config)).diagnostics, []);
});

test('dynamic resolvers warn instead of claiming a valid module is missing; known missing targets still error', async t => {
	const { project, config } = await fixture(t);
	await project.write(factory, preamble + 'return C.new({ Ancestors = {Packages = RS.Packages}, RootResolver = function(alias) if runtimeDecision(alias) then return RS.Tools, 0 end return nil end })');
	const result = await checkProject(project, config);
	assert.ok(result.diagnostics.filter(d => d.file === client).some(d => d.code === 'dynamic-require'));
	assert.ok(!result.diagnostics.some(d => d.file === client && d.code === 'unresolved-require'));
	await project.write(factory, source); await project.write(client, use('@Packages/Missing'));
	assert.equal((await checkProject(project, config)).diagnostics.find(d => d.file === client)?.code, 'unresolved-require');
});

test('explicit overrides are scoped to factory and runtime, retaining boundary errors', async t => {
	const { project, config } = await fixture(t);
	await project.write(factory, preamble + 'return C.new({Ancestors = getRoots(), RootResolver = getResolver()})');
	config.lint = { ...config.lint, importFactories: { [factory]: {
		client: { aliases: { Packages: 'ReplicatedStorage/Packages' } },
		server: { aliases: { ServerPackages: 'ServerStorage/ServerPackages', Packages: 'ReplicatedStorage/Packages' } },
	} } };
	let result = await checkProject(project, config);
	assert.ok(!result.diagnostics.some(d => [client, server, shared].includes(d.file)));
	config.lint.importFactories![factory].client!.aliases.Packages = 'ServerStorage/ServerPackages';
	await project.write(client, use('@Packages/Target'));
	result = await checkProject(project, config);
	assert.equal(result.diagnostics.find(d => d.file === client)?.code, 'cross-boundary');
	await project.write('capataz.config.json', configFileText(config));
	assert.deepEqual((await readConfig(project)).lint, config.lint);
});

test('incremental factory changes recheck transitive callers, preserve no-op dependencies and avoid unrelated reads', async t => {
	const { project } = await fixture(t);
	await project.write('lib/Wrapper.luau', 'return require(game:GetService("ReplicatedStorage").Tools.Factory)');
	await project.write(client, use('@Packages/RailUtil', 'Wrapper'));
	const unrelated = 'src/Systems/Example/Client/Unrelated.luau'; await project.write(unrelated, 'return {}');
	const reads: string[] = [];
	const counted: ProjectFs = { ...project, read: p => { reads.push(p); return project.read(p); } };
	const linter = new IncrementalLinter(counted); await linter.refresh({});
	assert.equal((await linter.refresh({files: [client]}, new Map([[client, use('@Packages/RailUtil', 'Wrapper')]]))).size, 0);
	reads.length = 0;
	const overlay = source.replace('Packages = RS.Packages', 'Packages = RS.Tools');
	let updates = await linter.refresh({ files: [factory] }, new Map([[factory, overlay]]));
	assert.equal(updates.get(client)?.diagnostics[0]?.code, 'unresolved-require');
	assert.ok(!updates.has(unrelated)); assert.ok(!reads.includes(unrelated));
	updates = await linter.refresh({ files: [factory] });
	assert.deepEqual(updates.get(client)?.diagnostics, []);
	await project.write(factory, overlay);
	updates = await linter.refresh({ files: [factory] });
	assert.equal(updates.get(client)?.diagnostics[0]?.code, 'unresolved-require');
});

test('cyclic module exports terminate without inventing aliases', async t => {
	const { project, config } = await fixture(t);
	await project.write(factory, 'return require(game:GetService("ReplicatedStorage").Tools.Other)');
	await project.write('lib/Other.luau', 'return require(game:GetService("ReplicatedStorage").Tools.Factory)');
	const result = await checkProject(project, config);
	assert.ok(!result.dependencies.some(d => d.custom && d.target));
});

test('malformed factory declarations are rejected', async t => {
	const { project, config } = await fixture(t);
	for (const declaration of [null, [], {'../Factory.luau': {client: {aliases: {}}}}, {[factory]: {shared: {aliases: {}}}}, {[factory]: {client: {aliases: {'@Packages': 'ReplicatedStorage/Packages'}}}}, {[factory]: {client: {aliases: {Packages: 'deps/shared'}}}}]) {
		await project.write('capataz.config.json', configFileText({...config, lint: {importFactories: declaration as never}}));
		await assert.rejects(readConfig(project), /[Ff]actory|importFactories/);
	}
});
test('runtime if expressions, native factory imports and case-sensitive targets preserve their semantics', async t => {
	const { project, config } = await fixture(t);
	await project.write(factory, preamble + 'local run = game:GetService("RunService")\nreturn if run:IsClient() then C.new({Ancestors = {Packages = RS.Packages}, CaseSensitive = true}) else C.new({Ancestors = {ServerPackages = game:GetService("ServerStorage").ServerPackages}, CaseSensitive = true})');
	await project.write(shared, 'return {}');
	await project.write('.luaurc', '{"aliases":{"Tools":"lib"}}');
	await project.write(client, 'local r = require("@Tools/Factory")(script) return r("@packages/RailUtil")');
	assert.deepEqual((await checkProject(project, config)).diagnostics, []);
	await project.write(client, use('@Packages/railutil'));
	assert.equal((await checkProject(project, config)).diagnostics.find(d => d.file === client)?.code, 'unresolved-require');
	await project.write(client, use('@ServerPackages/Target'));
	assert.equal((await checkProject(project, config)).diagnostics.find(d => d.file === client)?.code, 'unresolved-require');
});

test('unknown mutations and unknown ancestor values do not manufacture missing-target errors', async t => {
	const { project, config } = await fixture(t);
	await project.write(factory, preamble + 'local roots = { Packages = RS.Packages } mutate(roots) return C.new({Ancestors = roots})');
	let result = await checkProject(project, config);
	assert.equal(result.diagnostics.find(d => d.file === client)?.code, 'dynamic-require');
	await project.write(factory, preamble + 'return C.new({Ancestors = {Packages = getRoot()}})');
	result = await checkProject(project, config);
	assert.equal(result.diagnostics.find(d => d.file === client)?.code, 'dynamic-require');
});