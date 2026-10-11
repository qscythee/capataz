import { selectProjectOutput } from '../projectOutput';
import * as vscode from 'vscode';
import { defaultSystemsDir } from '../config';
import { ensureCapatazConfig } from '../configLoader';
import { discoverSystems, generateConsumers, validateSystemMutation, consumingLayouts, defaultProjectFile } from '../core/project';
import { editorFs } from '../editorFs';

export async function runDeleteSystem(outputChannel: vscode.OutputChannel, preselected?: vscode.Uri): Promise<void> {
	const gate = await ensureCapatazConfig(preselected);
	if (!gate) { return; }
	const config = await selectProjectOutput(gate.root, gate.config, preselected, true);
	if (!config) { return; }
	const systemsDirUri = vscode.Uri.joinPath(gate.root, defaultSystemsDir(config));
	const names = (await discoverSystems(editorFs(gate.root), config)).map(system => system.name);
	let name: string | undefined;
	if (preselected) {
		if (preselected.scheme === systemsDirUri.scheme && preselected.authority === systemsDirUri.authority && preselected.path.startsWith(systemsDirUri.path + '/')) {
			name = preselected.path.slice(systemsDirUri.path.length + 1);
		}
		if (!name || !names.includes(name)) {
			vscode.window.showErrorMessage('Capataz: select an identified system, not a grouping or route folder.'); return;
		}
	} else {
		if (!names.length) { vscode.window.showInformationMessage('Capataz: no Systems exist.'); return; }
		name = await vscode.window.showQuickPick(names, { placeHolder: 'Select a full system path to delete' });
	}
	if (!name) { return; }
	await validateSystemMutation(editorFs(gate.root), config);
	const consumers = await consumingLayouts(editorFs(gate.root), config);
	const shared = consumers.length > 1 ? ` Shared by: ${consumers.map(defaultProjectFile).join(', ')}.` : '';
	const confirm = await vscode.window.showWarningMessage(`Delete System '${name}'?${shared}`, { modal: true }, 'Delete');
	if (confirm !== 'Delete') { return; }
	await vscode.workspace.fs.delete(vscode.Uri.joinPath(systemsDirUri, name), { recursive: true, useTrash: true });
	await generateConsumers(editorFs(gate.root), config);
	outputChannel.appendLine(`Regenerated ${consumers.map(defaultProjectFile).join(", ")}`);
	vscode.window.showInformationMessage(`Capataz: deleted System '${name}'.`);
}
