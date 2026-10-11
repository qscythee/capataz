import { selectLayout } from '../core/layout';
import * as path from 'node:path';
import { CapatazConfig, CapatazTreeNode, LintTarget, defaultSystemsDir } from '../config';
import { ProjectFs, walk } from '../core/fs';
import { buildProject, discoverSystems, resolveSystemRoute } from '../core/project';

export type Side = 'Client' | 'Server' | 'Shared';
export interface ModuleInfo { file: string; instance: string; side?: Side; module: boolean }
export interface ProjectIndex {
	modules: Map<string, ModuleInfo>;
	instances: Map<string, ModuleInfo>;
	aliases: Record<string, string>;
	config: CapatazConfig;
}

const slash = (value: string) => value.replace(/\\/g, '/');
export const normalize = (value: string) => path.posix.normalize(slash(value)).replace(/^\.\//, '');

export function sourceSide(file: string, config: CapatazConfig, instance = '', systemPaths?: Set<string>): Side | undefined {
	if (/\.client\.lua[u]?$/.test(file)) { return 'Client'; }
	if (/\.server\.lua[u]?$/.test(file)) { return 'Server'; }
	if (config.systemRoots) {
		for (const [rootName, mounts] of Object.entries(config.systemMounts ?? {})) {
			const directory = config.systemRoots[rootName];
			if (!file.startsWith(directory + '/')) { continue; }
			const parts = file.slice(directory.length + 1).split('/');
			for (const [folder, destination] of Object.entries(mounts)) {
				for (let i = 1; i < parts.length - 1; i++) {
					const prefix = destination + '/' + parts.slice(0, i).join('/') + '/' + folder;
					if (parts[i].toLowerCase() !== folder.toLowerCase() || !(instance === prefix || instance.startsWith(prefix + '/'))) { continue; }
					if (folder.toLowerCase() === 'client') { return 'Client'; }
					if (folder.toLowerCase() === 'server') { return 'Server'; }
					if (folder.toLowerCase() === 'shared') { return 'Shared'; }
				}
			}
		}
		const service = instance.split('/')[0];
		return ['ServerScriptService', 'ServerStorage'].includes(service) ? 'Server' : ['ReplicatedFirst', 'StarterPlayer', 'StarterGui', 'StarterPack'].includes(service) ? 'Client' : service === 'ReplicatedStorage' ? 'Shared' : undefined;
	}
	const systems = defaultSystemsDir(config).replace(/\/$/, '');
	const segments = file.startsWith(systems + '/') ? file.slice(systems.length + 1).split('/') : [];
	const boundary = segments.findIndex((part, i) => systemPaths ? systemPaths.has(segments.slice(0, i + 1).join('/')) : part.endsWith('System'));
	const relative = boundary >= 0 ? segments[boundary + 1] : undefined;
	if (relative) {
		const route = resolveSystemRoute(config, relative);
		if (route) {
			const name = route.name.toLowerCase();
			if (name === 'client') { return 'Client'; }
			if (name === 'server') { return 'Server'; }
			if (name === 'shared') { return 'Shared'; }
			if (/^(ServerScriptService|ServerStorage)$/i.test(route.service)) { return 'Server'; }
			if (/^(StarterPlayer|StarterGui|StarterPack|ReplicatedFirst)$/i.test(route.service)) { return 'Client'; }
			if (/^ReplicatedStorage$/i.test(route.service)) { return 'Shared'; }
		}
	}
	if (/^src\/Core\/(Client|First)\//.test(file)) { return 'Client'; }
	if (file.startsWith('src/Core/Server/')) { return 'Server'; }
	if (file.startsWith('src/Core/Shared/')) { return 'Shared'; }
	if (/^(ServerScriptService|ServerStorage)(\/|$)/.test(instance)) { return 'Server'; }
	if (/^(StarterPlayer|StarterGui|StarterPack|ReplicatedFirst)(\/|$)/.test(instance)) { return 'Client'; }
	if (/^ReplicatedStorage(\/|$)/.test(instance)) { return 'Shared'; }
	return undefined;
}

export async function createIndex(fs: ProjectFs, config: CapatazConfig, target?: LintTarget): Promise<ProjectIndex> {
	config = selectLayout(config, target?.projectFile);
	const systems = target ? [] : await discoverSystems(fs, config);
	const systemPaths = new Set(systems.map(system => system.name));
	const index: ProjectIndex = { modules: new Map(), instances: new Map(), aliases: {}, config };
	if (await fs.exists('.luaurc')) {
		const luaurc = JSON.parse(await fs.read('.luaurc'));
		index.aliases = luaurc.aliases ?? {};
	}
	const add = (file: string, instance: string, className?: string, inheritedSide?: Side) => {
		if (!/\.lua[u]?$/.test(file)) { return; }
		const module = className ? className === 'ModuleScript' : !/\.(client|server)\.lua[u]?$/.test(file);
		const side = target
			? inheritedSide ?? (config.systemRoots ? sourceSide(file, config, instance) : undefined) ?? (/\.client\.lua[u]?$/.test(file) ? 'Client' : /\.server\.lua[u]?$/.test(file) ? 'Server' : /^(ServerScriptService|ServerStorage)(\/|$)/.test(instance) ? 'Server' : /^(ReplicatedFirst|StarterPlayer|StarterGui|StarterPack)(\/|$)/.test(instance) ? 'Client' : /^ReplicatedStorage\/(Core\/Client\/|Systems\/.+\/Client\/)/.test(instance) ? 'Client' : /^ReplicatedStorage(\/|$)/.test(instance) ? 'Shared' : undefined)
			: sourceSide(file, config, instance, systemPaths);
		if (target && index.modules.has(file) && index.modules.get(file)!.instance !== instance) { throw new Error('Source mounted more than once in ' + target.projectFile + ': ' + file); }
		const info = { file, instance, side, module };
		index.modules.set(file, info); index.instances.set(instance, info);
	};
	const mount = async (node: CapatazTreeNode, instance: string, inheritedSide?: Side) => {
		const properties = node.$properties as { RunContext?: string } | undefined;
		const side = properties?.RunContext === 'Client' ? 'Client' : properties?.RunContext === 'Server' ? 'Server' : inheritedSide;
		if (target && node.$path && !(await fs.exists(node.$path))) { throw new Error('Missing mount in ' + target.projectFile + ': ' + node.$path); }
		if (node.$path && await fs.exists(node.$path)) {
			const files = await walkMount(fs, node.$path);
			for (const file of files) {
				if (!/\.lua[u]?$/.test(file)) { continue; }
				const relative = file === node.$path ? '' : file.slice(node.$path.replace(/\/$/, '').length + 1);
				let suffix = relative.replace(/\.(client|server)\.lua[u]?$|\.lua[u]?$/, '').replace(/(^|\/)init$/, '');
				suffix = suffix.replace(/\/$/, '');
				let className = relative ? undefined : node.$className;
				const metadata = file.replace(/\.(client|server)\.lua[u]?$|\.lua[u]?$/, '.meta.json');
				if (await fs.exists(metadata)) { className = JSON.parse(await fs.read(metadata)).className ?? className; }
				add(file, suffix ? `${instance}/${suffix}` : instance, className, side);
			}
		}
		for (const [name, child] of Object.entries(node)) {
			if (!name.startsWith('$') && child && typeof child === 'object') { await mount(child, instance ? `${instance}/${name}` : name, side); }
		}
	};
	await mount(target ? await readTargetTree(fs, target.projectFile) : (await buildProject(fs, config, systems)).tree as CapatazTreeNode, '');
	// Unmounted source still gets checked, but has no invented runtime location.
	for (const directory of target ? [] : new Set(['src', defaultSystemsDir(config)])) {
		for (const file of await walk(fs, directory)) {
			if (/\.lua[u]?$/.test(file) && !index.modules.has(file)) { index.modules.set(file, { file, instance: '', side: sourceSide(file, config, '', systemPaths), module: !/\.(client|server)\.lua[u]?$/.test(file) }); }
		}
	}
	return index;
}

async function walkMount(fs: ProjectFs, relative: string): Promise<string[]> {
	if (/\.lua[u]?$/.test(relative)) { return [normalize(relative)]; }
	return walk(fs, relative);
}

export function resolveSource(index: ProjectIndex, target: string): ModuleInfo | undefined {
	const base = normalize(target);
	for (const suffix of ['', '.luau', '.lua', '/init.luau', '/init.lua']) {
		const info = index.modules.get(base + suffix);
		if (info) { return info; }
	}
	return undefined;
}

export function resolveCustom(index: ProjectIndex, caller: ModuleInfo, specifier: string, context: string, roots?: Record<string, string>, caseSensitive = true): ModuleInfo | undefined {
	let target: string;
	if (specifier.startsWith('@')) {
		const [alias, ...parts] = specifier.slice(1).split('/');
		const root = roots?.[alias] ?? Object.entries(roots ?? {}).find(([name]) => name.toLowerCase() === alias.toLowerCase())?.[1];

		if (!root) { return undefined; }
		target = `${root}/${parts.join('/')}`;
	} else {
		if (!context) { return undefined; }
		target = `${path.posix.dirname(context)}/${specifier}`;
	}
	const normalized = normalize(target);
	return index.instances.get(normalized) ?? (caseSensitive ? undefined : [...index.instances].find(([instance]) => instance.toLowerCase() === normalized.toLowerCase())?.[1]);
}

export function resolveNative(index: ProjectIndex, caller: ModuleInfo, specifier: string): ModuleInfo | undefined {
	if (specifier.startsWith('@')) {
		const [alias, ...parts] = specifier.slice(1).split('/');
		const root = index.aliases[alias];
		return root ? resolveSource(index, `${root}/${parts.join('/')}`) : undefined;
	}
	if (!specifier.startsWith('.')) { return undefined; }
	// Roblox relative imports follow the mounted DataModel, including init modules.
	if (caller.instance) { return index.instances.get(normalize(`${path.posix.dirname(caller.instance)}/${specifier}`)); }
	return resolveSource(index, `${path.posix.dirname(caller.file)}/${specifier}`);
}

async function readTargetTree(fs: ProjectFs, file: string, ancestors = new Set<string>()): Promise<CapatazTreeNode> {
	if (ancestors.has(file)) { throw new Error(`Cyclic project mount: ${file}`); }
	const visited = new Set(ancestors).add(file);
	const project = JSON.parse(await fs.read(file));
	if (!project?.tree || typeof project.tree !== 'object' || Array.isArray(project.tree)) { throw new Error(`Lint project '${file}' must define a tree.`); }
	const rebase = async (node: CapatazTreeNode) => {
		for (const [key, child] of Object.entries(node)) { if (!key.startsWith('$') && child && typeof child === 'object') { await rebase(child); } }
		if (node.$path) {
			if (path.posix.isAbsolute(node.$path) || /^[A-Za-z]:/.test(node.$path)) { throw new Error(`Lint mount must be workspace-relative: ${node.$path}`); }
			node.$path = normalize(path.posix.join(path.posix.dirname(file), node.$path.replace(/\\/g, '/')));
			if (node.$path === '..' || node.$path.startsWith('../')) { throw new Error(`Lint mount escapes the workspace: ${node.$path}`); }
			let nested = node.$path.endsWith('.project.json') ? node.$path : undefined;
			if (!nested && !/\.[^/]+$/.test(node.$path) && await fs.exists(node.$path + '/default.project.json')) { nested = node.$path + '/default.project.json'; }
			if (nested) {
				const child = await readTargetTree(fs, nested, visited);
				delete node.$path;
				Object.assign(node, { ...child, ...node });
			}
		}
	};
	await rebase(project.tree);
	return project.tree;
}
