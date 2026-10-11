import { selectLayout, layouts, validateLayouts, corePath, routeFile, validateSystemRoots, selectSystemRoot } from './layout';
import { previewFs } from './preview';
import * as path from 'node:path';
import { CapatazConfig, CapatazConfigFile, CapatazTreeNode, CONFIG_FILE_NAME, defaultSystemsDir } from '../config';
import { ProjectFs } from './fs';

const DEFAULT_ROUTES: Record<string, { name: string; service: string }> = {
	client: { name: 'Client', service: 'ReplicatedStorage' },
	server: { name: 'Server', service: 'ServerScriptService' },
	shared: { name: 'Shared', service: 'ReplicatedStorage' },
};
const ROBLOX_SERVICES = new Set([
	'Workspace', 'Players', 'Lighting', 'MaterialService', 'ReplicatedFirst', 'ReplicatedStorage',
	'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams',
	'SoundService', 'TextChatService', 'Chat', 'LocalizationService', 'TestService', 'RunService',
	'AnalyticsService', 'AssetService', 'BadgeService', 'CollectionService', 'ContentProvider',
	'ContextActionService', 'DataStoreService', 'Debris', 'GuiService', 'HttpService', 'InsertService',
	'MarketplaceService', 'MemoryStoreService', 'MessagingService', 'PathfindingService', 'PhysicsService',
	'PolicyService', 'ProximityPromptService', 'SocialService', 'Stats', 'TeleportService', 'TextService',
	'TweenService', 'UserInputService', 'VoiceChatService',
]);

export async function readConfig(fs: ProjectFs): Promise<CapatazConfig> {
	if (!(await fs.exists(CONFIG_FILE_NAME))) { throw new Error(`No ${CONFIG_FILE_NAME}; run capataz init first.`); }
	const raw = JSON.parse(await fs.read(CONFIG_FILE_NAME)) as CapatazConfigFile;
	if (!raw || typeof raw.project !== 'object' || !raw.project) { throw new Error(`${CONFIG_FILE_NAME}: missing 'project' object.`); }
	const config: CapatazConfig = { ...raw.project, ...(raw.systemRoots !== undefined ? { systemRoots: raw.systemRoots } : {}), ...(raw.projects !== undefined ? { projects: raw.projects } : {}), ...(raw.projectFile !== undefined ? { projectFile: raw.projectFile } : {}), ...(raw.systemRoutes !== undefined ? { systemRoutes: raw.systemRoutes } : {}), ...(raw.lint !== undefined ? { lint: raw.lint } : {}) };
	if (!config || !config.tree || typeof config.tree !== 'object' || (!config.systemRoots && (!config.tree.ReplicatedStorage || typeof config.tree.ReplicatedStorage !== 'object' || !config.tree.ServerScriptService || typeof config.tree.ServerScriptService !== 'object'))) {
		throw new Error(`${CONFIG_FILE_NAME}: tree must define ReplicatedStorage and ServerScriptService.`);
	}
	if (config.emitLegacyScripts !== false) { throw new Error(`${CONFIG_FILE_NAME}: project.emitLegacyScripts must be false.`); }
	if (config.systemsDir !== undefined && typeof config.systemsDir !== 'string') { throw new Error('systemsDir must be a string.'); }
	defaultProjectFile(config);
	validateLayouts(config);
	validateSystemRoots(config);
	for (const layout of layouts(config)) { validateSystemRoutes(layout); }
	validateSystemRoutes(config);
	validateLintConfig(config);
	for (const [name, target] of Object.entries(config.lint?.targets ?? {})) {
		if (config.projects?.[name] && config.projects[name].projectFile !== target.projectFile) { throw new Error(`Lint target ${name} must use the same projectFile as its project layout.`); }
	}
	const systems = (config.systemRoots ? 'explicit' : defaultSystemsDir(config)).replace(/\\/g, '/');
	if (systems.startsWith('/') || /^[A-Za-z]:/.test(systems) || systems.split('/').includes('..') || !systems) { throw new Error('systemsDir must be a directory inside the project.'); }
	return config;
}

