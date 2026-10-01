import * as vscode from 'vscode';
import { CONFIG_FILE_NAME } from './config';
import { editorFs } from './editorFs';
import { readConfig } from './core/project';
import { checkProject } from './lint/check';

export function registerDiagnostics(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
	const collection = vscode.languages.createDiagnosticCollection('capataz');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	const refresh = async () => {
		const current = ++generation;
		const entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			try {
				const fs = editorFs(folder.uri);
				if (!(await fs.exists(CONFIG_FILE_NAME))) { continue; }
				const config = await readConfig(fs);
				const overlays = new Map<string, string>();
				for (const document of vscode.workspace.textDocuments) {
					if (vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === folder.uri.toString()) {
						overlays.set(document.uri.path.slice(folder.uri.path.length + 1), document.getText());
					}
				}
				const result = await checkProject(fs, config, overlays);
				const grouped = new Map<string, vscode.Diagnostic[]>();
				for (const issue of result.diagnostics) {
					const range = new vscode.Range(issue.line - 1, issue.column - 1, issue.line - 1, issue.column - 1 + issue.length);
					const diagnostic = new vscode.Diagnostic(range, issue.message, issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
					diagnostic.source = 'Capataz'; diagnostic.code = issue.code;
					if (issue.target) { diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(new vscode.Location(vscode.Uri.joinPath(folder.uri, issue.target), new vscode.Position(0, 0)), 'Required module')]; }
					const list = grouped.get(issue.file) ?? []; list.push(diagnostic); grouped.set(issue.file, list);
				}
				for (const [file, diagnostics] of grouped) { entries.push([vscode.Uri.joinPath(folder.uri, file), diagnostics]); }
			} catch (error) {
				output.appendLine(`Lint failed in ${folder.name}: ${(error as Error).message}`);
				const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), (error as Error).message, vscode.DiagnosticSeverity.Error);
				diagnostic.source = 'Capataz'; entries.push([vscode.Uri.joinPath(folder.uri, CONFIG_FILE_NAME), [diagnostic]]);
			}
		}
		if (current === generation) { collection.clear(); collection.set(entries); }
	};
	const schedule = () => { generation++; if (timer) { clearTimeout(timer); } timer = setTimeout(() => { void refresh(); }, 250); };
	const watcher = vscode.workspace.createFileSystemWatcher('**/{*.luau,*.lua,*.meta.json,.luaurc,capataz.config.json,*.project.json}');
	context.subscriptions.push(collection, watcher,
		watcher.onDidCreate(schedule), watcher.onDidChange(schedule), watcher.onDidDelete(schedule),
		vscode.workspace.onDidChangeTextDocument(event => { if (/\.lua[u]?$/.test(event.document.uri.path)) { schedule(); } }),
		vscode.workspace.onDidCloseTextDocument(schedule), vscode.workspace.onDidChangeWorkspaceFolders(schedule),
		vscode.commands.registerCommand('capataz.check', refresh),
		{ dispose: () => { generation++; if (timer) { clearTimeout(timer); } } });
	schedule();
}
