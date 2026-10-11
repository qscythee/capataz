import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { initializeProject } from '../commands/init';
import { runNewSystem } from '../commands/newSystem';
import { runDeleteSystem } from '../commands/deleteSystem';
import { editorFs } from '../editorFs';
import { configFileText, generate, readConfig } from '../core/project';
import { selectProjectOutput } from '../projectOutput';
import { explorerResourcePath, systemContextPaths } from '../systemContexts';

suite('Capataz nested system commands', () => {
	test('palette and context actions create and target full paths under a custom systems root', async function () {
		this.timeout(20000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri;
		assert.ok(root);
		const output = vscode.window.createOutputChannel('Capataz System Command Tests');
		await initializeProject(root, output, vscode.Uri.file(path.resolve(__dirname, '../..')));
		const project = editorFs(root), originalConfig = await project.read('capataz.config.json');
		const config = { ...await readConfig(project), systemsDir: 'command-test-features', projectFile: 'command-test-output/editor.project.json' };
		const quickPick = vscode.window.showQuickPick;
		let cancelProject = false, projectPrompts = 0;
		vscode.window.showQuickPick = (async () => { projectPrompts++; return cancelProject ? undefined : { label: config.projectFile }; }) as unknown as typeof quickPick;
		const input = vscode.window.showInputBox, warning = vscode.window.showWarningMessage;
		const information = vscode.window.showInformationMessage, error = vscode.window.showErrorMessage;
		let nextInput = '', lastPrompt = '', errors: string[] = [], confirmations: string[] = [];
		vscode.window.showInputBox = async options => { lastPrompt = options?.prompt ?? ''; assert.equal(await options?.validateInput?.(nextInput), undefined); return nextInput; };
		vscode.window.showInformationMessage = (async () => undefined) as typeof information;
		vscode.window.showErrorMessage = (async (message: string) => { errors.push(message); return undefined; }) as typeof error;
		vscode.window.showWarningMessage = (async (message: string) => { confirmations.push(message); return 'Delete'; }) as typeof warning;
		try {
			await project.mkdir(config.systemsDir);
			await project.write('capataz.config.json', configFileText(config));
			cancelProject = true; nextInput = 'Cancelled';
			await runNewSystem(output);
			assert.equal(await project.exists(`${config.systemsDir}/CancelledSystem`), false);
			cancelProject = false;
			nextInput = 'Player/PlayerController';
			await runNewSystem(output);
			assert.ok(await project.exists(`${config.systemsDir}/Player/PlayerControllerSystem/Client`));
			assert.ok(await project.exists(config.projectFile));
			nextInput = 'Abilities/Dash';
			const group = vscode.Uri.joinPath(root, config.systemsDir, 'Player');
			await runNewSystem(output, group);
			assert.match(lastPrompt, /relative to 'Player'/);
			assert.ok(await project.exists(`${config.systemsDir}/Player/Abilities/DashSystem/Server`));
			await project.mkdir(`${config.systemsDir}/EmptyGroup`);
			await project.write(`${config.systemsDir}/Player/Legacy/system.json`, '{}');
			await project.mkdir(`${config.systemsDir}/Player/Legacy/Shared`);
			const targets = await systemContextPaths(root, config);
			assert.ok(targets.groups.includes(explorerResourcePath(group)));
			assert.ok(targets.groups.includes(explorerResourcePath(vscode.Uri.joinPath(root, config.systemsDir, 'EmptyGroup'))));
			const controller = vscode.Uri.joinPath(group, 'PlayerControllerSystem');
			assert.ok(targets.systems.includes(explorerResourcePath(controller)));
			assert.ok(!targets.groups.includes(explorerResourcePath(controller)));
			assert.ok(!targets.groups.includes(explorerResourcePath(vscode.Uri.joinPath(controller, 'Client'))));
			assert.ok(targets.systems.includes(explorerResourcePath(vscode.Uri.joinPath(group, 'Legacy'))));
			await runNewSystem(output, controller);
			assert.match(errors.pop()!, /not inside another system/);
			await runDeleteSystem(output, group);
			assert.match(errors.pop()!, /not a grouping or route folder/);
			assert.equal(confirmations.length, 0);
			cancelProject = true;
			await runDeleteSystem(output, controller);
			assert.ok(await project.exists(`${config.systemsDir}/Player/PlayerControllerSystem`));
			assert.equal(confirmations.length, 0);
			cancelProject = false;
			await runDeleteSystem(output, controller);
			assert.match(confirmations[0], /Player\/PlayerControllerSystem/);
			assert.equal(await project.exists(`${config.systemsDir}/Player/PlayerControllerSystem`), false);
			assert.ok(await project.exists(`${config.systemsDir}/Player/Abilities/DashSystem`));
			await runDeleteSystem(output, vscode.Uri.joinPath(group, 'Legacy'));
			assert.equal(await project.exists(`${config.systemsDir}/Player/Legacy`), false);
			assert.deepEqual(errors, []);
			assert.ok(projectPrompts >= 5);
		} finally {
			vscode.window.showQuickPick = quickPick;
			vscode.window.showInputBox = input; vscode.window.showWarningMessage = warning;
			vscode.window.showInformationMessage = information; vscode.window.showErrorMessage = error;
			await project.write('capataz.config.json', originalConfig);
			await project.remove(config.systemsDir);
			await project.remove('command-test-output');
			await generate(project, await readConfig(project));
			output.dispose();
		}
	});
});

suite('Capataz project output selection', () => {
	test('prompts for multiple projects or missing default and keeps selection temporary', async () => {
		const workspace = vscode.workspace.workspaceFolders?.[0]?.uri; assert.ok(workspace);
		const root = vscode.Uri.joinPath(workspace, 'output-picker-test');
		const project = editorFs(root);
		const config = { systemsDir: 'src/Systems', tree: {} };
		const quickPick = vscode.window.showQuickPick;
		let prompts = 0, cancel = false;
		vscode.window.showQuickPick = (async (items: vscode.QuickPickItem[]) => {
			prompts++; assert.ok(items.some(item => item.label === 'default.project.json'));
			return cancel ? undefined : items.find(item => item.label === 'places/lobby.project.json');
		}) as unknown as typeof quickPick;
		try {
			await project.write('default.project.json', '{}');
			assert.equal(await selectProjectOutput(root, config), config);
			assert.equal(prompts, 0);
			await project.write('places/lobby.project.json', '{}');
			assert.equal((await selectProjectOutput(root, config))?.projectFile, 'places/lobby.project.json');
			assert.equal(prompts, 1);
			await project.remove('default.project.json');
			assert.equal((await selectProjectOutput(root, config))?.projectFile, 'places/lobby.project.json');
			assert.equal(prompts, 2);
			cancel = true; assert.equal(await selectProjectOutput(root, config), undefined);
			assert.equal('projectFile' in config, false);
		} finally {
			vscode.window.showQuickPick = quickPick;
			await vscode.workspace.fs.delete(root, { recursive: true });
		}
	});
});


suite('Capataz Explorer resource paths', () => {
	test('uses native filesystem paths for local Explorer resources and URI paths for remote resources', () => {
		const local = vscode.Uri.file(path.resolve('src/Systems'));
		assert.equal(explorerResourcePath(local), local.fsPath);
		if (process.platform === 'win32') { assert.notEqual(explorerResourcePath(local), local.path); }
		const remote = vscode.Uri.parse('vscode-remote://ssh-remote+host/workspace/src/Systems');
		assert.equal(explorerResourcePath(remote), remote.path);
	});
});

suite('Capataz multi-place context actions', () => {
	test('clicked place roots create and delete independently without an unrelated project prompt', async function () {
		this.timeout(20000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri; assert.ok(root);
		const project = editorFs(root), original = await project.read('capataz.config.json');
		const base = await readConfig(project);
		const config = { ...base, projectFile: 'layout-editor/lobby.project.json', projects: {
			lobby: { projectFile: 'layout-editor/lobby.project.json', systemsDir: 'layout-editor/lobby/Systems', coreDir: 'layout-editor/shared/Core' },
			match: { projectFile: 'layout-editor/match.project.json', systemsDir: 'layout-editor/match/Systems', coreDir: 'layout-editor/shared/Core' },
		} };
		const output = vscode.window.createOutputChannel('Capataz Multi-place Tests');
		const quick = vscode.window.showQuickPick, input = vscode.window.showInputBox;
		const warning = vscode.window.showWarningMessage, information = vscode.window.showInformationMessage;
		vscode.window.showQuickPick = (async () => { throw new Error('Context actions should infer the place from the clicked root.'); }) as typeof quick;
		vscode.window.showInputBox = async () => 'Player';
		vscode.window.showWarningMessage = (async () => 'Delete') as typeof warning;
		vscode.window.showInformationMessage = (async () => undefined) as typeof information;
		try {
			await project.write('capataz.config.json', configFileText(config));
			for (const layout of Object.values(config.projects)) {
				await initializeProject(root, output, vscode.Uri.file(path.resolve(__dirname, '../..')), layout.projectFile);
				await runNewSystem(output, vscode.Uri.joinPath(root, layout.systemsDir));
				assert.ok(await project.exists(`${layout.systemsDir}/PlayerSystem`));
			}
			const lobbyBefore = await project.read(config.projects.lobby.projectFile);
			await runDeleteSystem(output, vscode.Uri.joinPath(root, config.projects.match.systemsDir, 'PlayerSystem'));
			assert.equal(await project.exists(`${config.projects.match.systemsDir}/PlayerSystem`), false);
			assert.ok(await project.exists(`${config.projects.lobby.systemsDir}/PlayerSystem`));
			assert.equal(await project.read(config.projects.lobby.projectFile), lobbyBefore);
		} finally {
			vscode.window.showQuickPick = quick; vscode.window.showInputBox = input;
			vscode.window.showWarningMessage = warning; vscode.window.showInformationMessage = information;
			await project.write('capataz.config.json', original);
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, 'layout-editor'), { recursive: true });
			const routes = vscode.Uri.joinPath(root, '.capataz/generated/layout-editor');
			try { await vscode.workspace.fs.delete(routes, { recursive: true }); } catch { /* No routes if setup failed. */ }
			await generate(project, base); output.dispose();
		}
	});
});