export function configFileText(config: CapatazConfig): string {
	const { systemRoutes, lint, projectFile, projects, systemRoots, selectedSystemRoot: _selected, ...project } = config;
	const file: CapatazConfigFile = {
		project,
		...(systemRoots !== undefined ? { systemRoots } : {}),
		...(projects !== undefined ? { projects } : {}),
		...(projectFile !== undefined ? { projectFile } : {}),
		...(systemRoutes !== undefined ? { systemRoutes } : {}),
		...(lint !== undefined ? { lint } : {}),
	};
	return JSON.stringify(file, null, 2) + '\n';
}

function validateLintConfig(config: CapatazConfig): void {
	if (config.lint === undefined) { return; }
	if (!config.lint || typeof config.lint !== 'object' || Array.isArray(config.lint)) { throw new Error('lint must be an object.'); }
	const { rules, ignoreGlobs, importFactories, targets, requirerModules } = config.lint;
	if (requirerModules !== undefined && (!Array.isArray(requirerModules) || requirerModules.some(file => typeof file !== 'string' || !/\.lua[u]?$/.test(file) || file.includes('\\') || file.includes(':') || file.startsWith('/') || file.split('/').includes('..')))) { throw new Error('lint.requirerModules must contain workspace-relative Luau module paths.'); }
	if (targets !== undefined) {
		if (!targets || typeof targets !== 'object' || Array.isArray(targets) || !Object.keys(targets).length) { throw new Error('lint.targets must be a non-empty object of named targets.'); }
		for (const [name, target] of Object.entries(targets)) {
			if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !target || typeof target !== 'object' || Array.isArray(target)) { throw new Error('Invalid lint target: ' + name); }
			projectFilePath(target.projectFile);
			if (target.includeGlobs !== undefined && (!Array.isArray(target.includeGlobs) || target.includeGlobs.some(glob => typeof glob !== 'string' || !glob.trim()))) { throw new Error('lint.targets.' + name + '.includeGlobs must be an array of non-empty strings.'); }
		}
	}
	if (importFactories !== undefined) {
		if (!importFactories || typeof importFactories !== 'object' || Array.isArray(importFactories)) { throw new Error('lint.importFactories must be an object keyed by project-relative factory module paths.'); }
		for (const [file, environments] of Object.entries(importFactories)) {
			if (!/\.(lua[u]?|rbxm|rbxmx|model\.json|meta\.json)$/i.test(file) || file.includes('\\') || file.includes(':') || file.split('/').some(part => !part || part === '.' || part === '..')) { throw new Error('Invalid lint.importFactories module path: ' + file); }
			if (!environments || typeof environments !== 'object' || Array.isArray(environments) || !Object.keys(environments).length) { throw new Error('Factory declarations require client and/or server mappings.'); }
			for (const [environment, declaration] of Object.entries(environments)) {
				if (!['client', 'server'].includes(environment) || !declaration || typeof declaration !== 'object' || Array.isArray(declaration)) { throw new Error('Factory declarations require client and/or server mappings.'); }
				if (declaration.caseSensitive !== undefined && typeof declaration.caseSensitive !== 'boolean') { throw new Error('Factory caseSensitive must be a boolean.'); }
				if (!declaration.aliases || typeof declaration.aliases !== 'object' || Array.isArray(declaration.aliases)) { throw new Error('Factory aliases must map names to service-rooted DataModel paths.'); }
				const seen = new Set<string>();
				for (const [alias, target] of Object.entries(declaration.aliases)) {
					if (!/^[A-Za-z0-9_-]+$/.test(alias) || seen.has(alias.toLowerCase())) { throw new Error('Factory aliases must be unique names without @ or slashes.'); }
					seen.add(alias.toLowerCase());
					if (typeof target !== 'string' || target.includes('\\') || !ROBLOX_SERVICES.has(target.split('/')[0]) || target.split('/').some(part => !part.trim() || part === '.' || part === '..')) { throw new Error('Factory alias targets must be service-rooted DataModel paths.'); }
				}
			}
		}
	}
	if (ignoreGlobs !== undefined && (!Array.isArray(ignoreGlobs) || ignoreGlobs.some(glob => typeof glob !== 'string' || !glob.trim()))) {
		throw new Error('lint.ignoreGlobs must be an array of non-empty strings.');
	}
	if (rules === undefined) { return; }
	if (!rules || typeof rules !== 'object' || Array.isArray(rules)) { throw new Error('lint.rules must be an object.'); }
	for (const [rule, level] of Object.entries(rules)) {
		if (rule !== 'dynamic-require') { throw new Error(`Unsupported lint rule '${rule}'.`); }
		if (level !== 'off' && level !== 'warn') { throw new Error(`lint.rules.${rule} must be 'off' or 'warn'.`); }
	}
}

