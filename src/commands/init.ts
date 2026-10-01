import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../configLoader';
import { initialize } from '../core/init';
import { editorFs } from '../editorFs';

export async function initializeProject(root: vscode.Uri, outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri): Promise<string[]> {
    const created = await initialize(editorFs(root), editorFs(vscode.Uri.joinPath(extensionUri, 'templates')));
    outputChannel.appendLine(`Init created ${created.length} files/directories: ${created.join(', ') || 'none'}`);
    return created;
}

export async function runInit(outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('Capataz: open a folder/workspace first.'); return; }
    try {
        const created = await initializeProject(root, outputChannel, extensionUri);
        vscode.window.showInformationMessage(`Capataz: initialized project (${created.length} new items).`);
    } catch (error) {
        const message = (error as Error).message;
        outputChannel.appendLine(`Init failed: ${message}`);
        vscode.window.showErrorMessage(`Capataz: init failed - ${message}`);
    }
}
