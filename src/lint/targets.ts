import { CapatazConfig, CONFIG_FILE_NAME, LintTarget } from '../config';
import { ProjectFs } from '../core/fs';
import { projectFilePath, readConfig } from '../core/project';
import { Analysis } from './analyze';
import { checkProject } from './check';
import { IncrementalLinter, LintRequest } from './incremental';

export function lintTargets(config: CapatazConfig, name?: string, projectFile?: string): [string, LintTarget | undefined][] {
	const targets = { ...Object.fromEntries(Object.entries(config.projects ?? {}).map(([key, value]) => [key, { projectFile: value.projectFile }])), ...config.lint?.targets };
	if (projectFile) {
		const file = projectFilePath(projectFile);
		const matches = Object.entries(targets).filter(([, target]) => projectFilePath(target.projectFile) === file);
		return matches.length ? matches : [[file, { projectFile: file }]];
	}
	if (name) {
		const target = targets[name];
		if (!target) { throw new Error(`Unknown lint target '${name}'.`); }
		return [[name, target]];
	}
	return Object.keys(targets).length ? Object.entries(targets) : config.systemRoots ? [['default', { projectFile: config.projectFile ?? 'default.project.json' }]] : [['', undefined]];
}

function tagged(analysis: Analysis, name: string): Analysis {
	return name ? {
		diagnostics: analysis.diagnostics.map(issue => ({ ...issue, lintTarget: name, message: `[${name}] ${issue.message}` })),
		dependencies: analysis.dependencies.map(edge => ({ ...edge, lintTarget: name })),
	} : analysis;
}

export async function checkTargets(fs: ProjectFs, config: CapatazConfig, name?: string): Promise<Analysis & { files: number }> {
	let files = 0;
	const diagnostics: Analysis['diagnostics'] = [], dependencies: Analysis['dependencies'] = [];
	for (const [key, target] of lintTargets(config, name)) {
		try {
			const result = await checkProject(fs, config, undefined, target);
			const analysis = tagged(result, key);
			files += result.files; diagnostics.push(...analysis.diagnostics); dependencies.push(...analysis.dependencies);
		} catch (error) { throw new Error(`${key ? '[' + key + '] ' : ''}${(error as Error).message}`); }
	}
	return { files, diagnostics, dependencies };
}

/** Separate transactional caches prevent one place's resolutions leaking into another. */
export class TargetLinter {
	private states = new Map<string, { linter: IncrementalLinter; results: Map<string, Analysis> }>();
	private initialized = false;
	private published = new Set<string>();
	constructor(private fs: ProjectFs, private projectFile?: string) {}
	async refresh(request: LintRequest, overlays: Pick<ReadonlyMap<string, string>, 'get'> = new Map(), signal = new AbortController().signal): Promise<Map<string, Analysis>> {
		const dirty = new Set<string>();
		try {
			if (!this.initialized || request.rebuild) {
				for (const file of this.published) { dirty.add(file); }
				const config = await this.fs.exists(CONFIG_FILE_NAME) ? await readConfig(this.fs) : undefined;
				signal.throwIfAborted();
				this.states = new Map(config ? lintTargets(config, undefined, this.projectFile).map(([name, target]) => [name, { linter: new IncrementalLinter(this.fs, target), results: new Map() }]) : []);
				this.initialized = true;
			}
			for (const [name, state] of this.states) {
				try {
					const updates = await state.linter.refresh({ ...request, files: [...request.files ?? []].filter(file => state.linter.hasFile(file)) }, overlays, signal);
					for (const [file, analysis] of updates) { state.results.set(file, tagged(analysis, name)); dirty.add(file); }
				} catch (error) { if (signal.aborted) { throw error; } throw new Error(`${name ? '[' + name + '] ' : ''}${(error as Error).message}`); }
			}
			signal.throwIfAborted();
		} catch (error) { this.initialized = false; throw error; }
		const combined = new Map<string, Analysis>();
		for (const file of dirty) {
			const analysis: Analysis = { diagnostics: [], dependencies: [] };
			for (const state of this.states.values()) {
				const result = state.results.get(file);
				if (result) { analysis.diagnostics.push(...result.diagnostics); analysis.dependencies.push(...result.dependencies); }
			}
			combined.set(file, analysis);
		}
		for (const file of dirty) { this.published.add(file); }
		return combined;
	}
}
