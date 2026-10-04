import { CapatazConfig, CapatazConfigFile, CapatazTreeNode, CONFIG_FILE_NAME, defaultSystemsDir } from '../config';
import { ProjectFs } from './fs';

const ROUTE_FILE = 'src/Core/Shared/CustomRequirer/SystemRoutes.luau';
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

export async function readConfig(fs: ProjectFs, normalizeLegacyScripts = false): Promise<CapatazConfig> {
	if (!(await fs.exists(CONFIG_FILE_NAME))) { throw new Error(`No ${CONFIG_FILE_NAME}; run capataz init first.`); }
	const raw = JSON.parse(await fs.read(CONFIG_FILE_NAME)) as CapatazConfig & { project?: Omit<CapatazConfig, 'systemRoutes' | 'lint'> };
	const config: CapatazConfig = raw.project && typeof raw.project === 'object'
		? { ...raw.project, ...(raw.systemRoutes !== undefined ? { systemRoutes: raw.systemRoutes } : {}), ...(raw.lint !== undefined ? { lint: raw.lint } : {}) }
		: raw;
	if (!config || !config.tree || typeof config.tree !== 'object' || !config.tree.ReplicatedStorage || typeof config.tree.ReplicatedStorage !== 'object' || !config.tree.ServerScriptService || typeof config.tree.ServerScriptService !== 'object') {
		throw new Error(`${CONFIG_FILE_NAME}: tree must define ReplicatedStorage and ServerScriptService.`);
	}
	const needsModernScripts = config.emitLegacyScripts !== false;
	if (needsModernScripts) {
		if (!normalizeLegacyScripts) { throw new Error(`${CONFIG_FILE_NAME}: emitLegacyScripts must be false. Run capataz init to migrate to modern script RunContext.`); }
		config.emitLegacyScripts = false;
	}
	if (config.systemsDir !== undefined && typeof config.systemsDir !== 'string') { throw new Error('systemsDir must be a string.'); }
	validateSystemRoutes(config);
	validateLintConfig(config);
	const systems = defaultSystemsDir(config).replace(/\\/g, '/');
	if (systems.startsWith('/') || /^[A-Za-z]:/.test(systems) || systems.split('/').includes('..') || !systems) { throw new Error('systemsDir must be a directory inside the project.'); }
	return config;
}

export function configFileText(config: CapatazConfig): string {
	const { systemRoutes, lint, ...project } = config;
	const file: CapatazConfigFile = {
		project,
		...(systemRoutes !== undefined ? { systemRoutes } : {}),
		...(lint !== undefined ? { lint } : {}),
	};
	return JSON.stringify(file, null, 2) + '\n';
}

