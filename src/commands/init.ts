import * as vscode from 'vscode';
import { CapatazConfig, CapatazTreeNode, CONFIG_FILE_NAME } from '../config';
import { configUri, getWorkspaceRoot } from '../configLoader';
import { generateProject } from '../generateProject';

const STARTER_CONFIG: CapatazConfig = {
	emitLegacyScripts: false,
	systemsDir: 'src/Systems',
	syncbackRules: {
		ignoreTrees: ['ReplicatedStorage/Import'],
	},
	tree: {
		$className: 'DataModel',
		ReplicatedFirst: {
			$className: 'ReplicatedFirst',
			Core: { $className: 'Folder', First: { $path: 'src/Core/First' } },
		},
		ReplicatedStorage: {
			$className: 'ReplicatedStorage',
			Core: {
				$className: 'Folder',
				Client: { $path: 'src/Core/Client' },
				Shared: { $path: 'src/Core/Shared' },
			},
			Assets: { $path: 'src/Assets' },
			Import: { $path: 'src/Import.luau' },
		},
		ServerScriptService: {
			$className: 'ServerScriptService',
			Core: { $className: 'Folder', Server: { $path: 'src/Core/Server' } },
		},
		StarterPlayer: {
			$className: 'StarterPlayer',
			StarterPlayerScripts: { $path: 'src/Client' },
		},
	},
};

const REQUIRED_DIRECTORIES = [
	'src/Core/First', 'src/Core/Client', 'src/Core/Shared', 'src/Core/Server',
	'src/Assets', 'src/Client', 'src/Systems',
];

const FRAMEWORK_FILES = [
	'.luaurc',
	'src/Import.luau',
	'src/Core/Shared/CustomRequirer/init.luau',
];

const BOOTSTRAP_FILES = [
	'src/Client/Bootstrap.client.luau',
	'src/Core/Server/Bootstrap.server.luau',
];

const EXAMPLE_SYSTEMS = ['GreetingSystem', 'CounterSystem'];
const SYSTEM_PARTS = ['Client', 'Server', 'Shared'];

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return false;
		}
		throw error;
	}
}

async function writeIfMissing(uri: vscode.Uri, bytes: Uint8Array): Promise<boolean> {
	if (await exists(uri)) {
		return false;
	}
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
	await vscode.workspace.fs.writeFile(uri, bytes);
	return true;
}

function isNode(value: unknown): value is CapatazTreeNode {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addMissingMount(tree: CapatazTreeNode, keys: string[], leaf: CapatazTreeNode): void {
	let node = tree;
	for (const key of keys.slice(0, -1)) {
		const next = node[key];
		if (!isNode(next)) {
			const created: CapatazTreeNode = { $className: node === tree ? key : 'Folder' };
			node[key] = created;
			node = created;
		} else {
			node = next;
		}
	}
	const last = keys[keys.length - 1];
	if (node[last] === undefined) {
		node[last] = leaf;
	}
}

function extendProject(project: Record<string, unknown>): CapatazConfig {
	if (!isNode(project.tree)) {
		throw new Error('Existing default.project.json needs a Rojo tree object.');
	}
	const config = JSON.parse(JSON.stringify(project)) as CapatazConfig;
	const tree = config.tree;
	addMissingMount(tree, ['ReplicatedStorage', 'Core', 'Client'], { $path: 'src/Core/Client' });
	addMissingMount(tree, ['ReplicatedStorage', 'Core', 'Shared'], { $path: 'src/Core/Shared' });
	addMissingMount(tree, ['ReplicatedFirst', 'Core', 'First'], { $path: 'src/Core/First' });
	addMissingMount(tree, ['ReplicatedStorage', 'Assets'], { $path: 'src/Assets' });
	addMissingMount(tree, ['ReplicatedStorage', 'Import'], { $path: 'src/Import.luau' });
	addMissingMount(tree, ['ServerScriptService', 'Core', 'Server'], { $path: 'src/Core/Server' });
	addMissingMount(tree, ['StarterPlayer', 'StarterPlayerScripts'], { $path: 'src/Client' });
	return { ...config, systemsDir: 'src/Systems' };
}

async function loadConfig(root: vscode.Uri): Promise<{ config: CapatazConfig; created: boolean }> {
	const target = configUri(root);
	if (await exists(target)) {
		const config = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8')) as CapatazConfig;
		if (!isNode(config.tree)) {
			throw new Error(`${CONFIG_FILE_NAME} needs a Rojo tree object.`);
		}
		return { config, created: false };
	}

	const projectUri = vscode.Uri.joinPath(root, 'default.project.json');
	if (await exists(projectUri)) {
		const project = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(projectUri)).toString('utf8')) as Record<string, unknown>;
		return { config: extendProject(project), created: true };
	}
	return { config: STARTER_CONFIG, created: true };
}


