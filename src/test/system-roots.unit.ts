import { test, TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { CapatazConfig } from '../config';
import { nodeFs } from '../core/fs';
import { configFileText, readConfig, newSystem, generate, projectIssues } from '../core/project';
import { initialize } from '../core/init';
import { layouts, selectLayout, selectSystemRoot } from '../core/layout';
import { checkTargets } from '../lint/targets';

async function fixture(t: TestContext) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-roots-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	const mounts = (prefix: string) => ({ Client: `ReplicatedStorage/${prefix}`, Shared: `ReplicatedStorage/${prefix}`, Server: `ServerScriptService/${prefix}` });
	const config: CapatazConfig = {
		emitLegacyScripts: false, projectFile: 'Places/Lobby.project.json',
		systemRoots: { universal: 'Universal/Systems', lobby: 'Places/Lobby/Features', match: 'Places/Match/Features' },
		projects: {
			lobby: { projectFile: 'Places/Lobby.project.json', systemMounts: { universal: mounts('Universal/Features'), lobby: mounts('Local/Features') } },
			match: { projectFile: 'Places/Match.project.json', systemMounts: { universal: mounts('Universal/Features'), match: mounts('Local/Features') }, tree: { ReplicatedStorage: { PlaceCore: { $path: 'Places/Match/Core' } } } },
		},
		tree: { $className: 'DataModel', ReplicatedStorage: { $className: 'ReplicatedStorage', Universal: { Core: { $path: 'Universal/Core' } } } },
		lint: { requirerModules: ['Universal/Core/CustomRequirer/init.luau'] },
	};
	await project.write('capataz.config.json', configFileText(config));
	await project.write('Universal/Core/CustomRequirer/init.luau', await fs.readFile('templates/src/Core/Shared/CustomRequirer/init.luau', 'utf8'));
	await project.write('Universal/Core/Import.luau', 'local RS = game:GetService("ReplicatedStorage") return require(RS.Universal.Core.CustomRequirer).new({ Ancestors = {}, SystemRoots = require(RS.CapatazSystemRoutes), CaseSensitive = true })');
	await project.write('Places/Match/Core/Utility.luau', 'return {}');
	for (const layout of layouts(config)) { await initialize(project, nodeFs(path.resolve('templates')), layout.projectFile); }
	return { root, project, config: await readConfig(project) };
}

test('explicit roots share Universal systems across places without imposing a Core or source structure', async t => {
	const { root, project, config } = await fixture(t);
	const lobby = selectLayout(config, 'Places/Lobby.project.json'), match = selectLayout(config, 'Places/Match.project.json');
	await newSystem(project, selectSystemRoot(lobby, 'universal'), 'Player');
	await newSystem(project, selectSystemRoot(lobby, 'lobby'), 'Player');
	await newSystem(project, selectSystemRoot(match, 'match'), 'Player');
	assert.equal(await project.exists('src'), false);
	for (const file of ['Places/Lobby.project.json', 'Places/Match.project.json']) {
		const generated = JSON.parse(await project.read(file));
		assert.equal(generated.tree.ReplicatedStorage.Core, undefined);
		assert.equal(generated.tree.ReplicatedFirst, undefined);
		assert.equal(generated.tree.ReplicatedStorage.Universal.Core.$path, '../Universal/Core');
		assert.equal(generated.tree.ReplicatedStorage.Universal.Features.PlayerSystem.Shared.$path, '../Universal/Systems/PlayerSystem/Shared');
		assert.equal(generated.systemRoots, undefined); assert.equal(generated.systemMounts, undefined);
		assert.deepEqual(await projectIssues(project, selectLayout(config, file)), []);
	}
	await project.write('Universal/Systems/PlayerSystem/Shared/State.luau', 'return {}');
	await project.write('Universal/Systems/PlayerSystem/Server/Secret.luau', 'return {}');
	await project.write('Places/Lobby/Features/PlayerSystem/Client/Use.luau', 'local r = require(game:GetService("ReplicatedStorage").Universal.Core.Import)(script) return r("@universal/PlayerSystem/Shared/State")');
	assert.deepEqual((await checkTargets(project, config)).diagnostics, []);
	await project.write('Places/Lobby/Features/PlayerSystem/Client/Use.luau', 'local r = require(game:GetService("ReplicatedStorage").Universal.Core.Import)(script) return r("@universal/PlayerSystem/Server/Secret")');
	assert.ok((await checkTargets(project, config)).diagnostics.some(issue => issue.lintTarget === 'lobby' && issue.code === 'cross-boundary'));
	const cli = (...args: string[]) => spawnSync(process.execPath, [path.resolve('dist/cli.cjs'), ...args, '--root', root], { encoding: 'utf8', timeout: 15000 });
	assert.equal(cli('system', 'new', 'Ambiguous', '--target', 'lobby').status, 2);
	const removed = cli('system', 'remove', 'Player', '--target', 'lobby', '--systems-root', 'universal', '--yes');
	assert.equal(removed.status, 0, removed.stderr);
	assert.equal(await project.exists('Universal/Systems/PlayerSystem'), false);
	assert.ok(await project.exists('Places/Lobby/Features/PlayerSystem'));
	assert.ok(await project.exists('Places/Match/Features/PlayerSystem'));
	for (const file of ['Places/Lobby.project.json', 'Places/Match.project.json']) { assert.equal(JSON.parse(await project.read(file)).tree.ReplicatedStorage.Universal.Features.PlayerSystem, undefined); }
});

