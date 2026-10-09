import { CapatazConfig } from '../config';
import { ProjectFs } from '../core/fs';
import { Analysis } from './analyze';
import { AnalysisSession } from './session';
import { createIndex, ProjectIndex } from './index';
import { createLintIgnore } from './ignore';

export interface CheckResult extends Analysis { files: number; index: ProjectIndex }
export async function checkProject(fs: ProjectFs, config: CapatazConfig, overlays = new Map<string, string>()): Promise<CheckResult> {
	const index = await createIndex(fs, config);
	const result: CheckResult = { diagnostics: [], dependencies: [], files: 0, index };
	const session = new AnalysisSession(index);
	const ignored = createLintIgnore(config.lint?.ignoreGlobs);
	for (const info of index.modules.values()) {
		if (ignored(info.file)) { continue; }
		result.files++;
		const analysis = await session.analyze(fs, info, overlays, new AbortController().signal);
		result.diagnostics.push(...analysis.diagnostics); result.dependencies.push(...analysis.dependencies);
	}
	result.diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
	return result;
}
