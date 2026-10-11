import { registerSystemContexts } from './systemContexts';
import * as vscode from 'vscode';
import { runInit } from './commands/init';
import { runGenerateProject } from './commands/generateProject';
import { runNewSystem } from './commands/newSystem';
import { runDeleteSystem } from './commands/deleteSystem';
import { registerDiagnostics } from './diagnostics';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Capataz');
	context.subscriptions.push(outputChannel);
	registerDiagnostics(context, outputChannel);
	registerSystemContexts(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('capataz.init', (uri?: vscode.Uri) => runInit(outputChannel, context.extensionUri, uri)),
		vscode.commands.registerCommand('capataz.generateProject', () => runGenerateProject(outputChannel)),
		vscode.commands.registerCommand('capataz.newSystem', (uri?: vscode.Uri) => runNewSystem(outputChannel, uri)),
		vscode.commands.registerCommand('capataz.deleteSystem', (uri?: vscode.Uri) => runDeleteSystem(outputChannel, uri)),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
