import * as vscode from 'vscode';
import { CONFIG_FILE_NAME } from './config';
import { editorFs } from './editorFs';
import { Diagnostic } from './lint/analyze';
import { IncrementalLinter } from './lint/incremental';

interface Pending { rebuild: boolean; full: boolean; files: Set<string> }
interface WorkspaceLint { folder: vscode.WorkspaceFolder; linter: IncrementalLinter; pending?: Pending }
const pending = (): Pending => ({ rebuild: false, full: false, files: new Set() });
const lintOnChange = (uri: vscode.Uri): boolean => vscode.workspace.getConfiguration('capataz', uri).get<string>('lint.run', 'onChange') !== 'onSave';

export function registerDiagnostics(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
	const collection = vscode.languages.createDiagnosticCollection('capataz');
	const workspaces = new Map<string, WorkspaceLint>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let active: AbortController | undefined;
	let running: Promise<void> | undefined;
	let disposed = false;
	const diagnostic = (issue: Diagnostic, root: vscode.Uri): vscode.Diagnostic => {
		const range = new vscode.Range(issue.line - 1, issue.column - 1, issue.endLine - 1, issue.endColumn - 1);
		const value = new vscode.Diagnostic(range, issue.message, issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
		value.source = 'Capataz'; value.code = issue.code;
		if (issue.target) { value.relatedInformation = [new vscode.DiagnosticRelatedInformation(new vscode.Location(vscode.Uri.joinPath(root, issue.target), new vscode.Position(0, 0)), 'Required module')]; }
		return value;
	};
	const run = async (): Promise<void> => {
		if (running) { await running; }
		if (disposed) { return; }
		if (running) { return run(); }
		const controller = new AbortController(); active = controller;
		running = (async () => {
			for (const state of workspaces.values()) {
				if (controller.signal.aborted) { break; }
				const request = state.pending;
				if (!request) { continue; }
				state.pending = undefined;
				try {
					const documents = new Map<string, vscode.TextDocument>();
					const useUnsaved = lintOnChange(state.folder.uri);
					for (const document of vscode.workspace.textDocuments) {
						if (vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === state.folder.uri.toString()) {
							documents.set(document.uri.path.slice(state.folder.uri.path.length + 1), document);
						}
					}
					// Fetch text lazily: an edit must not copy every other open document.
					const updates = await state.linter.refresh({ ...request, ignoreGlobs: vscode.workspace.getConfiguration('capataz', state.folder.uri).get<string[]>('lint.ignoreGlobs', []) }, { get: file => useUnsaved ? documents.get(file)?.getText() : undefined }, controller.signal);
					controller.signal.throwIfAborted();
					collection.delete(vscode.Uri.joinPath(state.folder.uri, CONFIG_FILE_NAME));
					for (const [file, analysis] of updates) {
						collection.set(vscode.Uri.joinPath(state.folder.uri, file), analysis.diagnostics.map(issue => diagnostic(issue, state.folder.uri)));
					}
				} catch (error) {
					if (controller.signal.aborted) {
						const next = state.pending ??= pending();
						next.rebuild ||= request.rebuild; next.full ||= request.full;
						for (const file of request.files) { next.files.add(file); }
						break;
					}
					output.appendLine(`Lint failed in ${state.folder.name}: ${(error as Error).message}`);
					const issue = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), (error as Error).message, vscode.DiagnosticSeverity.Error);
					issue.source = 'Capataz'; collection.set(vscode.Uri.joinPath(state.folder.uri, CONFIG_FILE_NAME), [issue]);
				}
			}
		})();
		try { await running; } finally { running = undefined; if (active === controller) { active = undefined; } }
	};
	const schedule = () => {
		active?.abort();
		if (timer) { clearTimeout(timer); }
		timer = setTimeout(() => { timer = undefined; void run(); }, 250);
	};
	const enqueue = (uri: vscode.Uri, rebuild = false) => {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		const state = folder && workspaces.get(folder.uri.toString());
		if (!state) { return; }
		const request = state.pending ??= pending();
		const file = uri.path.slice(state.folder.uri.path.length + 1);
		request.rebuild ||= rebuild || !/\.lua[u]?$/.test(file);
		if (/\.lua[u]?$/.test(file)) { request.files.add(file); }
		schedule();
	};
	const syncWorkspaces = () => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		for (const [key, state] of workspaces) {
			if (!folders.some(folder => folder.uri.toString() === key)) {
				workspaces.delete(key);
				collection.forEach(uri => { if (uri.toString().startsWith(state.folder.uri.toString() + '/')) { collection.delete(uri); } });
			}
		}
		for (const folder of folders) {
			if (!workspaces.has(folder.uri.toString())) {
				workspaces.set(folder.uri.toString(), { folder, linter: new IncrementalLinter(editorFs(folder.uri)), pending: { ...pending(), rebuild: true } });
			}
		}
		schedule();
	};
	const watcher = vscode.workspace.createFileSystemWatcher('**/{*.luau,*.lua,*.meta.json,.luaurc,capataz.config.json,*.project.json}');
	context.subscriptions.push(collection, watcher,
		watcher.onDidCreate(uri => enqueue(uri, true)), watcher.onDidChange(uri => enqueue(uri)), watcher.onDidDelete(uri => enqueue(uri, true)),
		vscode.workspace.onDidChangeTextDocument(event => { if (/\.lua[u]?$/.test(event.document.uri.path) && lintOnChange(event.document.uri)) { enqueue(event.document.uri); } }),
		vscode.workspace.onDidSaveTextDocument(document => { if (/\.lua[u]?$/.test(document.uri.path)) { enqueue(document.uri); } }),
		vscode.workspace.onDidCloseTextDocument(document => { if (/\.lua[u]?$/.test(document.uri.path) && lintOnChange(document.uri)) { enqueue(document.uri); } }),
		vscode.workspace.onDidChangeConfiguration(event => {
			let affected = false;
			for (const state of workspaces.values()) {
				if (event.affectsConfiguration('capataz.lint.run', state.folder.uri) || event.affectsConfiguration('capataz.lint.ignoreGlobs', state.folder.uri)) {
					const request = state.pending ??= pending(); request.full = true; affected = true;
				}
			}
			if (affected) { schedule(); }
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(syncWorkspaces),
		vscode.commands.registerCommand('capataz.check', async () => {
			for (const state of workspaces.values()) { const request = state.pending ??= pending(); request.rebuild = true; request.full = true; }
			active?.abort(); if (timer) { clearTimeout(timer); timer = undefined; } await run();
		}),
		{ dispose: () => { disposed = true; active?.abort(); if (timer) { clearTimeout(timer); } workspaces.clear(); } });
	syncWorkspaces();
}
