import * as vscode from 'vscode';
import { selectProjectOutput } from '../projectOutput';
import { defaultProjectFile } from '../core/project';
import { getWorkspaceRoot, readConfig } from '../configLoader';
import { initialize, starterConfig } from '../core/init';
import { editorFs } from '../editorFs';

export async function initializeProject(root: vscode.Uri, outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri, projectFile?: string): Promise<string[]> {
    const created = await initialize(editorFs(root), editorFs(vscode.Uri.joinPath(extensionUri, 'templates')), projectFile);
    outputChannel.appendLine(`Init created ${created.length} files/directories: ${created.join(', ') || 'none'}`);
    return created;
}

export async function runInit(outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri, target?: vscode.Uri): Promise<void> {
    const root = target ? vscode.workspace.getWorkspaceFolder(target)?.uri : getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('Capataz: open a folder/workspace first.'); return; }
    try {
        const config = await selectProjectOutput(root, await readConfig(root) ?? starterConfig);
        if (!config) { return; }
        const created = await initializeProject(root, outputChannel, extensionUri, defaultProjectFile(config));
        vscode.window.showInformationMessage(`Capataz: initialized project (${created.length} new items).`);
    } catch (error) {
        const message = (error as Error).message;
        outputChannel.appendLine(`Init failed: ${message}`);
        vscode.window.showErrorMessage(`Capataz: init failed - ${message}`);
    }
}