test('explicit mapping rejects destination collisions without overwriting authored nodes', async t => {
	const { project, config } = await fixture(t);
	const lobby = selectLayout(config, 'Places/Lobby.project.json');
	await newSystem(project, selectSystemRoot(lobby, 'universal'), 'Player');
	await newSystem(project, selectSystemRoot(lobby, 'lobby'), 'Player');
	config.projects!.lobby.systemMounts!.lobby = config.projects!.lobby.systemMounts!.universal;
	await assert.rejects(generate(project, selectLayout(config)), /collision/);
});

test('explicit root configuration rejects overlapping directories and unknown roots', async t => {
	const { project, config } = await fixture(t);
	config.systemRoots!.lobby = 'Universal/Systems/Nested';
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(readConfig(project), /must not overlap/);
	config.systemRoots!.lobby = 'Places/Lobby/Features';
	config.projects!.lobby.systemMounts!.missing = { Shared: 'ReplicatedStorage/Other' };
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(readConfig(project), /Invalid systemMounts/);
});

test('real Rojo reads explicitly mapped Universal and place systems', { skip: !process.env.ROJO_BIN }, async t => {
	const { root, project, config } = await fixture(t);
	await newSystem(project, selectSystemRoot(selectLayout(config), 'universal'), 'Player');
	await project.write('Universal/Systems/PlayerSystem/Shared/State.luau', 'return {}');
	for (const layout of layouts(config)) {
		const result = spawnSync(process.env.ROJO_BIN!, ['sourcemap', layout.projectFile!], { cwd: root, encoding: 'utf8', timeout: 15000 });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Universal/); assert.match(result.stdout, /State/);
	}
});

test('actual Luau importer routes distinct aliases to shared and place-owned roots', { skip: !process.env.LUNE_BIN }, async t => {
	const { root, project, config } = await fixture(t);
	const lobby = selectLayout(config);
	await newSystem(project, selectSystemRoot(lobby, 'universal'), 'Player');
	await newSystem(project, selectSystemRoot(lobby, 'lobby'), 'Player');
	const importer = await fs.readFile('templates/src/Core/Shared/CustomRequirer/init.luau', 'utf8');
	const routes = await project.read('.capataz/generated/Places/Lobby.project.json/SystemRoutes.luau');
	const script = `
local nativeTypeof = typeof
local typeof = function(value) return if type(value) == "table" and value.ClassName then "Instance" else nativeTypeof(value) end
local require = function(value) return value.Payload end
local function instance(name, parent)
 local self = { Name = name, ClassName = "Folder", Parent = parent, Children = {} }
 function self:FindFirstChild(key) return self.Children[key] end
 function self:GetChildren() local result = {} for _, child in self.Children do table.insert(result, child) end return result end
 function self:IsA(class) return self.ClassName == class end
 function self:GetFullName() return self.Name end
 self.ChildAdded = { Connect = function() end }; self.ChildRemoved = self.ChildAdded
 if parent then parent.Children[name] = self end
 return self
end
local services = { ReplicatedStorage = instance("ReplicatedStorage"), ServerScriptService = instance("ServerScriptService") }
local game = { GetService = function(_, key) return assert(services[key]) end }
local function mount(service, path, value)
 local current = services[service]
 for segment in string.gmatch(path, "[^/]+") do current = current:FindFirstChild(segment) or instance(segment, current) end
 current.ClassName = "ModuleScript"; current.Payload = value
 return current
end
local context = mount("ReplicatedStorage", "Local/Features/PlayerSystem/Client/Caller", {})
mount("ReplicatedStorage", "Universal/Features/PlayerSystem/Shared/State", "shared")
mount("ReplicatedStorage", "Local/Features/PlayerSystem/Shared/State", "local")
mount("ServerScriptService", "Universal/Features/PlayerSystem/Server/State", "server")
local CustomRequirer = (function()\n${importer}\nend)()
local Routes = (function()\n${routes}\nend)()
local r = CustomRequirer.new({ Ancestors = {}, SystemRoots = Routes, CaseSensitive = true })(context)
assert(r("@universal/PlayerSystem/Shared/State") == "shared")
assert(r("@lobby/PlayerSystem/Shared/State") == "local")
assert(r("@universal/PlayerSystem/Server/State") == "server")
print("Mapped runtime roots verified")
`;
	await project.write('runtime.luau', script);
	const result = spawnSync(process.env.LUNE_BIN!, ['run', 'runtime.luau'], { cwd: root, encoding: 'utf8', timeout: 15000 });
	assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('new-system collisions are rejected before any source mutation', async t => {
	const { project, config } = await fixture(t);
	const lobby = selectLayout(config);
	await newSystem(project, selectSystemRoot(lobby, 'universal'), 'Player');
	config.projects!.lobby.systemMounts!.lobby = config.projects!.lobby.systemMounts!.universal;
	await project.write('capataz.config.json', configFileText(config));
	await assert.rejects(newSystem(project, selectSystemRoot(selectLayout(config), 'lobby'), 'Player'), /collision/);
	assert.equal(await project.exists('Places/Lobby/Features/PlayerSystem'), false);
});

test('route metadata can be placed explicitly or left unmounted', async t => {
	const { project, config } = await fixture(t);
	config.projects!.lobby.routeModule = 'ReplicatedStorage/Universal/Routes';
	await generate(project, selectLayout(config));
	let generated = JSON.parse(await project.read('Places/Lobby.project.json'));
	assert.ok(generated.tree.ReplicatedStorage.Universal.Routes.$path);
	assert.equal(generated.tree.ReplicatedStorage.CapatazSystemRoutes, undefined);
	config.projects!.lobby.routeModule = false;
	await generate(project, selectLayout(config));
	generated = JSON.parse(await project.read('Places/Lobby.project.json'));
	assert.equal(generated.tree.ReplicatedStorage.Universal.Routes, undefined);
	assert.equal(generated.tree.ReplicatedStorage.CapatazSystemRoutes, undefined);
});
