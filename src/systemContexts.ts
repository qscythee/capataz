import { layouts, selectSystemRoot } from './core/layout';
import * as vscode from 'vscode';
import { CapatazConfig, CONFIG_FILE_NAME, defaultSystemsDir } from './config';
import { readConfig } from './configLoader';
import { discoverSystems } from './core/project';
import { editorFs } from './editorFs';

/** Match VS Code's resourcePath context key: native paths for local files, URI paths otherwise. */
export function explorerResourcePath(uri: vscode.Uri): string {
	return uri.scheme === 'file' ? uri.fsPath : uri.path;
}

/** Context-menu targets use the same explicit system boundaries as generation. */
export async function systemContextPaths(root: vscode.Uri, config: CapatazConfig): Promise<{ groups: string[]; systems: string[] }> {
	const fs = editorFs(root), directory = defaultSystemsDir(config);
	const systems = await discoverSystems(fs, config);
	const names = new Set(systems.map(system => system.name));
	const groups: string[] = [];
	const visit = async (name: string) => {
		if (names.has(name)) { return; }
		const relative = name ? `${directory}/${name}` : directory;
		groups.push(explorerResourcePath(vscode.Uri.joinPath(root, relative)));
		for (const [child, isDirectory] of await fs.entries(relative)) {
			if (isDirectory && !child.startsWith('.') && child !== 'node_modules') { await visit(name ? `${name}/${child}` : child); }
		}
	};
	await visit('');
	return { groups, systems: systems.map(system => explorerResourcePath(vscode.Uri.joinPath(root, directory, system.name))) };
}

export function registerSystemContexts(context: vscode.ExtensionContext): void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let revision = 0, disposed = false;
	const refresh = async (version: number) => {
		const groups: string[] = [], systems: string[] = [];
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			try {
				const config = await readConfig(folder.uri);
				if (!config) { continue; }
				const selections = layouts(config).flatMap(layout => layout.systemRoots ? Object.keys(layout.systemMounts ?? {}).map(name => selectSystemRoot(layout, name)) : [layout]);
				const visited = new Set<string>();
				for (const layout of selections) {
					const directory = defaultSystemsDir(layout);
					if (visited.has(directory)) { continue; } visited.add(directory);
					try { const paths = await systemContextPaths(folder.uri, layout); groups.push(...paths.groups); systems.push(...paths.systems); } catch { /* Keep valid places visible when another layout is incomplete. */ }
				}
			} catch { /* Invalid layouts are reported by diagnostics; hide their actions. */ }
		}
		if (disposed || version !== revision) { return; }
		await Promise.all([
			vscode.commands.executeCommand('setContext', 'capataz.systemGroups', groups),
			vscode.commands.executeCommand('setContext', 'capataz.systemFolders', systems),
		]);
	};
	const schedule = () => {
		const version = ++revision;
		if (timer) { clearTimeout(timer); }
		timer = setTimeout(() => { timer = undefined; void refresh(version); }, 250);
	};
	const watcher = vscode.workspace.createFileSystemWatcher('**/*');
	context.subscriptions.push(watcher,
		watcher.onDidCreate(schedule), watcher.onDidDelete(schedule),
		watcher.onDidChange(uri => { if ([CONFIG_FILE_NAME, 'system.json'].includes(uri.path.split('/').at(-1)!)) { schedule(); } }),
		vscode.workspace.onDidChangeWorkspaceFolders(schedule),
		{ dispose: () => { disposed = true; revision++; if (timer) { clearTimeout(timer); } } },
	);
	schedule();
}