function validateSystemRoutes(config: CapatazConfig): void {
	if (config.systemRoutes === undefined) { return; }
	if (!config.systemRoutes || typeof config.systemRoutes !== 'object' || Array.isArray(config.systemRoutes)) { throw new Error('systemRoutes must be an object mapping route names to Roblox services.'); }
	const seen = new Set<string>();
	for (const [route, service] of Object.entries(config.systemRoutes)) {
		if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(route)) { throw new Error(`Invalid system route name '${route}'.`); }
		if (typeof service !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(service)) { throw new Error(`systemRoutes.${route} must name a Roblox service.`); }
		const key = route.toLowerCase();
		if (seen.has(key)) { throw new Error(`systemRoutes contains case-insensitive duplicate route '${route}'.`); }
		seen.add(key);
	}
}

interface SystemRoute { name: string; service: string }

function configuredRoutes(config: CapatazConfig): Map<string, SystemRoute> {
	validateSystemRoutes(config);
	const routes = new Map<string, SystemRoute>(Object.entries(DEFAULT_ROUTES));
	for (const [name, service] of Object.entries(config.systemRoutes ?? {})) { routes.set(name.toLowerCase(), { name, service: serviceName(service, config) ?? service }); }
	return routes;
}

export function resolveSystemRoute(config: CapatazConfig, part: string): SystemRoute | undefined {
	const configured = configuredRoutes(config).get(part.toLowerCase());
	if (configured) { return configured; }
	const service = serviceName(part, config);
	return service ? { name: service, service } : undefined;
}

function serviceName(name: string, config: CapatazConfig): string | undefined {
	const configured = Object.keys(config.tree).find(key => key.toLowerCase() === name.toLowerCase());
	if (configured && (config.tree[configured] as CapatazTreeNode)?.$className === configured) { return configured; }
	return [...ROBLOX_SERVICES].find(service => service.toLowerCase() === name.toLowerCase());
}

export interface DiscoveredSystem {
	name: string;
	parts: { directory: string; route: SystemRoute }[];
}

