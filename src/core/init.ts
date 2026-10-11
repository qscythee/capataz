import { selectLayout, corePath, sourcePath } from './layout';
import * as path from 'node:path';
import { CapatazConfig, CapatazTreeNode, CONFIG_FILE_NAME } from '../config';
import { ProjectFs } from './fs';
import { configFileText, generate, readConfig, projectFilePath } from './project';

const parts = ['Client', 'Server', 'Shared'];
const examples = ['GreetingSystem', 'CounterSystem'];
export const starterConfig: CapatazConfig = {
	emitLegacyScripts: false, systemsDir: 'src/Systems', syncbackRules: { ignoreTrees: ['ReplicatedStorage/Import'] },
	tree: {
		$className: 'DataModel',
		ReplicatedFirst: { $className: 'ReplicatedFirst', Core: { $className: 'Folder', First: { $path: 'src/Core/First' } } },
		ReplicatedStorage: { $className: 'ReplicatedStorage', Core: { $className: 'Folder', Client: { $path: 'src/Core/Client' }, Shared: { $path: 'src/Core/Shared' } }, Import: { $path: 'src/Import.luau' } },
		ServerScriptService: { $className: 'ServerScriptService', Core: { $className: 'Folder', Server: { $path: 'src/Core/Server' } } },
	},
};
function addMissing(target: CapatazTreeNode, defaults: CapatazTreeNode): void {
	for (const [key, value] of Object.entries(defaults)) {
		if (target[key] === undefined) { target[key] = structuredClone(value); }
		else if (!key.startsWith('$') && typeof target[key] === 'object' && typeof value === 'object' && value) { addMissing(target[key] as CapatazTreeNode, value); }
	}
}
export interface Templates { read(relative: string): Promise<string>; entries(relative: string): Promise<[string, boolean][]> }

export async function initialize(fs: ProjectFs, templates: Templates, projectFile?: string): Promise<string[]> {
	const selected = projectFile === undefined ? undefined : projectFilePath(projectFile);
	const adoptionFile = selected ?? 'default.project.json';
	const hasConfig = await fs.exists(CONFIG_FILE_NAME);
	let config: CapatazConfig;
	if (hasConfig) { config = await readConfig(fs); }
	else if (await fs.exists(adoptionFile)) {
		config = JSON.parse(await fs.read(adoptionFile));
		if (!config.tree || typeof config.tree !== 'object') { throw new Error(`Existing ${adoptionFile} needs a Rojo tree object.`); }
		const rebase = (node: CapatazTreeNode) => {
			if (typeof node.$path === 'string') { node.$path = path.posix.normalize(path.posix.join(path.posix.dirname(adoptionFile), node.$path.replace(/\\/g, '/'))); }
			for (const [key, child] of Object.entries(node)) { if (!key.startsWith('$') && child && typeof child === 'object') { rebase(child as CapatazTreeNode); } }
		};
		rebase(config.tree);
		addMissing(config.tree, starterConfig.tree); config.systemsDir = 'src/Systems'; config.emitLegacyScripts = false;
	} else { config = structuredClone(starterConfig); }
	if (!hasConfig && selected !== undefined) { config.projectFile = selected; }
	const storedConfig = config;
	config = selectLayout(config, selected);
	if (config.systemRoots) {
		const created: string[] = [];
		for (const name of Object.keys(config.systemMounts ?? {})) {
			const directory = config.systemRoots[name];
			if (!(await fs.exists(directory))) { await fs.mkdir(directory); created.push(directory + '/'); }
		}
		await generate(fs, config);
		return created;
	}
	const systemsDir = config.systemsDir ?? 'src/Systems';
	const destination = (file: string) => {
		if (file === 'src/Core/Shared/CustomRequirer/init.luau') { return sourcePath(config, 'ReplicatedStorage/Core/Shared/CustomRequirer', corePath(config, 'Shared') + '/CustomRequirer') + '/init.luau'; }
		for (const part of ['First', 'Client', 'Shared', 'Server'] as const) { if (file.startsWith('src/Core/' + part + '/')) { return corePath(config, part) + file.slice(('src/Core/' + part).length); } }
		if (file.startsWith('src/Systems/')) { return systemsDir + file.slice('src/Systems'.length); }
		if (file === 'src/Import.luau') { return sourcePath(config, 'ReplicatedStorage/Import', file); }
		return file;
	};
	const directories = [...(['First', 'Client', 'Shared', 'Server'] as const).map(part => corePath(config, part)), systemsDir];
	const created: string[] = [];
	for (const relative of [...directories, ...examples.flatMap(system => parts.map(part => `${systemsDir}/${system}/${part}`))]) {
		if (!(await fs.exists(relative))) { await fs.mkdir(relative); created.push(relative + '/'); }
	}
	const files = ['.luaurc', 'src/Import.luau', 'src/Core/Shared/CustomRequirer/init.luau', 'src/Core/Client/Bootstrap.client.luau', 'src/Core/Server/Bootstrap.server.luau'];
	for (const system of examples) {
		for (const part of parts) {
			const directory = `src/Systems/${system}/${part}`;
			for (const [file, isDirectory] of await templates.entries(directory)) { if (!isDirectory) { files.push(`${directory}/${file}`); } }
		}
	}
	for (const template of files) {
		const relative = destination(template);
		if (await fs.exists(relative)) { continue; }
		let source = await templates.read(template);
		if (config.projects && template === 'src/Import.luau') { source = source.replace('ReplicatedStorage.Core.Shared.CustomRequirer.SystemRoutes', 'ReplicatedStorage.CapatazSystemRoutes'); }
		await fs.write(relative, source); created.push(relative);
	}
	for (const relative of directories) { if (!(await fs.entries(relative)).length) { await fs.write(relative + '/.gitkeep', ''); created.push(relative + '/.gitkeep'); } }
	const serializedConfig = configFileText(storedConfig);
	if (!(await fs.exists(CONFIG_FILE_NAME)) || await fs.read(CONFIG_FILE_NAME) !== serializedConfig) {
		await fs.write(CONFIG_FILE_NAME, serializedConfig);
		if (!hasConfig) { created.push(CONFIG_FILE_NAME); }
	}
	await generate(fs, config);
	return created;
}
