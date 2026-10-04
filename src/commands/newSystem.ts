import * as vscode from 'vscode';
import { defaultSystemsDir } from '../config';
import { ensureCapatazConfig } from '../configLoader';
import { newSystem } from '../core/project';
import { editorFs } from '../editorFs';

export async function runNewSystem(outputChannel: vscode.OutputChannel): Promise<void> {
	const gate = await ensureCapatazConfig();
	if (!gate) {
		return;
	}

	const input = await vscode.window.showInputBox({
		prompt: 'System name',
		placeHolder: 'Inventory',
		validateInput: (value) => (/^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim())
			? undefined
			: 'Use letters, digits, or underscores; start with a letter.'),
	});
	if (!input) {
		return;
	}

	let name = input.trim();
	if (!name.endsWith('System')) {
		name += 'System';
	}

	const systemsDirRel = defaultSystemsDir(gate.config);
	const systemRoot = vscode.Uri.joinPath(gate.root, systemsDirRel, name);

	const exists = await vscode.workspace.fs.stat(systemRoot).then(
		() => true,
		() => false,
	);
	if (exists) {
		vscode.window.showErrorMessage(`Capataz: System '${name}' already exists.`);
		return;
	}

	await newSystem(editorFs(gate.root), gate.config, name);
	outputChannel.appendLine('Wrote default.project.json and system routes');
	vscode.window.showInformationMessage(`Capataz: created System '${name}'.`);
}
