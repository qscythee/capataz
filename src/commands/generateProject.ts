import { selectProjectOutput } from '../projectOutput';
import { defaultProjectFile } from '../core/project';
import * as vscode from 'vscode';
import { ensureCapatazConfig } from '../configLoader';
import { generateProject } from '../generateProject';

export async function runGenerateProject(outputChannel: vscode.OutputChannel): Promise<void> {
	const gate = await ensureCapatazConfig();
	if (!gate) {
		return;
	}

	const config = await selectProjectOutput(gate.root, gate.config);
	if (!config) { return; }
	try {
		await generateProject(gate.root, config, outputChannel);
		vscode.window.showInformationMessage(`Capataz: ${defaultProjectFile(config)} regenerated.`);
	} catch (err) {
		vscode.window.showErrorMessage(`Capataz: failed to generate project - ${(err as Error).message}`);
	}
}
