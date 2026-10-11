import { selectProjectOutput } from '../projectOutput';
import * as vscode from 'vscode';
import { defaultSystemsDir } from '../config';
import { ensureCapatazConfig } from '../configLoader';
import { defaultProjectFile, discoverSystems, newSystem, systemName } from '../core/project';
import { editorFs } from '../editorFs';

export async function runNewSystem(outputChannel: vscode.OutputChannel, preselected?: vscode.Uri): Promise<void> {
	const gate = await ensureCapatazConfig(preselected);
	if (!gate) { return; }
	const config = await selectProjectOutput(gate.root, gate.config, preselected, true);
	if (!config) { return; }
	const systemsRoot = vscode.Uri.joinPath(gate.root, defaultSystemsDir(config));
	let prefix = '';
	if (preselected) {
		if (preselected.scheme !== systemsRoot.scheme || preselected.authority !== systemsRoot.authority || (preselected.path !== systemsRoot.path && !preselected.path.startsWith(systemsRoot.path + '/'))) {
			vscode.window.showErrorMessage('Capataz: select the configured Systems folder or one of its groups.'); return;
		}
		prefix = preselected.path.slice(systemsRoot.path.length).replace(/^\//, '');
	}
	const project = editorFs(gate.root);
	const systems = await discoverSystems(project, config);
	if (prefix && systems.some(system => prefix === system.name || prefix.startsWith(system.name + '/'))) {
		vscode.window.showErrorMessage('Capataz: create systems inside the Systems root or a grouping folder, not inside another system.'); return;
	}
	const fullPath = (input: string) => prefix ? prefix + '/' + input.trim() : input.trim();
	const input = await vscode.window.showInputBox({
		prompt: prefix ? `System path relative to '${prefix}' (use / for further groups)` : 'System path relative to Systems (use / for groups)',
		placeHolder: prefix ? 'PlayerController' : 'Player/PlayerController',
		validateInput: value => {
			try { systemName(fullPath(value)); return undefined; }
			catch (error) { return (error as Error).message; }
		},
	});
	if (!input) { return; }
	const name = await newSystem(project, config, fullPath(input));
	outputChannel.appendLine(`Wrote ${defaultProjectFile(config)} and system routes`);
	vscode.window.showInformationMessage(`Capataz: created System '${name}'.`);
}
