import * as vscode from 'vscode';
import { CapatazConfig, CONFIG_FILE_NAME } from './config';

export function configUri(workspaceRoot: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(workspaceRoot, CONFIG_FILE_NAME);
}

export async function readConfig(workspaceRoot: vscode.Uri): Promise<CapatazConfig | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(configUri(workspaceRoot));
		return JSON.parse(Buffer.from(bytes).toString('utf8')) as CapatazConfig;
	} catch {
		return undefined;
	}
}

export function getWorkspaceRoot(): vscode.Uri | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * Hard gate: Capataz only acts on a workspace that has an opted-in
 * capataz.config.json. Its mere presence is the opt-in signal. Shows a
 * recoverable error with a shortcut to `capataz.init` when it's missing.
 */
export async function ensureCapatazConfig(): Promise<{ root: vscode.Uri; config: CapatazConfig } | undefined> {
	const root = getWorkspaceRoot();
	if (!root) {
		vscode.window.showErrorMessage('Capataz: open a folder/workspace first.');
		return undefined;
	}

	const config = await readConfig(root);
	if (!config) {
		const choice = await vscode.window.showErrorMessage(
			`Capataz: no ${CONFIG_FILE_NAME} found at the workspace root.`,
			'Run Capataz: Init',
		);
		if (choice) {
			await vscode.commands.executeCommand('capataz.init');
		}
		return undefined;
	}

	return { root, config };
}