/** Stop at explicit system boundaries; route contents are ordinary module trees. */
export async function discoverSystems(fs: ProjectFs, config: CapatazConfig): Promise<DiscoveredSystem[]> {
	config = selectLayout(config);
	const root = defaultSystemsDir(config);
	const systems: DiscoveredSystem[] = [];
	const visit = async (name: string): Promise<void> => {
		const directory = name ? `${root}/${name}` : root;
		const entries = (await fs.entries(directory)).sort(([a], [b]) => a.localeCompare(b));
		const marker = entries.find(([entry]) => entry === 'system.json');
		if (marker) {
			if (marker[1]) { throw new Error(`${directory}/system.json must be a JSON file containing {}.`); }
			let value: unknown;
			try { value = JSON.parse(await fs.read(`${directory}/system.json`)); }
			catch { throw new Error(`${directory}/system.json must contain a valid JSON object: {}.`); }
			if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) { throw new Error(`${directory}/system.json must contain {} (no settings are supported).`); }
		}
		if (!name && marker) { throw new Error(`${root} is the systems root, not a system; move system.json into a system folder.`); }
		if (name && (name.split('/').at(-1)!.endsWith('System') || marker)) {
			const parts: DiscoveredSystem['parts'] = [], mounted = new Set<string>();
			for (const [part, isDirectory] of entries) {
				if (!isDirectory || part.startsWith('.') || part === 'node_modules') { continue; }
				const mapping = config.systemRoots ? Object.entries(config.systemMounts?.[config.selectedSystemRoot ?? Object.keys(config.systemMounts ?? {})[0]] ?? {}).find(([folder]) => folder.toLowerCase() === part.toLowerCase()) : undefined;
				const route = config.systemRoots ? (mapping ? { name: mapping[0], service: mapping[1].split('/')[0] } : undefined) : resolveSystemRoute(config, part);
				if (!route) { throw new Error(`System '${name}' contains unsupported folder '${part}'. Put modules inside a route; systems cannot contain other systems or groups.`); }
				if (mounted.has(route.name.toLowerCase())) { throw new Error(`System '${name}' has multiple folders for route '${route.name}' (route names are case-insensitive).`); }
				mounted.add(route.name.toLowerCase()); parts.push({ directory: part, route });
			}
			systems.push({ name, parts }); return;
		}
		if (entries.some(([file, directory]) => !directory && /\.lua[u]?$/.test(file))) {
			const owner = resolveSystemRoute(config, name.split('/').at(-1) ?? '') ? directory.slice(0, directory.lastIndexOf('/')) : directory;
			throw new Error(`Unrouted source in '${directory}'. Identify the owning system with the System suffix or ${owner}/system.json containing {}, and keep modules inside a route.`);
		}
		for (const [child, isDirectory] of entries) {
			if (!isDirectory || child.startsWith('.') || child === 'node_modules') { continue; }
			if (child.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(child)) { throw new Error(`Unsupported grouping folder '${directory}/${child}'.`); }
			await visit(name ? `${name}/${child}` : child);
		}
	};
	await visit('');
	return systems;
}

function projectRoutes(config: CapatazConfig, systems: DiscoveredSystem[]): Map<string, SystemRoute> {
	const routes = configuredRoutes(config);
	for (const system of systems) {
		for (const { directory, route } of system.parts) { routes.set(directory.toLowerCase(), route); }
	}
	return routes;
}

function ensureServiceSystems(tree: CapatazTreeNode, service: string): CapatazTreeNode {
	let root = tree[service];
	if (!root || typeof root !== 'object') { root = { $className: service }; tree[service] = root; }
	const serviceNode = root as CapatazTreeNode;
	const systemsNode: CapatazTreeNode = { $className: 'Folder' };
	serviceNode.Systems = systemsNode;
	return systemsNode;
}

export async function buildProject(fs: ProjectFs, config: CapatazConfig, discovered?: DiscoveredSystem[]): Promise<Record<string, unknown>> {
	config = selectLayout(config);
	if (config.systemRoots) { return buildMappedProject(fs, config); }
	const directory = defaultSystemsDir(config);
	if (!(await fs.exists(directory))) { throw new Error(`Systems directory does not exist: ${directory}`); }
	const tree = structuredClone(config.tree);
	if (config.emitLegacyScripts !== false) { throw new Error('emitLegacyScripts must be false to use modern client scripts in ReplicatedStorage.'); }
	const core = ((tree.ReplicatedStorage as CapatazTreeNode).Core ??= { $className: 'Folder' }) as CapatazTreeNode;
	core.Client ??= { $path: corePath(config, 'Client') };
	let replicatedFirst = tree.ReplicatedFirst;
	if (!replicatedFirst || typeof replicatedFirst !== 'object') {
		replicatedFirst = { $className: 'ReplicatedFirst' };
		tree.ReplicatedFirst = replicatedFirst;
	}
	const firstRoot = replicatedFirst as CapatazTreeNode;
	const firstCore = ((firstRoot.Core ??= { $className: 'Folder' })) as CapatazTreeNode;
	firstCore.First ??= { $path: corePath(config, 'First') };
	if (config.projects) {
		(tree.ReplicatedStorage as CapatazTreeNode).CapatazSystemRoutes = { $path: routeFile(config) };
	}
	const systems = discovered ?? await discoverSystems(fs, config);
	const routes = projectRoutes(config, systems);
	const routeSystems = new Map<string, CapatazTreeNode>();
	for (const route of routes.values()) {
		if (!routeSystems.has(route.service)) { routeSystems.set(route.service, ensureServiceSystems(tree, route.service)); }
	}
	for (const { name, parts } of systems) {
		for (const { directory: part, route } of parts) {
			let target = routeSystems.get(route.service)!;
			for (const segment of name.split('/')) {
				target = (target[segment] ??= { $className: 'Folder' }) as CapatazTreeNode;
			}
			target[route.name] = { $path: `${directory}/${name}/${part}` };
		}
	}
	const { systemsDir: _systemsDir, systemRoutes: _systemRoutes, lint: _lint, projectFile: _projectFile, projects: _projects, coreDir: _coreDir, systemRoots: _systemRoots, systemMounts: _systemMounts, selectedSystemRoot: _selectedRoot, routeModule: _routeModule, ...settings } = config;
	return { ...settings, tree };
}

