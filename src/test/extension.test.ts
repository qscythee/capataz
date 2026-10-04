import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { initializeProject } from '../commands/init';

const extensionUri = vscode.Uri.file(path.resolve(__dirname, '../..'));
const output = vscode.window.createOutputChannel('Capataz Tests');

async function read(root: vscode.Uri, relative: string): Promise<string> {
	return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, relative))).toString('utf8');
}

suite('Capataz init', () => {
	let root: vscode.Uri;

	setup(async () => {
		root = vscode.Uri.file(await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-test-')));
	});

	teardown(async () => {
		await vscode.workspace.fs.delete(root, { recursive: true });
	});

	test('creates a usable feature project and can run twice', async () => {
		await initializeProject(root, output, extensionUri);
		const config = JSON.parse(await read(root, 'capataz.config.json'));
		const project = JSON.parse(await read(root, 'default.project.json'));
		const luaurc = JSON.parse(await read(root, '.luaurc'));
		assert.strictEqual(config.project.systemsDir, 'src/Systems');
		assert.strictEqual(config.project.emitLegacyScripts, false);
		assert.strictEqual(config.project.tree.ReplicatedStorage.Core.Client.$path, 'src/Core/Client');
		assert.strictEqual(config.project.tree.ReplicatedFirst.Core.First.$path, 'src/Core/First');
		assert.strictEqual(project.emitLegacyScripts, false);
		assert.strictEqual(project.tree.ReplicatedStorage.Client, undefined);
		assert.strictEqual(project.tree.ReplicatedStorage.Core.Client.$path, 'src/Core/Client');
		assert.strictEqual(project.tree.ReplicatedFirst.Core.First.$path, 'src/Core/First');
		assert.strictEqual(project.tree.ReplicatedStorage.Core.First, undefined);
		assert.strictEqual(project.tree.StarterPlayer, undefined);
		assert.deepStrictEqual(luaurc.aliases, { Core: 'src/Core/', Systems: 'src/Systems/' });
		assert.strictEqual(project.tree.ReplicatedStorage.Packages, undefined);
		assert.strictEqual(project.tree.ServerStorage, undefined);
		assert.doesNotMatch(await read(root, 'src/Import.luau'), /Packages|ServerPackages/);
		await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(root, 'Packages')));
		await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(root, 'ServerPackages')));
		assert.strictEqual(project.tree.ReplicatedStorage.Systems.GreetingSystem.Shared.$path, 'src/Systems/GreetingSystem/Shared');
		assert.strictEqual(project.tree.ServerScriptService.Systems.CounterSystem.Server.$path, 'src/Systems/CounterSystem/Server');
		assert.match(await read(root, 'src/Import.luau'), /RootResolver/);
		assert.match(await read(root, 'src/Core/Shared/CustomRequirer/init.luau'), /CustomRequirer\.new/);
		const clientBootstrap = await read(root, 'src/Core/Client/Bootstrap.client.luau');
		assert.match(clientBootstrap, /Controller/);
		assert.match(clientBootstrap, /controller\.Start\(\)/);
		assert.match(clientBootstrap, /GetDescendants\(\)/);
		const serverBootstrap = await read(root, 'src/Core/Server/Bootstrap.server.luau');
		assert.match(serverBootstrap, /Service/);
		assert.match(serverBootstrap, /service\.Start\(\)/);
		assert.match(serverBootstrap, /GetDescendants\(\)/);
		assert.deepStrictEqual(await initializeProject(root, output, extensionUri), []);
	});

	test('extends an existing src and preserves project settings and system files', async () => {
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'src/Systems/GreetingSystem/Client'));
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'src/Core/Client'));
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'src/Core/Server'));
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'src/Systems/GreetingSystem/Client/OwnController.luau'), Buffer.from('return {}\n'));
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'src/Core/Client/Bootstrap.client.luau'), Buffer.from('-- own client startup\n'));
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'src/Core/Server/Bootstrap.server.luau'), Buffer.from('-- own server startup\n'));
		const originalProject = {
			name: 'MyGame',
			emitLegacyScripts: true,
			tree: {
				$className: 'DataModel',
				Workspace: { $className: 'Workspace', Terrain: { $className: 'Terrain' } },
				ReplicatedStorage: { $className: 'ReplicatedStorage', Packages: { $path: 'Packages' } },
				ServerStorage: { $className: 'ServerStorage', ServerPackages: { $path: 'ServerPackages' } },
			},
		};
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'default.project.json'), Buffer.from(JSON.stringify(originalProject)));
		await initializeProject(root, output, extensionUri);
		const capatazConfig = JSON.parse(await read(root, 'capataz.config.json'));
		assert.strictEqual(capatazConfig.project.emitLegacyScripts, false);
		assert.strictEqual(capatazConfig.project.systemsDir, 'src/Systems');
		const project = JSON.parse(await read(root, 'default.project.json'));
		assert.strictEqual(project.name, 'MyGame');
		assert.strictEqual(project.emitLegacyScripts, false);
		assert.deepStrictEqual(project.tree.Workspace, originalProject.tree.Workspace);
		assert.deepStrictEqual(project.tree.ReplicatedStorage.Packages, originalProject.tree.ReplicatedStorage.Packages);
		assert.deepStrictEqual(project.tree.ServerStorage, originalProject.tree.ServerStorage);
		assert.strictEqual(project.tree.ReplicatedStorage.Core.$className, 'Folder');
		assert.strictEqual(project.tree.ReplicatedStorage.Client, undefined);
		assert.strictEqual(project.tree.ReplicatedStorage.Core.Client.$path, 'src/Core/Client');
		assert.strictEqual(project.tree.StarterPlayer, undefined);
		assert.strictEqual(await read(root, 'src/Systems/GreetingSystem/Client/OwnController.luau'), 'return {}\n');
		assert.strictEqual(project.tree.ReplicatedStorage.Systems.GreetingSystem.Client.$path, 'src/Systems/GreetingSystem/Client');
		assert.strictEqual(project.tree.ServerScriptService.Systems.CounterSystem.Server.$path, 'src/Systems/CounterSystem/Server');
		assert.strictEqual(await read(root, 'src/Core/Client/Bootstrap.client.luau'), '-- own client startup\n');
		assert.strictEqual(await read(root, 'src/Core/Server/Bootstrap.server.luau'), '-- own server startup\n');
	});

	test('adds bootstraps when an existing src has no Core or client folder', async () => {
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'src'));
		await initializeProject(root, output, extensionUri);
		assert.match(await read(root, 'src/Core/Client/Bootstrap.client.luau'), /Controller/);
		assert.strictEqual(
			await read(root, 'src/Core/Server/Bootstrap.server.luau'),
			await fs.readFile(path.join(extensionUri.fsPath, 'templates/src/Core/Server/Bootstrap.server.luau'), 'utf8'),
		);
	});
});