function validateLintConfig(config: CapatazConfig): void {
	if (config.lint === undefined) { return; }
	if (!config.lint || typeof config.lint !== 'object' || Array.isArray(config.lint)) { throw new Error('lint must be an object.'); }
	const { rules } = config.lint;
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

async function projectRoutes(fs: ProjectFs, config: CapatazConfig): Promise<Map<string, SystemRoute>> {
	const routes = configuredRoutes(config);
	const systems = defaultSystemsDir(config);
	for (const [system, isDirectory] of await fs.entries(systems)) {
		if (!isDirectory) { continue; }
		for (const [part, isPartDirectory] of await fs.entries(`${systems}/${system}`)) {
			if (!isPartDirectory || routes.has(part.toLowerCase())) { continue; }
			const route = resolveSystemRoute(config, part);
			if (route) { routes.set(part.toLowerCase(), route); }
		}
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

export async function buildProject(fs: ProjectFs, config: CapatazConfig): Promise<Record<string, unknown>> {
	const directory = defaultSystemsDir(config);
	if (!(await fs.exists(directory))) { throw new Error(`Systems directory does not exist: ${directory}`); }
	const tree = structuredClone(config.tree);
	if (config.emitLegacyScripts !== false) { throw new Error('emitLegacyScripts must be false to use modern client scripts in ReplicatedStorage.'); }
	const core = ((tree.ReplicatedStorage as CapatazTreeNode).Core ??= { $className: 'Folder' }) as CapatazTreeNode;
	core.Client = { $path: 'src/Core/Client' };
	let replicatedFirst = tree.ReplicatedFirst;
	if (!replicatedFirst || typeof replicatedFirst !== 'object') {
		replicatedFirst = { $className: 'ReplicatedFirst' };
		tree.ReplicatedFirst = replicatedFirst;
	}
	const firstRoot = replicatedFirst as CapatazTreeNode;
	const firstCore = ((firstRoot.Core ??= { $className: 'Folder' })) as CapatazTreeNode;
	firstCore.First = { $path: 'src/Core/First' };
	const replicatedStorageCore = (tree.ReplicatedStorage as CapatazTreeNode).Core as CapatazTreeNode;
	const legacyFirstMount = replicatedStorageCore.First;
	if (legacyFirstMount && typeof legacyFirstMount === 'object' && legacyFirstMount.$path === 'src/Core/First') {
		delete replicatedStorageCore.First;
	}
	const legacyClientMount = (tree.ReplicatedStorage as CapatazTreeNode).Client;
	if (legacyClientMount && typeof legacyClientMount === 'object' && legacyClientMount.$path === 'src/Client') {
		delete (tree.ReplicatedStorage as CapatazTreeNode).Client;
	}
	const starterPlayer = tree.StarterPlayer;
	if (starterPlayer && typeof starterPlayer === 'object') {
		const scripts = starterPlayer.StarterPlayerScripts;
		if (scripts && typeof scripts === 'object' && scripts.$path === 'src/Client') {
			delete starterPlayer.StarterPlayerScripts;
			if (Object.keys(starterPlayer).every(key => key.startsWith('$'))) { delete tree.StarterPlayer; }
		}
	}
	const routes = await projectRoutes(fs, config);
	const routeSystems = new Map<string, CapatazTreeNode>();
	for (const route of routes.values()) {
		if (!routeSystems.has(route.service)) { routeSystems.set(route.service, ensureServiceSystems(tree, route.service)); }
	}
	for (const [name, isDirectory] of (await fs.entries(directory)).sort(([a], [b]) => a.localeCompare(b))) {
		if (!isDirectory) { continue; }
		const mountedRoutes = new Set<string>();
		for (const [part, isPartDirectory] of await fs.entries(`${directory}/${name}`)) {
			if (!isPartDirectory) { continue; }
			const route = routes.get(part.toLowerCase());
			if (!route) { continue; }
			if (mountedRoutes.has(route.name.toLowerCase())) { throw new Error(`System '${name}' has multiple folders for route '${route.name}' (route names are case-insensitive).`); }
			mountedRoutes.add(route.name.toLowerCase());
			const relative = `${directory}/${name}/${part}`;
			const target = routeSystems.get(route.service)!;
			const systemNode = (target[name] ??= { $className: 'Folder' }) as CapatazTreeNode;
			systemNode[route.name] = { $path: relative };
		}
	}
	const { systemsDir: _systemsDir, systemRoutes: _systemRoutes, lint: _lint, ...settings } = config;
	return { ...settings, tree };
}

export const projectText = (project: Record<string, unknown>) => JSON.stringify(project, null, 2) + '\n';

async function routeText(fs: ProjectFs, config: CapatazConfig): Promise<string> {
	const routes = await projectRoutes(fs, config);
	const entries = [...routes.values()].sort((a, b) => a.name.localeCompare(b.name));
	return `-- Generated by Capataz. Edit systemRoutes in capataz.config.json instead.\nreturn {\n${entries.map(route => `\t[${JSON.stringify(route.name.toLowerCase())}] = { Service = ${JSON.stringify(route.service)}, Name = ${JSON.stringify(route.name)} },`).join('\n')}\n}\n`;
}

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
	if (!(await fs.exists(ROUTE_FILE)) || await fs.read(ROUTE_FILE) !== await routeText(fs, config)) { issues.push(`${ROUTE_FILE} is stale or missing; run capataz project generate.`); }
	return issues;
}

export async function generate(fs: ProjectFs, config: CapatazConfig): Promise<boolean> {
	const [project, routes] = await Promise.all([buildProject(fs, config), routeText(fs, config)]);
	const outputs: [string, string][] = [['default.project.json', projectText(project)], [ROUTE_FILE, routes]];
	let changed = false;
	for (const [file, content] of outputs) {
		if (await fs.exists(file) && await fs.read(file) === content) { continue; }
		await fs.write(file, content);
		changed = true;
	}
	return changed;
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
