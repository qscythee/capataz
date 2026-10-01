export interface CapatazTreeNode {
	$className?: string;
	$path?: string;
	[key: string]: CapatazTreeNode | string | undefined;
}

export interface CapatazSyncbackRules {
	ignoreTrees?: string[];
	ignorePaths?: string[];
}

export interface CapatazConfig {
	name?: string;
	emitLegacyScripts?: boolean;
	systemsDir?: string;
	syncbackRules?: CapatazSyncbackRules;
	tree: CapatazTreeNode;
}

export const CONFIG_FILE_NAME = 'capataz.config.json';

export function defaultSystemsDir(config: CapatazConfig): string {
	return config.systemsDir ?? 'src/Systems';
}
