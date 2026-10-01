import * as path from 'node:path';
import { CapatazConfig, CapatazTreeNode, defaultSystemsDir } from '../config';
import { ProjectFs, walk } from '../core/fs';
import { buildProject } from '../core/project';

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

export function sourceSide(file: string, config: CapatazConfig, instance = ''): Side | undefined {
	if (/\.client\.lua[u]?$/.test(file)) { return 'Client'; }
	if (/\.server\.lua[u]?$/.test(file)) { return 'Server'; }
	const systems = defaultSystemsDir(config).replace(/\/$/, '');
	const relative = file.startsWith(systems + '/') ? file.slice(systems.length + 1).split('/')[1] : undefined;
	if (relative === 'Client' || relative === 'Server' || relative === 'Shared') { return relative; }
	if (/^src\/(Client|Core\/(Client|First))\//.test(file)) { return 'Client'; }
	if (file.startsWith('src/Core/Server/')) { return 'Server'; }
	if (file.startsWith('src/Core/Shared/')) { return 'Shared'; }
	if (/^(ServerScriptService|ServerStorage)(\/|$)/.test(instance)) { return 'Server'; }
	if (/^(StarterPlayer|StarterGui|StarterPack|ReplicatedFirst)(\/|$)/.test(instance)) { return 'Client'; }
	if (/^ReplicatedStorage(\/|$)/.test(instance)) { return 'Shared'; }
	return undefined;
}

export async function createIndex(fs: ProjectFs, config: CapatazConfig): Promise<ProjectIndex> {
	const index: ProjectIndex = { modules: new Map(), instances: new Map(), aliases: {}, config };
	if (await fs.exists('.luaurc')) {
		const luaurc = JSON.parse(await fs.read('.luaurc'));
		index.aliases = luaurc.aliases ?? {};
	}
	const add = (file: string, instance: string, className?: string) => {
		if (!/\.lua[u]?$/.test(file)) { return; }
		const module = className ? className === 'ModuleScript' : !/\.(client|server)\.lua[u]?$/.test(file);
		const info = { file, instance, side: sourceSide(file, config, instance), module };
		index.modules.set(file, info); index.instances.set(instance, info);
	};
	const mount = async (node: CapatazTreeNode, instance: string) => {
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
				add(file, suffix ? `${instance}/${suffix}` : instance, className);
			}
		}
		for (const [name, child] of Object.entries(node)) {
			if (!name.startsWith('$') && child && typeof child === 'object') { await mount(child, instance ? `${instance}/${name}` : name); }
		}
	};
	await mount((await buildProject(fs, config)).tree as CapatazTreeNode, '');
	// Unmounted source still gets checked, but has no invented runtime location.
	for (const directory of new Set(['src', defaultSystemsDir(config)])) {
		for (const file of await walk(fs, directory)) {
			if (/\.lua[u]?$/.test(file) && !index.modules.has(file)) { index.modules.set(file, { file, instance: '', side: sourceSide(file, config), module: !/\.(client|server)\.lua[u]?$/.test(file) }); }
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
		let root = roots?.[alias] ?? Object.entries(roots ?? {}).find(([name]) => name.toLowerCase() === alias.toLowerCase())?.[1];
		if (!roots) {
			if (alias.toLowerCase() === 'systems') { root = parts[1]?.toLowerCase() === 'server' ? 'ServerScriptService/Systems' : 'ReplicatedStorage/Systems'; }
			if (alias.toLowerCase() === 'core') {
				root = parts[0]?.toLowerCase() === 'server' ? 'ServerScriptService/Core' : 'ReplicatedStorage/Core';
				if (parts[0]?.toLowerCase() === 'server') { parts[0] = 'Server'; }
			}
		}
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
