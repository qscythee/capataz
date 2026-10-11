import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { nodeFs } from '../core/fs';
import { starterConfig } from '../core/init';
import { generate } from '../core/project';

const lune = process.env.LUNE_BIN;
test('actual Luau importer resolves nested generated routes and marked legacy boundaries', { skip: !lune && 'Set LUNE_BIN to run the Luau runtime regression' }, async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-requirer-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const project = nodeFs(root);
	await project.write('src/Systems/Players/First/Legacy/system.json', '{}');
	for (const route of ['Shared', 'Server', 'First', 'ReplicatedFirst']) {
		await project.write(`src/Systems/Players/First/Legacy/${route}/Target.luau`, 'return {}');
	}
	await project.write('src/Systems/Player/MovementSystem/Client/Target.luau', 'return {}');
	await project.write('src/Systems/FlatSystem/Server/Target.luau', 'return {}');
	await generate(project, { ...starterConfig, systemRoutes: { First: 'ReplicatedFirst' } });
	const importer = await fs.readFile('templates/src/Core/Shared/CustomRequirer/init.luau', 'utf8');
	const routes = await project.read('src/Core/Shared/CustomRequirer/SystemRoutes.luau');
	const harness = `
local nativeTypeof = typeof
local typeof = function(value)
   return if type(value) == "table" and value.ClassName then "Instance" else nativeTypeof(value)
end
local require = function(module) return module.Payload end
local function instance(name, className, parent)
   local self = { Name = name, ClassName = className, Parent = parent, Children = {} }
   function self:FindFirstChild(key) return self.Children[key] end
   function self:GetChildren()
      local result = {}
      for _, child in self.Children do table.insert(result, child) end
      return result
   end
   function self:IsA(class) return self.ClassName == class end
   function self:GetFullName() return self.Name end
   self.ChildAdded = { Connect = function() end }
   self.ChildRemoved = { Connect = function() end }
   if parent then parent.Children[name] = self end
   return self
end
local services = {}
local game = { GetService = function(_, name) return assert(services[name], name) end }
for _, name in { "ReplicatedStorage", "ServerScriptService", "ReplicatedFirst" } do
   services[name] = instance(name, name)
   instance("Systems", "Folder", services[name])
end
local function mount(service, names)
   local current = services[service].Children.Systems
   for _, name in names do current = current:FindFirstChild(name) or instance(name, "Folder", current) end
   local target = instance("Target", "ModuleScript", current)
   target.Payload = service .. "/" .. table.concat(names, "/")
   return target
end
local paths = {
   { "ReplicatedStorage", { "Players", "First", "Legacy", "Shared" } },
   { "ServerScriptService", { "Players", "First", "Legacy", "Server" } },
   { "ReplicatedFirst", { "Players", "First", "Legacy", "First" } },
   { "ReplicatedFirst", { "Players", "First", "Legacy", "ReplicatedFirst" } },
   { "ReplicatedStorage", { "Player", "MovementSystem", "Client" } },
   { "ServerScriptService", { "FlatSystem", "Server" } },
}
local targets = {}
for _, entry in paths do table.insert(targets, mount(entry[1], entry[2])) end
local CustomRequirer = (function()\n${importer}\nend)()
local routes = (function()\n${routes}\nend)()
local config = { Ancestors = { Systems = services.ReplicatedStorage.Children.Systems }, ServiceRoutes = routes, CaseSensitive = true }
local r = CustomRequirer.new(config)(targets[1])
for i, entry in paths do
   assert(r("@Systems/" .. table.concat(entry[2], "/") .. "/Target") == targets[i].Payload)
end
assert(r("@Systems/Players/First/Legacy/server/Target") == targets[2].Payload)
assert(r("./Target") == targets[1].Payload)
assert(not pcall(r, "@Systems/players/first/legacy/Server/Target"))
assert(not pcall(r, "@Systems/Players/First/Legacy/Server/Missing"))
config.CaseSensitive = false
local insensitive = CustomRequirer.new(config)(targets[1])
assert(insensitive("@systems/players/first/legacy/server/target") == targets[2].Payload)
-- Hand-authored pre-0.1.0 route tables retain their flat behavior.
config.ServiceRoutes = { server = { Service = "ServerScriptService", Name = "Server" } }
assert(CustomRequirer.new(config)(targets[1])("@Systems/FlatSystem/Server/Target") == targets[6].Payload)
print("nested importer runtime checks passed")
`;
	const file = path.join(root, 'requirer.luau');
	await fs.writeFile(file, harness);
	const result = spawnSync(lune!, ['run', file], { encoding: 'utf8', timeout: 15000, windowsHide: true });
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /runtime checks passed/);
});
