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

export interface CapatazLintConfig {
	importFactories?: Record<string, { client?: ImportFactoryDeclaration; server?: ImportFactoryDeclaration }>;
	ignoreGlobs?: string[];
	rules?: CapatazLintRules;
}

export interface CapatazConfig {
	name?: string;
	emitLegacyScripts?: boolean;
	systemsDir?: string;
	systemRoutes?: Record<string, string>;
	syncbackRules?: CapatazSyncbackRules;
	lint?: CapatazLintConfig;
	tree: CapatazTreeNode;
}

export interface CapatazConfigFile {
	project: Omit<CapatazConfig, 'systemRoutes' | 'lint'>;
	systemRoutes?: Record<string, string>;
	lint?: CapatazLintConfig;
}

export const CONFIG_FILE_NAME = 'capataz.config.json';

export function defaultSystemsDir(config: CapatazConfig): string {
	return (config.systemsDir ?? 'src/Systems').replace(/\\/g, '/').replace(/\/$/, '');
}
