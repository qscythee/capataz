export interface CapatazTreeNode {
	$className?: string;
	$path?: string;
	[key: string]: CapatazTreeNode | string | undefined;
}

export interface CapatazSyncbackRules {
	ignoreTrees?: string[];
	ignorePaths?: string[];
}

export interface CapatazLintRules {
	'dynamic-require'?: 'off' | 'warn';
}

export interface ImportFactoryDeclaration {
	aliases: Record<string, string>;
	caseSensitive?: boolean;
}

export interface LintTarget { projectFile: string; includeGlobs?: string[] }

export interface CapatazLintConfig {
	requirerModules?: string[];
	targets?: Record<string, LintTarget>;
	importFactories?: Record<string, { client?: ImportFactoryDeclaration; server?: ImportFactoryDeclaration }>;
	ignoreGlobs?: string[];
	rules?: CapatazLintRules;
}

export type SystemMounts = Record<string, Record<string, string>>;

export interface ProjectLayout {
	routeModule?: string | false;
	projectFile: string;
	systemsDir?: string;
	systemMounts?: SystemMounts;
	coreDir?: string;
	name?: string;
	tree?: CapatazTreeNode;
	systemRoutes?: Record<string, string>;
}

export interface CapatazConfig {
	routeModule?: string | false;
	systemRoots?: Record<string, string>;
	systemMounts?: SystemMounts;
	/** Invocation-only source selection, never serialized. */
	selectedSystemRoot?: string;
	projects?: Record<string, ProjectLayout>;
	coreDir?: string;
	projectFile?: string;
	name?: string;
	emitLegacyScripts?: boolean;
	systemsDir?: string;
	systemRoutes?: Record<string, string>;
	syncbackRules?: CapatazSyncbackRules;
	lint?: CapatazLintConfig;
	tree: CapatazTreeNode;
}

export interface CapatazConfigFile {
	systemRoots?: Record<string, string>;
	projectFile?: string;
	projects?: Record<string, ProjectLayout>;
	project: Omit<CapatazConfig, 'systemRoutes' | 'lint' | 'projectFile' | 'projects' | 'systemRoots' | 'selectedSystemRoot'>;
	systemRoutes?: Record<string, string>;
	lint?: CapatazLintConfig;
}

export const CONFIG_FILE_NAME = 'capataz.config.json';

export function defaultSystemsDir(config: CapatazConfig): string {
	if (config.systemRoots) {
		const names = Object.keys(config.systemMounts ?? {});
		const name = config.selectedSystemRoot ?? (names.length === 1 ? names[0] : undefined);
		if (!name || !names.includes(name)) { throw new Error('Select a system root with --systems-root <name>. Available: ' + names.join(', ')); }
		return config.systemRoots[name];
	}
	return (config.systemsDir ?? 'src/Systems').replace(/\\/g, '/').replace(/\/$/, '');
}
