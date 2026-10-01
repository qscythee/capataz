import * as vscode from 'vscode';
import { defaultSystemsDir } from '../config';
import { ensureCapatazConfig } from '../configLoader';
import { generateProject } from '../generateProject';

export async function runDeleteSystem(outputChannel: vscode.OutputChannel, preselected?: vscode.Uri): Promise<void> {
	const gate = await ensureCapatazConfig();
	if (!gate) {
		return;
	}

	const systemsDirRel = defaultSystemsDir(gate.config);
	const systemsDirUri = vscode.Uri.joinPath(gate.root, systemsDirRel);

	let name: string | undefined;
	if (preselected) {
		name = preselected.path.split('/').pop();
	} else {
		const entries = await vscode.workspace.fs.readDirectory(systemsDirUri);
		const names = entries
			.filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
			.map(([entryName]) => entryName)
			.sort();
		if (names.length === 0) {
			vscode.window.showInformationMessage('Capataz: no Systems exist.');
			return;
		}
		name = await vscode.window.showQuickPick(names, { placeHolder: 'Select a System to delete' });
	}
	if (!name) {
		return;
	}

	const confirm = await vscode.window.showWarningMessage(
		`Delete System '${name}'? This cannot be undone.`,
		{ modal: true },
		'Delete',
	);
	if (confirm !== 'Delete') {
		return;
	}

	const systemRoot = vscode.Uri.joinPath(systemsDirUri, name);
	await vscode.workspace.fs.delete(systemRoot, { recursive: true, useTrash: true });

	await generateProject(gate.root, gate.config, outputChannel);
	vscode.window.showInformationMessage(`Capataz: deleted System '${name}'.`);
}
