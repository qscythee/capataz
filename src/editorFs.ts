import * as vscode from 'vscode';
import { ProjectFs } from './core/fs';

export function editorFs(root: vscode.Uri): ProjectFs {
	const uri = (relative: string) => vscode.Uri.joinPath(root, relative);
	return {
		read: async p => Buffer.from(await vscode.workspace.fs.readFile(uri(p))).toString('utf8'),
		write: async (p, content) => { await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri(p), '..')); await vscode.workspace.fs.writeFile(uri(p), Buffer.from(content)); },
		entries: async p => (await vscode.workspace.fs.readDirectory(uri(p))).filter(([, type]) => !(type & vscode.FileType.SymbolicLink)).map(([name, type]) => [name, !!(type & vscode.FileType.Directory)]),
		exists: async p => { try { await vscode.workspace.fs.stat(uri(p)); return true; } catch (error) { if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') { return false; } throw error; } },
		mkdir: async p => { await vscode.workspace.fs.createDirectory(uri(p)); },
		remove: async p => { await vscode.workspace.fs.delete(uri(p), { recursive: true, useTrash: true }); },
	};
}