suite('Capataz shared-root context actions', () => {
	test('Universal system mutations update every consuming place and preserve local same-name systems', async function () {
		this.timeout(20000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri; assert.ok(root);
		const project = editorFs(root), original = await project.read('capataz.config.json');
		const config = {
			emitLegacyScripts: false, projectFile: 'shared-editor/lobby.project.json', tree: { $className: 'DataModel' },
			systemRoots: { universal: 'shared-editor/Universal/Systems', lobby: 'shared-editor/Lobby/Systems' },
			projects: {
				lobby: { projectFile: 'shared-editor/lobby.project.json', systemMounts: { universal: { Shared: 'ReplicatedStorage/Universal' }, lobby: { Shared: 'ReplicatedStorage/Local' } } },
				match: { projectFile: 'shared-editor/match.project.json', systemMounts: { universal: { Shared: 'ReplicatedStorage/Universal' } } },
			},
		};
		const output = vscode.window.createOutputChannel('Shared Root Tests');
		const quick = vscode.window.showQuickPick, input = vscode.window.showInputBox;
		const warning = vscode.window.showWarningMessage, information = vscode.window.showInformationMessage;
		let prompt = '';
		vscode.window.showQuickPick = (async () => { throw new Error('Clicked shared roots must resolve without a place prompt.'); }) as typeof quick;
		vscode.window.showInputBox = async () => 'Player';
		vscode.window.showWarningMessage = (async (message: string) => { prompt = message; return 'Delete'; }) as typeof warning;
		vscode.window.showInformationMessage = (async () => undefined) as typeof information;
		try {
			await project.write('capataz.config.json', configFileText(config));
			for (const layout of Object.values(config.projects)) { await initializeProject(root, output, vscode.Uri.file(path.resolve(__dirname, '../..')), layout.projectFile); }
			for (const directory of Object.values(config.systemRoots)) { await runNewSystem(output, vscode.Uri.joinPath(root, directory)); }
			for (const layout of Object.values(config.projects)) { assert.ok(JSON.parse(await project.read(layout.projectFile)).tree.ReplicatedStorage.Universal.PlayerSystem); }
			await runDeleteSystem(output, vscode.Uri.joinPath(root, config.systemRoots.universal, 'PlayerSystem'));
			assert.match(prompt, /lobby.project.json/); assert.match(prompt, /match.project.json/);
			assert.equal(await project.exists(config.systemRoots.universal + '/PlayerSystem'), false);
			assert.ok(await project.exists(config.systemRoots.lobby + '/PlayerSystem'));
			for (const layout of Object.values(config.projects)) { assert.equal(JSON.parse(await project.read(layout.projectFile)).tree.ReplicatedStorage.Universal.PlayerSystem, undefined); }
		} finally {
			vscode.window.showQuickPick = quick; vscode.window.showInputBox = input;
			vscode.window.showWarningMessage = warning; vscode.window.showInformationMessage = information;
			await project.write('capataz.config.json', original);
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, 'shared-editor'), { recursive: true });
			try { await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, '.capataz/generated/shared-editor'), { recursive: true }); } catch { /* No routes if setup failed. */ }
			await generate(project, await readConfig(project)); output.dispose();
		}
	});
});
