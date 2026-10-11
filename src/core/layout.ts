import * as path from 'node:path';
import { CapatazConfig, CapatazTreeNode } from '../config';

function merge(base: CapatazTreeNode, extra: CapatazTreeNode): CapatazTreeNode {
	const result = structuredClone(extra.$path !== undefined ? {} : base);
	for (const [key, value] of Object.entries(extra)) {
		result[key] = !key.startsWith('$') && value && typeof value === 'object' && result[key] && typeof result[key] === 'object'
			? merge(result[key] as CapatazTreeNode, value) : structuredClone(value);
	}
	return result;
}

export function selectLayout(config: CapatazConfig, file = config.projectFile ?? 'default.project.json'): CapatazConfig {
	const layout = Object.values(config.projects ?? {}).find(item => item.projectFile === file);
	const selected = { ...config, ...layout, projectFile: file, tree: merge(config.tree, layout?.tree ?? {}) };
	if (selected.coreDir) {
		const core = selected.coreDir;
		selected.tree = merge(selected.tree, {
			ReplicatedStorage: { Core: { Client: { $path: `${core}/Client` }, Shared: { $path: `${core}/Shared` } } },
			ReplicatedFirst: { Core: { First: { $path: `${core}/First` } } },
			ServerScriptService: { Core: { Server: { $path: `${core}/Server` } } },
		});
		// Explicit tree entries can refine individual Core mounts.
		selected.tree = merge(selected.tree, layout?.tree ?? {});
	}
	return selected;
}

export function layouts(config: CapatazConfig): CapatazConfig[] {
	return config.projects ? Object.values(config.projects).map(item => selectLayout(config, item.projectFile)) : [selectLayout(config)];
}

/** Resolve a source location from explicit mounts, including an ancestor directory mount. */
export function sourcePath(config: CapatazConfig, instance: string, fallback: string): string {
	let node: CapatazTreeNode | undefined = config.tree;
	let mounted: string | undefined;
	for (const segment of instance.split('/')) {
		node = node?.[segment] as CapatazTreeNode | undefined;
		mounted = node?.$path ?? (mounted ? mounted + '/' + segment : undefined);
	}
	return mounted ?? fallback;
}

export function corePath(config: CapatazConfig, part: 'Client' | 'Server' | 'Shared' | 'First'): string {
	const service = part === 'Server' ? 'ServerScriptService' : part === 'First' ? 'ReplicatedFirst' : 'ReplicatedStorage';
	return sourcePath(config, service + '/Core/' + part, (config.coreDir ?? 'src/Core') + '/' + part);
}

export function routeFile(config: CapatazConfig): string {
	if (config.projects || config.systemRoots) { return `.capataz/generated/${config.projectFile ?? 'default.project.json'}/SystemRoutes.luau`; }
	return `${corePath(config, 'Shared')}/CustomRequirer/SystemRoutes.luau`;
}

export function validateLayouts(config: CapatazConfig): void {
	const directory = (value: unknown, label: string) => {
		if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) || value.includes(':') || value.split('/').some(part => !part || part === '.' || part === '..')) { throw new Error(`${label} must be a workspace-relative directory without traversal.`); }
	};
	if (config.coreDir !== undefined) { directory(config.coreDir, 'coreDir'); }
	if (config.projects === undefined) { return; }
	if (!config.projects || typeof config.projects !== 'object' || Array.isArray(config.projects) || !Object.keys(config.projects).length) { throw new Error('projects must contain named project layouts.'); }
	const outputs = new Set<string>();
	const roots: string[] = [];
	for (const [name, layout] of Object.entries(config.projects)) {
		if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !layout || typeof layout !== 'object') { throw new Error(`Invalid project layout '${name}'.`); }
		directory(layout.projectFile, `projects.${name}.projectFile`);
		if (!layout.projectFile.endsWith('.project.json') || outputs.has(layout.projectFile.toLowerCase())) { throw new Error(`Project outputs must be unique .project.json files: ${layout.projectFile}`); }
		outputs.add(layout.projectFile.toLowerCase());
		if (!config.systemRoots) {
		directory(layout.systemsDir, `projects.${name}.systemsDir`);
		const root = layout.systemsDir!.toLowerCase();
		if (roots.some(other => root === other || root.startsWith(other + '/') || other.startsWith(root + '/'))) { throw new Error('Project systemsDir roots must be separate and non-overlapping; mount shared modules through tree instead.'); }
		roots.push(root);
		}
		if (layout.coreDir !== undefined) { directory(layout.coreDir, `projects.${name}.coreDir`); }
		if (layout.tree !== undefined && (!layout.tree || typeof layout.tree !== 'object' || Array.isArray(layout.tree))) { throw new Error(`projects.${name}.tree must be an object.`); }
	}
	if (!Object.values(config.projects).some(layout => layout.projectFile === (config.projectFile ?? 'default.project.json'))) { throw new Error('projectFile must select one of the registered projects.'); }
}