export const projectText = (project: Record<string, unknown>) => JSON.stringify(project, null, 2) + '\n';

function routeText(config: CapatazConfig, systems: DiscoveredSystem[]): string {
	const entries = [...projectRoutes(config, systems).values()].sort((a, b) => a.name.localeCompare(b.name));
	const paths = systems.map(system => `\t[${JSON.stringify(system.name)}] = true,`).join('\n');
	return `-- Generated by Capataz. Edit systemRoutes in capataz.config.json instead.\nlocal systems = {\n${paths}\n}\nreturn {\n${entries.map(route => `\t[${JSON.stringify(route.name.toLowerCase())}] = { Service = ${JSON.stringify(route.service)}, Name = ${JSON.stringify(route.name)}, Systems = systems },`).join('\n')}\n}\n`;
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) { return value.map(canonical); }
	if (value && typeof value === 'object') { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])); }
	return value;
}
export async function projectIssues(fs: ProjectFs, config: CapatazConfig): Promise<string[]> {
	config = selectLayout(config);
	const ROUTE_FILE = routeFile(config);
	const systems = config.systemRoots ? [] : await discoverSystems(fs, config);
	const expected = await buildProject(fs, config, systems), issues: string[] = [];
	const mounts = async (node: unknown) => {
		if (!node || typeof node !== 'object') { return; }
		for (const [key, value] of Object.entries(node)) {
			if (key === '$path' && (typeof value !== 'string' || !(await fs.exists(value)))) { issues.push(`Missing or invalid mount: ${String(value)}`); }
			else if (!key.startsWith('$')) { await mounts(value); }
		}
	};
	await mounts(expected.tree);
	const file = defaultProjectFile(config);
	if (!(await fs.exists(file)) || JSON.stringify(canonical(JSON.parse(await fs.read(file)))) !== JSON.stringify(canonical(projectForOutput(expected, file)))) { issues.push(`${file} is stale or missing; run capataz project generate.`); }
	if (!(await fs.exists(ROUTE_FILE)) || await fs.read(ROUTE_FILE) !== (config.systemRoots ? await mappedRouteText(fs, config) : routeText(config, systems))) { issues.push(`${ROUTE_FILE} is stale or missing; run capataz project generate.`); }
	return issues;
}

export async function generate(fs: ProjectFs, config: CapatazConfig): Promise<boolean> {
	config = selectLayout(config);
	const ROUTE_FILE = routeFile(config);
	const systems = config.systemRoots ? [] : await discoverSystems(fs, config);
	const project = await buildProject(fs, config, systems), routes = config.systemRoots ? await mappedRouteText(fs, config) : routeText(config, systems);
	const outputs: [string, string][] = [[defaultProjectFile(config), projectText(projectForOutput(project, defaultProjectFile(config)))], [ROUTE_FILE, routes]];
	let changed = false;
	for (const [file, content] of outputs) {
		if (await fs.exists(file) && await fs.read(file) === content) { continue; }
		await fs.write(file, content);
		changed = true;
	}
	return changed;
}

export function validateSystemPath(input: string): string {
	if (!/^[A-Za-z][A-Za-z0-9_]*(\/[A-Za-z][A-Za-z0-9_]*)*$/.test(input) || input.split('/').some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) {
		throw new Error('System paths must use slash-separated names starting with a letter and containing only letters, digits, or underscores.');
	}
	return input;
}

export function systemName(input: string): string {
	validateSystemPath(input);
	return input.endsWith('System') ? input : input + 'System';
}

