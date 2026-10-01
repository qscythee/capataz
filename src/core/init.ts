import { CapatazConfig, CapatazTreeNode, CONFIG_FILE_NAME } from '../config';
import { ProjectFs } from './fs';
import { generate, readConfig } from './project';

const directories = ['src/Core/First', 'src/Core/Client', 'src/Core/Shared', 'src/Core/Server', 'src/Assets', 'src/Client', 'src/Systems'];
const parts = ['Client', 'Server', 'Shared'];
const examples = ['GreetingSystem', 'CounterSystem'];
export const starterConfig: CapatazConfig = {
	emitLegacyScripts: false, systemsDir: 'src/Systems', syncbackRules: { ignoreTrees: ['ReplicatedStorage/Import'] },
	tree: {
		$className: 'DataModel',
		ReplicatedFirst: { $className: 'ReplicatedFirst', Core: { $className: 'Folder', First: { $path: 'src/Core/First' } } },
		ReplicatedStorage: { $className: 'ReplicatedStorage', Core: { $className: 'Folder', Client: { $path: 'src/Core/Client' }, Shared: { $path: 'src/Core/Shared' } }, Assets: { $path: 'src/Assets' }, Import: { $path: 'src/Import.luau' } },
		ServerScriptService: { $className: 'ServerScriptService', Core: { $className: 'Folder', Server: { $path: 'src/Core/Server' } } },
		StarterPlayer: { $className: 'StarterPlayer', StarterPlayerScripts: { $path: 'src/Client' } },
	},
};
function addMissing(target: CapatazTreeNode, defaults: CapatazTreeNode): void {
	for (const [key, value] of Object.entries(defaults)) {
		if (target[key] === undefined) { target[key] = structuredClone(value); }
		else if (!key.startsWith('$') && typeof target[key] === 'object' && typeof value === 'object' && value) { addMissing(target[key] as CapatazTreeNode, value); }
	}
}
export interface Templates { read(relative: string): Promise<string>; entries(relative: string): Promise<[string, boolean][]> }
export async function initialize(fs: ProjectFs, templates: Templates): Promise<string[]> {
	const hasConfig = await fs.exists(CONFIG_FILE_NAME);
	let config: CapatazConfig;
	if (hasConfig) { config = await readConfig(fs); }
	else if (await fs.exists('default.project.json')) {
		config = JSON.parse(await fs.read('default.project.json'));
		if (!config.tree || typeof config.tree !== 'object') { throw new Error('Existing default.project.json needs a Rojo tree object.'); }
		addMissing(config.tree, starterConfig.tree); config.systemsDir = 'src/Systems';
	} else { config = structuredClone(starterConfig); }
	if ((config.systemsDir ?? 'src/Systems') !== 'src/Systems') { throw new Error('Init requires systemsDir to be src/Systems.'); }
	const freshClient = !(await fs.exists('src/Client'));
	const freshServer = !(await fs.exists('src/Core/Server'));
	const created: string[] = [], missingExamples: string[] = [];
	for (const system of examples) { if (!(await fs.exists(`src/Systems/${system}`))) { missingExamples.push(system); } }
	for (const relative of [...directories, ...examples.flatMap(system => parts.map(part => `src/Systems/${system}/${part}`))]) {
		if (!(await fs.exists(relative))) { await fs.mkdir(relative); created.push(relative + '/'); }
	}
	const files = ['.luaurc', 'src/Import.luau', 'src/Core/Shared/CustomRequirer/init.luau'];
	if (freshClient) { files.push('src/Client/Bootstrap.client.luau'); }
	if (freshServer) { files.push('src/Core/Server/Bootstrap.server.luau'); }
	for (const system of missingExamples) {
		for (const part of parts) {
			const directory = `src/Systems/${system}/${part}`;
			for (const [file, isDirectory] of await templates.entries(directory)) { if (!isDirectory) { files.push(`${directory}/${file}`); } }
		}
	}
	for (const relative of files) { if (!(await fs.exists(relative))) { await fs.write(relative, await templates.read(relative)); created.push(relative); } }
	for (const relative of directories) { if (!(await fs.entries(relative)).length) { await fs.write(relative + '/.gitkeep', ''); created.push(relative + '/.gitkeep'); } }
	if (!hasConfig) { await fs.write(CONFIG_FILE_NAME, JSON.stringify(config, null, 2) + '\n'); created.push(CONFIG_FILE_NAME); }
	await generate(fs, config);
	return created;
}