export function selectSystemRoot(config: CapatazConfig, name?: string): CapatazConfig {
	if (!config.systemRoots) {
		if (name !== undefined) { throw new Error('--systems-root requires configured systemRoots.'); }
		return config;
	}
	const roots = Object.keys(config.systemMounts ?? {});
	const selected = name ?? config.selectedSystemRoot ?? (roots.length === 1 ? roots[0] : undefined);
	if (!selected || !roots.includes(selected)) { throw new Error('Select a system root with --systems-root <name>. Available: ' + roots.join(', ')); }
	return { ...config, selectedSystemRoot: selected };
}

export function validateSystemRoots(config: CapatazConfig): void {
	if (config.systemRoots === undefined) { return; }
	const roots = config.systemRoots;
	if (!roots || typeof roots !== 'object' || Array.isArray(roots) || !Object.keys(roots).length) { throw new Error('systemRoots must define named source directories.'); }
	const seen: string[] = [];
	const aliases = new Set<string>();
	for (const [name, directory] of Object.entries(roots)) {
		if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || typeof directory !== 'string' || !directory || directory.includes('\\') || directory.includes(':') || directory.split('/').some(part => !part || part === '..' || part === '.')) { throw new Error(`Invalid systemRoots entry '${name}'. Use a workspace-relative directory.`); }
		if (aliases.has(name.toLowerCase())) { throw new Error('System root names must be unique ignoring case.'); } aliases.add(name.toLowerCase());
		const value = directory.toLowerCase();
		if (seen.some(other => value === other || value.startsWith(other + '/') || other.startsWith(value + '/'))) { throw new Error('System root directories must not overlap; reuse the same named root in multiple projects.'); }
		seen.push(value);
	}
	for (const layout of layouts(config)) {
		if (layout.routeModule !== undefined && layout.routeModule !== false && (typeof layout.routeModule !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(\/[A-Za-z][A-Za-z0-9_]*)+$/.test(layout.routeModule) || layout.routeModule.split('/').some(part => ['__proto__', 'constructor', 'prototype'].includes(part)))) { throw new Error('routeModule must be false or a service-rooted instance path.'); }
		if (!layout.systemMounts || typeof layout.systemMounts !== 'object' || Array.isArray(layout.systemMounts)) { throw new Error(`${layout.projectFile}: systemMounts must map system roots to Roblox destinations.`); }
		for (const [name, mounts] of Object.entries(layout.systemMounts)) {
			if (!Object.hasOwn(roots, name) || !mounts || typeof mounts !== 'object' || Array.isArray(mounts) || !Object.keys(mounts).length) { throw new Error(`Invalid systemMounts entry '${name}'.`); }
			const names = new Set<string>();
			for (const [folder, destination] of Object.entries(mounts)) {
				if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(folder) || names.has(folder.toLowerCase()) || typeof destination !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(\/[A-Za-z][A-Za-z0-9_]*)+$/.test(destination) || destination.split('/').some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) { throw new Error(`Invalid or ambiguous mount for ${name}/${folder}. Use a service-rooted instance path.`); }
				names.add(folder.toLowerCase());
			}
		}
	}
}
