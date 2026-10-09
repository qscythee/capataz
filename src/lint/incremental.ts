import { CONFIG_FILE_NAME } from '../config';
import { ProjectFs } from '../core/fs';
import { readConfig } from '../core/project';
import { Analysis } from './analyze';
import { AnalysisSession } from './session';
import { createIndex, ProjectIndex } from './index';
import { createLintIgnore } from './ignore';

export interface LintRequest { rebuild?: boolean; full?: boolean; files?: Iterable<string>; ignoreGlobs?: readonly string[] }

/** One instance per workspace. Callers serialize refreshes and abort superseded work. */
export class IncrementalLinter {
	private index?: ProjectIndex;
	private session?: AnalysisSession;
	private cache = new Map<string, string>();
	private unindexed = new Set<string>();
	private rebuildNeeded = true;
	private ignoreGlobs: readonly string[] = [];
	constructor(private fs: ProjectFs) {}

	async refresh(request: LintRequest, overlays: Pick<ReadonlyMap<string, string>, 'get'> = new Map(), signal = new AbortController().signal): Promise<Map<string, Analysis>> {
		signal.throwIfAborted();
		const files = new Set(request.files);
		if (request.rebuild || [...files].some(file => !this.index?.modules.has(file) && !this.unindexed.has(file))) { this.rebuildNeeded = true; }
		// Check cancellation after each filesystem operation, including during index construction.
		const guarded = async <T>(operation: () => Promise<T>): Promise<T> => {
			signal.throwIfAborted(); const value = await operation(); signal.throwIfAborted(); return value;
		};
		const fs: ProjectFs = { ...this.fs,
			read: p => guarded(() => this.fs.read(p)),
			entries: p => guarded(() => this.fs.entries(p)),
			exists: p => guarded(() => this.fs.exists(p)),
		};
		let index = this.index;
		const rebuild = this.rebuildNeeded;
		if (rebuild) {
			if (!(await fs.exists(CONFIG_FILE_NAME))) {
				const cleared = new Map([...this.cache.keys()].map(file => [file, { diagnostics: [], dependencies: [] } as Analysis]));
				this.index = undefined; this.session = undefined; this.cache.clear(); this.unindexed.clear(); this.rebuildNeeded = true; return cleared;
			}
			index = await createIndex(fs, await readConfig(fs));
		}
		if (!index) { throw new Error('Project index is unavailable.'); }
		const ignoreGlobs = request.ignoreGlobs ?? this.ignoreGlobs;
		const ignoresChanged = ignoreGlobs.length !== this.ignoreGlobs.length || ignoreGlobs.some((glob, i) => glob !== this.ignoreGlobs[i]);
		const ignored = createLintIgnore([...(index.config.lint?.ignoreGlobs ?? []), ...ignoreGlobs]);
		const full = rebuild || request.full || ignoresChanged;
		const session = rebuild || ignoresChanged || !this.session ? new AnalysisSession(index, ignoreGlobs) : this.session.fork();
		const changed = new Map<string, string>();
		if (!full) {
			for (const file of files) {
				if (!index.modules.has(file) || ignored(file)) { continue; }
				const source = overlays.get(file) ?? await fs.read(file);
				if (this.cache.get(file) !== source) { changed.set(file, source); }
			}
		}
		const affected = session.invalidate(full ? index.modules.keys() : changed.keys());
		const updates = new Map<string, Analysis>();
		const staged = new Map<string, string>();
		let count = 0;
		for (const file of full ? index.modules.keys() : affected) {
			signal.throwIfAborted();
			const info = index.modules.get(file);
			if (!info || ignored(file)) { continue; }
			const source = changed.get(file) ?? overlays.get(file) ?? (!full ? this.cache.get(file) : undefined) ?? await fs.read(file);
			const analysis = await session.analyze(fs, info, { get: p => p === file ? source : overlays.get(p) }, signal);
			staged.set(file, source); updates.set(file, analysis);
			// Let document events cancel scans even when all sources are in memory.
			if (++count % 16 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); }
		}
		signal.throwIfAborted();
		if (full) {
			for (const file of this.cache.keys()) {
				if (!staged.has(file)) { updates.set(file, { diagnostics: [], dependencies: [] }); }
			}
			this.cache = staged;
		} else { for (const [file, value] of staged) { this.cache.set(file, value); } }
		if (rebuild) { this.unindexed.clear(); }
		for (const file of files) { if (!index.modules.has(file)) { this.unindexed.add(file); } }
		this.session = session; this.index = index; this.rebuildNeeded = false; this.ignoreGlobs = [...ignoreGlobs];
		return updates;
	}
}
