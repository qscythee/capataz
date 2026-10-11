import * as vscode from 'vscode';
import { CapatazConfig } from './config';
import { generate, defaultProjectFile } from './core/project';
import { editorFs } from './editorFs';

export async function generateProject(root: vscode.Uri, config: CapatazConfig, outputChannel: vscode.OutputChannel): Promise<void> {
    await generate(editorFs(root), config);
    outputChannel.appendLine(`Wrote ${defaultProjectFile(config)} and system routes`);
}
