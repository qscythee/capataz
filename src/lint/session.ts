import { ProjectFs } from '../core/fs';
import { Analysis, analyzeSource, EvaluationContext, inferExport, Value } from './analyze';
import { createLintIgnore } from './ignore';
import { ModuleInfo, ProjectIndex } from './index';

class SourceNeeded extends Error { constructor(readonly file: string) { super(file); } }

/** Transactional source/export caches, shared by CLI and incremental diagnostics. */
export class AnalysisSession {
	private sources = new Map<string, string>();
	private exports = new Map<string, Value>();
	private dependencies = new Map<string, Set<string>>();
	private active = new Set<string>();
	private ignored: (file: string) => boolean;
	constructor(private index: ProjectIndex, private ignoreGlobs: readonly string[] = []) { this.ignored = createLintIgnore([...(index.config.lint?.ignoreGlobs ?? []), ...ignoreGlobs]); }
	fork(): AnalysisSession {
		const next = new AnalysisSession(this.index, this.ignoreGlobs);
		next.sources = new Map(this.sources); next.exports = new Map(this.exports);
		next.dependencies = new Map([...this.dependencies].map(([file, deps]) => [file, new Set(deps)]));
		return next;
	}
	invalidate(files: Iterable<string>): Set<string> {
		const affected = new Set(files);
		for (const file of affected) { this.sources.delete(file); }
		for (const file of affected) {
			for (const [caller, deps] of this.dependencies) { if (deps.has(file)) { affected.add(caller); } }
		}
		for (const file of affected) { this.exports.delete('Client:' + file); this.exports.delete('Server:' + file); this.dependencies.delete(file); }
		return affected;
	}
	private context(caller: string, runtime: 'Client' | 'Server'): EvaluationContext {
		return { runtime, exportOf: module => {
			if (this.ignored(module.file) && !this.index.config.lint?.importFactories?.[module.file]) { return { kind: 'unknown' }; }
			const deps = this.dependencies.get(caller) ?? new Set<string>(); deps.add(module.file); this.dependencies.set(caller, deps);
			return this.exportOf(module, runtime);
		} };
	}
	private exportOf(module: ModuleInfo, runtime: 'Client' | 'Server'): Value {
		const declaration = this.index.config.lint?.importFactories?.[module.file]?.[runtime === 'Client' ? 'client' : 'server'];
		if (declaration) { return { kind: 'factory', roots: declaration.aliases, caseSensitive: declaration.caseSensitive ?? true }; }
		// Dependencies remain resolvable without parsing third-party implementations.
		if (this.ignored(module.file)) { return { kind: 'unknown' }; }
		const key = runtime + ':' + module.file;
		const cached = this.exports.get(key); if (cached) { return structuredClone(cached); }
		if (this.active.has(key) || this.active.size >= 32) { return { kind: 'opaque' }; }
		const source = this.sources.get(module.file); if (source === undefined) { throw new SourceNeeded(module.file); }
		this.active.add(key);
		try {
			const inferred = inferExport(source, this.index, module, this.context(module.file, runtime));
			const value: Value = inferred.kind === 'unknown' ? { kind: 'opaque' } : inferred;
			this.exports.set(key, value); return structuredClone(value);
		} finally { this.active.delete(key); }
	}
	async analyze(fs: ProjectFs, module: ModuleInfo, overlays: Pick<ReadonlyMap<string, string>, 'get'>, signal: AbortSignal): Promise<Analysis> {
		const source = overlays.get(module.file) ?? this.sources.get(module.file) ?? await fs.read(module.file); signal.throwIfAborted(); this.sources.set(module.file, source);
		for (;;) {
			signal.throwIfAborted();
			try {
				const runtimes: ('Client' | 'Server')[] = module.side === 'Client' || module.side === 'Server' ? [module.side] : ['Client', 'Server'];
				const results = runtimes.map(runtime => analyzeSource(source, this.index, module, this.context(module.file, runtime)));
				return {
					diagnostics: [...new Map(results.flatMap(result => result.diagnostics).map(d => [JSON.stringify(d), d])).values()],
					dependencies: [...new Map(results.flatMap(result => result.dependencies).map(d => [JSON.stringify(d), d])).values()],
				};
			} catch (error) {
				if (!(error instanceof SourceNeeded)) { throw error; }
				this.sources.set(error.file, overlays.get(error.file) ?? await fs.read(error.file)); signal.throwIfAborted();
			}
		}
	}
}
