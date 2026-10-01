import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { analyzeSource } from '../lint/analyze';
import { ModuleInfo, ProjectIndex } from '../lint/index';

const modules: ModuleInfo[] = [
	{ file: 'src/Import.luau', instance: 'ReplicatedStorage/Import', module: true },
	{ file: 'src/Core/Shared/CustomRequirer/init.luau', instance: 'ReplicatedStorage/Core/Shared/CustomRequirer', side: 'Shared', module: true },
	...(['Client', 'Server', 'Shared'] as const).map(side => ({ file: `src/Systems/TestSystem/${side}/Main.luau`, instance: `${side === 'Server' ? 'ServerScriptService' : 'ReplicatedStorage'}/Systems/TestSystem/${side}/Main`, side, module: true })),
];
const index: ProjectIndex = { modules: new Map(modules.map(m => [m.file, m])), instances: new Map(modules.map(m => [m.instance, m])), aliases: { Systems: 'src/Systems' }, config: { tree: {} } };
const check = (source: string, side = 'Client') => analyzeSource(source, index, modules.find(m => m.side === side && m.file.includes('Systems'))!);
const prefix = 'local factory = require(game:GetService("ReplicatedStorage"):WaitForChild("Import"))\n';

test('tracks custom factory, reassigned require, copies, multiline and constant paths', () => {
	const result = check(prefix + 'require = factory(script)\nlocal copied = require\nlocal side = "Server"\nlocal x = copied(\n "@Systems/TestSystem/" .. side .. "/Main"\n)');
	assert.equal(result.diagnostics.filter(d => d.code === 'cross-boundary').length, 1);
	assert.equal(result.dependencies.at(-1)?.custom, true);
});
test('detects chained requireFrom and server to client policy', () => {
	const result = check('local requireFrom = require(game:GetService("ReplicatedStorage").Import)(script)\nrequireFrom("@Systems/TestSystem/Client/Main")', 'Server');
	assert.equal(result.diagnostics[0]?.code, 'cross-boundary');
	assert.equal(result.diagnostics[0]?.severity, 'warning');
	assert.match(result.diagnostics[0]?.message ?? '', /discouraged/);
	assert.equal(check('require("@Systems/TestSystem/Server/Main")').diagnostics[0]?.severity, 'error');
});
test('shared cannot import either runtime side; same side and Shared work', () => {
	assert.equal(check(prefix + 'local r = factory(script)\nr("@Systems/TestSystem/Server/Main")', 'Shared').diagnostics[0]?.code, 'cross-boundary');
	assert.deepEqual(check(prefix + 'local r = factory(script)\nr("@Systems/TestSystem/Shared/Main")\nr("./Main")').diagnostics, []);
});
test('comments, strings, local shadowing and parameter shadowing are ignored', () => {
	const source = prefix + '-- require("@Systems/TestSystem/Server/Main")\nlocal text = [=[ require("bad") ]=]\ndo local require = function(x) return x end; require("bad") end\nlocal function f(require) require("bad") end\nlocal r = factory(script)\nr("@Systems/TestSystem/Shared/Main")';
	assert.deepEqual(check(source).diagnostics, []);
});
test('Instance requires, native aliases and missing targets are checked', () => {
	assert.equal(check('local s = game:GetService("ServerScriptService")\nrequire(s.Systems.TestSystem.Server.Main)').diagnostics[0]?.code, 'cross-boundary');
	assert.equal(check('require("@Systems/TestSystem/Server/Main")').diagnostics[0]?.code, 'cross-boundary');
	assert.equal(check('require("@Systems/TestSystem/Shared/Missing")').diagnostics[0]?.code, 'unresolved-require');
});
test('custom new with literal Ancestors is detected without relying on variable names', () => {
	const source = 'local C = require(game:GetService("ReplicatedStorage").Core.Shared.CustomRequirer)\nlocal maker = C.new({ Ancestors = { Systems = game:GetService("ServerScriptService").Systems } })\nlocal r = maker(script)\nr("@Systems/TestSystem/Server/Main")';
	assert.equal(check(source).diagnostics[0]?.code, 'cross-boundary');
});
test('unknown paths warn and factory bindings survive enclosing function analysis', () => {
	const source = prefix + 'local r = factory(script)\nlocal function f() r = function() end end\nr("@Systems/TestSystem/Server/Main")\nr(getPath())';
	assert.deepEqual(check(source).diagnostics.map(d => d.code), ['cross-boundary', 'dynamic-require']);
});
test('conditional bindings and Luau if expressions retain unsafe alternatives', () => {
	const conditional = prefix + 'local r\nif flag then r = factory(script) else r = require end\nr("@Systems/TestSystem/Server/Main")';
	assert.ok(check(conditional).diagnostics.some(d => d.code === 'cross-boundary'));
	const expression = prefix + 'local r = factory(script)\nlocal target = if flag then "@Systems/TestSystem/Shared/Main" else "@Systems/TestSystem/Server/Main"\nr(target)';
	assert.ok(check(expression).diagnostics.some(d => d.code === 'cross-boundary'));
});
test('do scopes preserve outer assignments and loops retain possibly unsafe bindings', () => {
	assert.ok(check(prefix + 'local r\ndo r = factory(script) end\nr("@Systems/TestSystem/Server/Main")').diagnostics.some(d => d.code === 'cross-boundary'));
	assert.ok(check(prefix + 'local r\nfor i = 1, 2 do r = factory(script) end\nr("@Systems/TestSystem/Server/Main")').diagnostics.some(d => d.code === 'cross-boundary'));
});
test('warning suppression requires a reason and never suppresses boundary errors', () => {
	assert.equal(check('-- capataz-ignore dynamic-require: computed runtime target\nrequire(getTarget())').diagnostics.length, 0);
	assert.equal(check('-- capataz-ignore cross-boundary: invalid exception\nrequire("@Systems/TestSystem/Server/Main")').diagnostics[0]?.code, 'cross-boundary');
});
test('table member assignment tracks custom imports; generic function parameters shadow builtins', () => {
	const source = prefix + 'local helpers = {}\nhelpers.import = factory(script)\nhelpers["import"]("@Systems/TestSystem/Server/Main")\nlocal function identity<T>(require: T) require("ignored") end';
	assert.deepEqual(check(source).diagnostics.map(d => d.code), ['cross-boundary']);
});
test('custom new honors case sensitivity and does not pretend arbitrary RootResolver callbacks are static', () => {
	const source = 'local C = require(game:GetService("ReplicatedStorage").Core.Shared.CustomRequirer)\nlocal r = C.new({Ancestors = { Systems = game:GetService("ServerScriptService").Systems }})(script)\nr("@systems/testsystem/server/main")';
	assert.equal(check(source).diagnostics[0]?.code, 'cross-boundary');
	const dynamic = 'local C = require(game:GetService("ReplicatedStorage").Core.Shared.CustomRequirer)\nlocal r = C.new({Ancestors = {}, RootResolver = function() return game:GetService("ServerScriptService"), 0 end})(script)\nr("@any/Module")';
	assert.deepEqual(check(dynamic).diagnostics.map(d => d.code), ['dynamic-requirer', 'dynamic-require']);
});
