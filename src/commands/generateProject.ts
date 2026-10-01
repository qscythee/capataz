import * as vscode from 'vscode';
import { ensureCapatazConfig } from '../configLoader';
import { generateProject } from '../generateProject';

export async function runGenerateProject(outputChannel: vscode.OutputChannel): Promise<void> {
	const gate = await ensureCapatazConfig();
	if (!gate) {
		return;
	}

	try {
		await generateProject(gate.root, gate.config, outputChannel);
		vscode.window.showInformationMessage('Capataz: default.project.json regenerated.');
	} catch (err) {
		vscode.window.showErrorMessage(`Capataz: failed to generate project - ${(err as Error).message}`);
	}
}
