import { CapatazConfig, CapatazTreeNode, CONFIG_FILE_NAME, defaultSystemsDir } from '../config';
import { ProjectFs } from './fs';

export async function readConfig(fs: ProjectFs): Promise<CapatazConfig> {
	if (!(await fs.exists(CONFIG_FILE_NAME))) { throw new Error(`No ${CONFIG_FILE_NAME}; run capataz init first.`); }
	const config: CapatazConfig = JSON.parse(await fs.read(CONFIG_FILE_NAME));
	if (!config || !config.tree || typeof config.tree !== 'object' || !config.tree.ReplicatedStorage || typeof config.tree.ReplicatedStorage !== 'object' || !config.tree.ServerScriptService || typeof config.tree.ServerScriptService !== 'object') {
		throw new Error(`${CONFIG_FILE_NAME}: tree must define ReplicatedStorage and ServerScriptService.`);
	}
	if (config.systemsDir !== undefined && typeof config.systemsDir !== 'string') { throw new Error('systemsDir must be a string.'); }
	const systems = defaultSystemsDir(config).replace(/\\/g, '/');
	if (systems.startsWith('/') || /^[A-Za-z]:/.test(systems) || systems.split('/').includes('..') || !systems) { throw new Error('systemsDir must be a directory inside the project.'); }
	return config;
}

export async function buildProject(fs: ProjectFs, config: CapatazConfig): Promise<Record<string, unknown>> {
	const directory = defaultSystemsDir(config);
	if (!(await fs.exists(directory))) { throw new Error(`Systems directory does not exist: ${directory}`); }
	const replicated: CapatazTreeNode = { $className: 'Folder' };
	const server: CapatazTreeNode = { $className: 'Folder' };
	for (const [name, isDirectory] of (await fs.entries(directory)).sort(([a], [b]) => a.localeCompare(b))) {
		if (!isDirectory) { continue; }
		for (const [target, parts] of [[replicated, ['Client', 'Shared']], [server, ['Server']]] as const) {
			const node: CapatazTreeNode = { $className: 'Folder' };
			for (const part of parts) {
				const relative = `${directory}/${name}/${part}`;
				if (await fs.exists(relative)) { node[part] = { $path: relative }; }
			}
			if (Object.keys(node).length > 1) { target[name] = node; }
		}
	}
	const tree = structuredClone(config.tree);
	(tree.ReplicatedStorage as CapatazTreeNode).Systems = replicated;
	(tree.ServerScriptService as CapatazTreeNode).Systems = server;
	const { systemsDir: _systemsDir, ...settings } = config;
	return { ...settings, tree };
}

export const projectText = (project: Record<string, unknown>) => JSON.stringify(project, null, 2) + '\n';

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) { return value.map(canonical); }
	if (value && typeof value === 'object') { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])); }
	return value;
}
export async function projectIssues(fs: ProjectFs, config: CapatazConfig): Promise<string[]> {
	const expected = await buildProject(fs, config), issues: string[] = [];
	const mounts = async (node: unknown) => {
		if (!node || typeof node !== 'object') { return; }
		for (const [key, value] of Object.entries(node)) {
			if (key === '$path' && (typeof value !== 'string' || !(await fs.exists(value)))) { issues.push(`Missing or invalid mount: ${String(value)}`); }
			else if (!key.startsWith('$')) { await mounts(value); }
		}
	};
	await mounts(expected.tree);
	if (!(await fs.exists('default.project.json')) || JSON.stringify(canonical(JSON.parse(await fs.read('default.project.json')))) !== JSON.stringify(canonical(expected))) { issues.push('default.project.json is stale or missing; run capataz project generate.'); }
	return issues;
}

export async function generate(fs: ProjectFs, config: CapatazConfig): Promise<void> {
	await fs.write('default.project.json', projectText(await buildProject(fs, config)));
}

export function systemName(input: string): string {
	if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(input)) { throw new Error('System names must start with a letter and contain only letters, digits, or underscores.'); }
	return input.endsWith('System') ? input : input + 'System';
}

export async function newSystem(fs: ProjectFs, config: CapatazConfig, input: string): Promise<string> {
	const name = systemName(input);
	const directory = `${defaultSystemsDir(config)}/${name}`;
	if (await fs.exists(directory)) { throw new Error(`System '${name}' already exists.`); }
	for (const part of ['Client', 'Server', 'Shared']) { await fs.write(`${directory}/${part}/.gitkeep`, ''); }
	await generate(fs, config);
	return name;
}
