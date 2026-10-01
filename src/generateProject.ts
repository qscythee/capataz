import * as vscode from 'vscode';
import { CapatazConfig, CapatazTreeNode, defaultSystemsDir } from './config';

async function isDir(uri: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return (stat.type & vscode.FileType.Directory) !== 0;
	} catch {
		return false;
	}
}

async function addIfDir(tree: CapatazTreeNode, childName: string, uri: vscode.Uri, relPath: string): Promise<void> {
	if (await isDir(uri)) {
		tree[childName] = { $path: relPath };
	}
}

function hasNonMetaKeys(node: CapatazTreeNode): boolean {
	return Object.keys(node).some((key) => key !== '$className');
}

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Ported from scripts/gen.luau's buildSystemsTrees + main(): scans the
 * Systems directory and regenerates default.project.json from
 * capataz.config.json's base tree, with zero Luau/Lune dependency.
 */
export async function generateProject(root: vscode.Uri, config: CapatazConfig, outputChannel: vscode.OutputChannel): Promise<void> {
	const systemsDirRel = defaultSystemsDir(config);
	const systemsDirUri = vscode.Uri.joinPath(root, systemsDirRel);

	if (!(await isDir(systemsDirUri))) {
		throw new Error(`Systems directory does not exist: ${systemsDirRel}`);
	}

	const entries = await vscode.workspace.fs.readDirectory(systemsDirUri);
	const systemNames = entries
		.filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
		.map(([name]) => name)
		.sort();

	const replicatedSystems: CapatazTreeNode = { $className: 'Folder' };
	const serverSystems: CapatazTreeNode = { $className: 'Folder' };

	for (const systemName of systemNames) {
		if (!systemName.endsWith('System')) {
			outputChannel.appendLine(`Warning: '${systemName}' does not end with 'System'.`);
		}

		const systemRootRel = `${systemsDirRel}/${systemName}`;
		const systemRootUri = vscode.Uri.joinPath(root, systemRootRel);

		const replicatedNode: CapatazTreeNode = { $className: 'Folder' };
		await addIfDir(replicatedNode, 'Client', vscode.Uri.joinPath(systemRootUri, 'Client'), `${systemRootRel}/Client`);
		await addIfDir(replicatedNode, 'Shared', vscode.Uri.joinPath(systemRootUri, 'Shared'), `${systemRootRel}/Shared`);

		// Shared only ever lives under ReplicatedStorage; the server reaches it
		// through the same alias, no separate mount needed (see Import.luau).
		const serverNode: CapatazTreeNode = { $className: 'Folder' };
		await addIfDir(serverNode, 'Server', vscode.Uri.joinPath(systemRootUri, 'Server'), `${systemRootRel}/Server`);

		if (hasNonMetaKeys(replicatedNode)) {
			replicatedSystems[systemName] = replicatedNode;
		}
		if (hasNonMetaKeys(serverNode)) {
			serverSystems[systemName] = serverNode;
		}
	}

	const tree = deepClone(config.tree);
	const replicatedStorage = tree['ReplicatedStorage'] as CapatazTreeNode | undefined;
	const serverScriptService = tree['ServerScriptService'] as CapatazTreeNode | undefined;
	if (!replicatedStorage || !serverScriptService) {
		throw new Error('capataz.config.json "tree" must define ReplicatedStorage and ServerScriptService.');
	}
	replicatedStorage['Systems'] = replicatedSystems;
	serverScriptService['Systems'] = serverSystems;

	const { systemsDir: _systemsDir, ...rojoConfig } = config;
	const project = { ...rojoConfig, tree };

	const outFile = vscode.Uri.joinPath(root, 'default.project.json');
	await vscode.workspace.fs.writeFile(outFile, Buffer.from(JSON.stringify(project, null, 2) + '\n', 'utf8'));
	outputChannel.appendLine('Wrote default.project.json');
}
