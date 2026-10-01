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
			await replace(prefix + 'return r("@Systems/CounterSystem/Shared/Counter")');
			await waitFor(() => !vscode.languages.getDiagnostics(uri).some(d => d.source === 'Capataz'));
			await document.save();
			await vscode.workspace.fs.delete(uri);
		} finally { output.dispose(); }
	});
});
