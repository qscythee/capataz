import { CapatazConfig } from '../config';
import { ProjectFs } from '../core/fs';
import { Analysis, analyzeSource } from './analyze';
import { createIndex, ProjectIndex } from './index';

export interface CheckResult extends Analysis { files: number; index: ProjectIndex }
export async function checkProject(fs: ProjectFs, config: CapatazConfig, overlays = new Map<string, string>()): Promise<CheckResult> {
	const index = await createIndex(fs, config);
	const result: CheckResult = { diagnostics: [], dependencies: [], files: index.modules.size, index };
	for (const info of index.modules.values()) {
		const analysis = analyzeSource(overlays.get(info.file) ?? await fs.read(info.file), index, info);
		result.diagnostics.push(...analysis.diagnostics); result.dependencies.push(...analysis.dependencies);
	}
	result.diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
	return result;
}