export async function existingSystem(fs: ProjectFs, config: CapatazConfig, input: string): Promise<string> {
	const systems = await discoverSystems(fs, config);
	if (systems.some(system => system.name === input)) { return input; }
	validateSystemPath(input);
	if (await fs.exists(`${defaultSystemsDir(config)}/${input}`)) { throw new Error(`'${input}' is a group, not a system. Select a full system path.`); }
	const name = systemName(input);
	if (systems.some(system => system.name === name)) { return name; }
	throw new Error(`System '${input}' does not exist.`);
}

export async function newSystem(fs: ProjectFs, config: CapatazConfig, input: string): Promise<string> {
	config = selectLayout(config);
	const name = systemName(input);
	const root = defaultSystemsDir(config), directory = `${root}/${name}`;
	const systems = await discoverSystems(fs, config);
	if (await fs.exists(directory)) { throw new Error(`System '${name}' already exists.`); }
	for (const system of systems) {
		if (name.startsWith(system.name + '/')) { throw new Error(`Cannot create '${name}' inside system '${system.name}'. Use a grouping folder.`); }
	}
	const groups = name.split('/').slice(0, -1);
	if (groups.some(group => group.endsWith('System'))) { throw new Error('Grouping folder names cannot end in System.'); }
	await validateSystemMutation(fs, config);
	const parts = config.systemRoots ? Object.keys(config.systemMounts![selectSystemRoot(config).selectedSystemRoot!]) : ['Client', 'Server', 'Shared'];
	if (config.systemRoots) {
		const planned = previewFs(fs).fs;
		for (const part of parts) { await planned.write(`${directory}/${part}/.gitkeep`, ''); }
		await validateSystemMutation(planned, config);
	}
	for (const part of parts) { await fs.write(`${directory}/${part}/.gitkeep`, ''); }
	await generateConsumers(fs, config);
	return name;
}