export async function initializeProject(root: vscode.Uri, outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri): Promise<string[]> {
		const { config, created: createConfig } = await loadConfig(root);
		const freshServer = !(await exists(vscode.Uri.joinPath(root, 'src/Core/Server')));
		const freshClient = !(await exists(vscode.Uri.joinPath(root, 'src/Client')));
		const systemsDir = config.systemsDir ?? 'src/Systems';
		if (systemsDir !== 'src/Systems') {
			throw new Error('Init requires systemsDir to be src/Systems.');
		}
		const created: string[] = [];
		for (const relative of REQUIRED_DIRECTORIES) {
			const uri = vscode.Uri.joinPath(root, relative);
			if (!(await exists(uri))) {
				await vscode.workspace.fs.createDirectory(uri);
				created.push(relative + '/');
			}
		}
		const newExamples: string[] = [];
		for (const system of EXAMPLE_SYSTEMS) {
			if (!(await exists(vscode.Uri.joinPath(root, 'src', 'Systems', system)))) {
				newExamples.push(system);
			}
			for (const part of SYSTEM_PARTS) {
				const relative = `src/Systems/${system}/${part}`;
				const uri = vscode.Uri.joinPath(root, relative);
				if (!(await exists(uri))) {
					await vscode.workspace.fs.createDirectory(uri);
					created.push(relative + '/');
				}
			}
		}

		const files = [
			...FRAMEWORK_FILES,
			...(freshClient ? [BOOTSTRAP_FILES[0]] : []),
			...(freshServer ? [BOOTSTRAP_FILES[1]] : []),
		];
		for (const system of newExamples) {
			for (const part of SYSTEM_PARTS) {
				const templateDir = vscode.Uri.joinPath(extensionUri, 'templates', 'src', 'Systems', system, part);
				for (const [name, type] of await vscode.workspace.fs.readDirectory(templateDir)) {
					if (type & vscode.FileType.File) {
						files.push(`src/Systems/${system}/${part}/${name}`);
					}
				}
			}
		}
		for (const relative of files) {
			const template = vscode.Uri.joinPath(extensionUri, 'templates', relative);
			if (await writeIfMissing(vscode.Uri.joinPath(root, relative), await vscode.workspace.fs.readFile(template))) {
				created.push(relative);
			}
		}
		for (const relative of REQUIRED_DIRECTORIES) {
			const uri = vscode.Uri.joinPath(root, relative);
			if ((await vscode.workspace.fs.readDirectory(uri)).length === 0) {
				await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uri, '.gitkeep'), new Uint8Array());
				created.push(`${relative}/.gitkeep`);
			}
		}

		if (createConfig) {
			await vscode.workspace.fs.writeFile(configUri(root), Buffer.from(JSON.stringify(config, null, 2) + '\n', 'utf8'));
			created.push(CONFIG_FILE_NAME);
		}
		await generateProject(root, config, outputChannel);
		outputChannel.appendLine(`Init created ${created.length} files/directories: ${created.join(', ') || 'none'}`);
		return created;
}

export async function runInit(outputChannel: vscode.OutputChannel, extensionUri: vscode.Uri): Promise<void> {
	const root = getWorkspaceRoot();
	if (!root) {
		vscode.window.showErrorMessage('Capataz: open a folder/workspace first.');
		return;
	}
	try {
		const created = await initializeProject(root, outputChannel, extensionUri);
		vscode.window.showInformationMessage(`Capataz: initialized project (${created.length} new items).`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Init failed: ${message}`);
		vscode.window.showErrorMessage(`Capataz: init failed - ${message}`);
	}
}
