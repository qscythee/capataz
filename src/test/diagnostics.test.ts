import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { initializeProject } from '../commands/init';

suite('Capataz editor boundary diagnostics', () => {
	test('checks unsaved custom imports, updates errors, and clears corrected imports', async function () {
		this.timeout(15000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri;
		assert.ok(root, 'Integration test workspace must be present');
		const output = vscode.window.createOutputChannel('Capataz Diagnostic Tests');
		try {
			await initializeProject(root, output, vscode.Uri.file(path.resolve(__dirname, '../..')));
			// The reusable test workspace may contain older, intentionally preserved init templates.
			for (const file of ['src/Import.luau', 'src/Core/Shared/CustomRequirer/init.luau']) {
				const template = vscode.Uri.file(path.resolve(__dirname, '../../templates', file));
				await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, file), await vscode.workspace.fs.readFile(template));
			}
			const extension = vscode.extensions.all.find(e => e.packageJSON.name === 'capataz');
			assert.ok(extension, 'Capataz extension must be installed in the development host'); await extension.activate();
			const uri = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Client/BoundaryTest.luau');
			await vscode.workspace.fs.writeFile(uri, Buffer.from('return {}\n'));
			const document = await vscode.workspace.openTextDocument(uri);
			const replace = async (source: string) => { const edit = new vscode.WorkspaceEdit(); edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), source); assert.ok(await vscode.workspace.applyEdit(edit)); };
			const waitFor = async (predicate: () => boolean) => {
				const deadline = Date.now() + 6000;
				while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 50)); }
				assert.ok(predicate(), 'Expected diagnostic update before timeout');
			};
			const prefix = 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\n';
			await replace(prefix + 'return r("@Systems/CounterSystem/Server/CounterService")');
			await waitFor(() => vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz' && d.code === 'cross-boundary' && d.severity === vscode.DiagnosticSeverity.Error));
			assert.ok(document.isDirty, 'The checker must see unsaved changes');
			const boundary = vscode.languages.getDiagnostics(uri).find(d => d.source === 'Capataz' && d.code === 'cross-boundary')!;
			assert.equal(document.getText(boundary.range), 'r("@Systems/CounterSystem/Server/CounterService")');
			const other = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Client/OtherBoundaryTest.luau');
			await vscode.workspace.fs.writeFile(other, Buffer.from(prefix + 'return r("@Systems/CounterSystem/Server/CounterService")'));
			await waitFor(() => vscode.languages.getDiagnostics(other).some(d => d.source === 'Capataz' && d.code === 'cross-boundary'));
			await replace(prefix + 'return r("@Systems/CounterSystem/Shared/Counter")');
			await waitFor(() => !vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz'));
			assert.ok(vscode.languages.getDiagnostics(other).some(d => d.source === 'Capataz' && d.code === 'cross-boundary'), 'Editing one file must preserve diagnostics on another');
			const target = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Shared/Counter.luau');
			const targetSource = await vscode.workspace.fs.readFile(target);
			await vscode.workspace.fs.delete(target);
			await waitFor(() => vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz' && d.code === 'unresolved-require'));
			await vscode.workspace.fs.writeFile(target, targetSource);
			await waitFor(() => !vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz'));
			await vscode.workspace.fs.delete(other);
			await waitFor(() => !vscode.languages.getDiagnostics(other).some(d => d.source === 'Capataz'));
			await document.save();
			await vscode.workspace.fs.delete(uri);
		} finally { output.dispose(); }
	});

	test('save mode ignores unsaved edits, handles saves, and switches modes without restarting', async function () {
		this.timeout(15000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri;
		assert.ok(root);
		const configuration = vscode.workspace.getConfiguration('capataz', root);
		const previous = configuration.inspect<string>('lint.run')?.workspaceFolderValue;
		const uri = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Client/SaveBoundaryTest.luau');
		const prefix = 'local r = require(game:GetService("ReplicatedStorage").Import)(script)\n';
		const hasError = () => vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz' && d.code === 'cross-boundary');
		const waitFor = async (predicate: () => boolean) => {
			const deadline = Date.now() + 6000;
			while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 50)); }
			assert.ok(predicate(), 'Expected diagnostic update before timeout');
		};
		try {
			await configuration.update('lint.run', 'onSave', vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.fs.writeFile(uri, Buffer.from('return {}\n'));
			const document = await vscode.workspace.openTextDocument(uri);
			const replace = async (side: string) => {
				const edit = new vscode.WorkspaceEdit();
				edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), prefix + `return r("@Systems/CounterSystem/${side}/${side === 'Server' ? 'CounterService' : 'Counter'}")`);
				assert.ok(await vscode.workspace.applyEdit(edit));
			};
			await vscode.commands.executeCommand('capataz.check');
			await replace('Server');
			await new Promise(resolve => setTimeout(resolve, 600));
			assert.ok(document.isDirty); assert.ok(!hasError(), 'Typing must not publish unsaved errors in save mode');
			await vscode.commands.executeCommand('capataz.check');
			assert.ok(!hasError(), 'Manual full checks must also use saved contents in save mode');
			assert.ok(await document.save()); await waitFor(hasError);
			await replace('Shared'); await new Promise(resolve => setTimeout(resolve, 600));
			assert.ok(hasError(), 'Unsaved corrections must preserve the saved diagnostic');
			await configuration.update('lint.run', 'onChange', vscode.ConfigurationTarget.WorkspaceFolder);
			await waitFor(() => !hasError());
			await configuration.update('lint.run', 'onSave', vscode.ConfigurationTarget.WorkspaceFolder);
			await waitFor(hasError);
			assert.ok(await document.save()); await waitFor(() => !hasError());
		} finally {
			await configuration.update('lint.run', previous, vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.fs.delete(uri);
		}
	});

	test('ignore settings clear diagnostics for open files and restore them without restarting', async function () {
		this.timeout(15000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri; assert.ok(root);
		const configuration = vscode.workspace.getConfiguration('capataz', root);
		const previous = configuration.inspect<string[]>('lint.ignoreGlobs')?.workspaceFolderValue;
		const uri = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Client/IgnoreBoundaryTest.luau');
		const hasError = () => vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz' && d.code === 'cross-boundary');
		const waitFor = async (predicate: () => boolean) => {
			const deadline = Date.now() + 6000;
			while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 50)); }
			assert.ok(predicate(), 'Expected diagnostic update before timeout');
		};
		try {
			await vscode.workspace.fs.writeFile(uri, Buffer.from('return require(game:GetService("ServerScriptService").Systems.CounterSystem.Server.CounterService)'));
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.commands.executeCommand('capataz.check'); await waitFor(hasError);
			await configuration.update('lint.ignoreGlobs', ['**/IgnoreBoundaryTest.luau'], vscode.ConfigurationTarget.WorkspaceFolder);
			await waitFor(() => !hasError());
			const edit = new vscode.WorkspaceEdit(); edit.insert(uri, document.positionAt(0), '-- unsaved edit\n');
			assert.ok(await vscode.workspace.applyEdit(edit));
			await vscode.commands.executeCommand('capataz.check'); assert.ok(!hasError());
			await configuration.update('lint.ignoreGlobs', [], vscode.ConfigurationTarget.WorkspaceFolder);
			await waitFor(hasError); await document.save();
		} finally {
			await configuration.update('lint.ignoreGlobs', previous, vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.fs.delete(uri);
		}
	});

	test('editing an imported factory refreshes callers in change and save modes', async function () {
		this.timeout(20000);
		const root = vscode.workspace.workspaceFolders?.[0]?.uri; assert.ok(root);
		const configuration = vscode.workspace.getConfiguration('capataz', root);
		const previous = configuration.inspect<string>('lint.run')?.workspaceFolderValue;
		const factory = vscode.Uri.joinPath(root, 'src/Import.luau');
		const original = await vscode.workspace.fs.readFile(factory);
		const uri = vscode.Uri.joinPath(root, 'src/Systems/CounterSystem/Client/FactoryBoundaryTest.luau');
		const hasError = () => vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz' && d.code === 'unresolved-require');
		const waitFor = async (predicate: () => boolean) => {
			const deadline = Date.now() + 6000;
			while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 50)); }
			assert.ok(predicate(), 'Expected factory-dependent diagnostic update');
		};
		const document = await vscode.workspace.openTextDocument(factory);
		const replace = async (text: string) => {
			const edit = new vscode.WorkspaceEdit(); edit.replace(factory, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
			assert.ok(await vscode.workspace.applyEdit(edit));
		};
		try {
			await configuration.update('lint.run', 'onChange', vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.fs.writeFile(uri, Buffer.from('local r = require(game:GetService("ReplicatedStorage").Import)(script) return r("@Extra/CounterSystem/Shared/Counter")'));
			await vscode.commands.executeCommand('capataz.check'); await waitFor(hasError);
			const edited = Buffer.from(original).toString('utf8').replace('Core = ReplicatedStorage.Core,', 'Core = ReplicatedStorage.Core, Extra = ReplicatedStorage.Systems,');
			assert.notEqual(edited, Buffer.from(original).toString('utf8'));
			await replace(edited); await waitFor(() => !hasError()); assert.ok(document.isDirty);
			await configuration.update('lint.run', 'onSave', vscode.ConfigurationTarget.WorkspaceFolder); await waitFor(hasError);
			assert.ok(await document.save()); await waitFor(() => !hasError());
			await replace(Buffer.from(original).toString('utf8')); assert.ok(await document.save()); await waitFor(hasError);
		} finally {
			await replace(Buffer.from(original).toString('utf8')); await document.save();
			await configuration.update('lint.run', previous, vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.fs.delete(uri);
		}
	});
});