export function projectFilePath(input: string): string {
	if (typeof input !== 'string') { throw new Error('projectFile must be a workspace-relative .project.json path.'); }
	const file = input.replace(/\\/g, '/').replace(/^\.\//, '');
	if (!file.endsWith('.project.json') || file.startsWith('/') || file.includes(':') || file.split('/').some(part => !part || part === '..' || part === '.')) {
		throw new Error('projectFile must be a workspace-relative .project.json path without traversal.');
	}
	return file;
}

export function defaultProjectFile(config: CapatazConfig): string {
	return projectFilePath(config.projectFile === undefined ? 'default.project.json' : config.projectFile);
}

/** Config and lint paths stay workspace-relative; Rojo resolves mounts beside its project file. */
function projectForOutput(project: Record<string, unknown>, file: string): Record<string, unknown> {
	const directory = path.posix.dirname(file);
	const result = structuredClone(project);
	if (file !== 'default.project.json' && !result.name) { result.name = path.posix.basename(file, '.project.json'); }
	if (directory === '.') { return result; }
	const rebase = (node: unknown) => {
		if (!node || typeof node !== 'object') { return; }
		for (const [key, value] of Object.entries(node)) {
			if (key === '$path' && typeof value === 'string') {
				(node as Record<string, unknown>)[key] = path.posix.relative(directory, value.replace(/\\/g, '/')) || '.';
			} else if (!key.startsWith('$')) { rebase(value); }
		}
	};
	rebase(result.tree);
	const rules = result.syncbackRules as { ignorePaths?: string[] } | undefined;
	if (rules?.ignorePaths) { rules.ignorePaths = rules.ignorePaths.map(p => path.posix.relative(directory, p.replace(/\\/g, '/'))); }
	return result;
}

function managedNode(tree: CapatazTreeNode, destination: string): CapatazTreeNode {
	let node = tree;
	for (const [index, segment] of destination.split('/').entries()) {
		if (node.$path) { throw new Error(`Managed destination '${destination}' overlaps an authored $path mount. Map its children explicitly.`); }
		const existing = node[segment];
		if (existing !== undefined && (!existing || typeof existing !== 'object')) { throw new Error(`Invalid managed destination '${destination}'.`); }
		node = (node[segment] ??= { $className: index === 0 ? segment : 'Folder' }) as CapatazTreeNode;
		if (!node.$path) { node.$className ??= index === 0 ? segment : 'Folder'; }
	}
	if (node.$path) { throw new Error(`Managed destination '${destination}' already has a $path mount.`); }
	return node;
}

async function buildMappedProject(fs: ProjectFs, config: CapatazConfig): Promise<Record<string, unknown>> {
	const tree = structuredClone(config.tree);
	for (const [rootName, mounts] of Object.entries(config.systemMounts ?? {})) {
		const source = selectSystemRoot(config, rootName);
		const systems = await discoverSystems(fs, source);
		for (const destination of Object.values(mounts)) {
			if (!ROBLOX_SERVICES.has(destination.split('/')[0])) { throw new Error(`Unknown Roblox service in '${destination}'.`); }
			managedNode(tree, destination);
		}
		for (const system of systems) {
			for (const part of system.parts) {
				const destination = mounts[part.route.name];
				const parent = managedNode(tree, `${destination}/${system.name}`);
				if (parent[part.route.name] !== undefined) { throw new Error(`System mount collision at '${destination}/${system.name}/${part.route.name}'. Give the roots distinct destinations.`); }
				parent[part.route.name] = { $path: `${defaultSystemsDir(source)}/${system.name}/${part.directory}` };
			}
		}
	}
	if (config.routeModule !== false) {
		const parts = (config.routeModule ?? 'ReplicatedStorage/CapatazSystemRoutes').split('/');
		const name = parts.pop()!;
		if (!ROBLOX_SERVICES.has(parts[0])) { throw new Error('Unknown Roblox service in routeModule.'); }
		const metadata = managedNode(tree, parts.join('/'));
		if (metadata[name] !== undefined) { throw new Error('Generated routeModule collides with an authored node: ' + parts.join('/') + '/' + name); }
		metadata[name] = { $path: routeFile(config) };
	}
	const { systemsDir: _systemsDir, systemRoutes: _systemRoutes, systemRoots: _roots, systemMounts: _mounts, selectedSystemRoot: _selected, lint: _lint, projectFile: _file, projects: _projects, coreDir: _core, routeModule: _routeModule, ...settings } = config;
	return { ...settings, tree };
}

async function mappedRouteText(fs: ProjectFs, config: CapatazConfig): Promise<string> {
	const entries: string[] = [];
	for (const [name, mounts] of Object.entries(config.systemMounts ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
		const systems = await discoverSystems(fs, selectSystemRoot(config, name));
		const paths = systems.map(system => `[${JSON.stringify(system.name)}] = true`).join(', ');
		const routes = Object.entries(mounts).map(([folder, destination]) => {
			const [service, ...parts] = destination.split('/');
			return `[${JSON.stringify(folder.toLowerCase())}] = { Service = ${JSON.stringify(service)}, Root = ${JSON.stringify(parts.join('/'))}, Name = ${JSON.stringify(folder)}, Systems = { ${paths} } }`;
		});
		entries.push(`\t[${JSON.stringify(name.toLowerCase())}] = { ${routes.join(', ')} },`);
	}
	return '-- Generated by Capataz from explicit systemMounts.\nreturn {\n' + entries.join('\n') + '\n}\n';
}

export async function consumingLayouts(fs: ProjectFs, config: CapatazConfig): Promise<CapatazConfig[]> {
	if (!config.systemRoots || !config.projects) { return [config]; }
	const selected = selectSystemRoot(config).selectedSystemRoot!;
	const workspace = await fs.exists(CONFIG_FILE_NAME) ? await readConfig(fs) : config;
	return layouts(workspace).filter(layout => Object.hasOwn(layout.systemMounts ?? {}, selected));
}

export async function validateSystemMutation(fs: ProjectFs, config: CapatazConfig): Promise<void> {
	for (const layout of await consumingLayouts(fs, config)) { await buildProject(fs, layout); }
}

export async function generateConsumers(fs: ProjectFs, config: CapatazConfig): Promise<void> {
	for (const layout of await consumingLayouts(fs, config)) { await generate(fs, layout); }
}
