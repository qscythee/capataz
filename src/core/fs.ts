import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ProjectFs {
	read(relative: string): Promise<string>;
	write(relative: string, content: string): Promise<void>;
	entries(relative: string): Promise<[string, boolean][]>;
	exists(relative: string): Promise<boolean>;
	mkdir(relative: string): Promise<void>;
	remove(relative: string): Promise<void>;
}

export function nodeFs(root: string): ProjectFs {
	const base = path.resolve(root);
	const resolve = (relative: string) => {
		const absolute = path.resolve(base, relative);
		const rel = path.relative(base, absolute);
		if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
			throw new Error(`Path escapes project root: ${relative}`);
		}
		return absolute;
	};
	const safe = async (relative: string) => {
		const absolute = resolve(relative);
		// Check existing ancestors too, so a symlink cannot redirect a mutation.
		let current = absolute;
		while (current !== base) {
			try {
				if ((await fs.lstat(current)).isSymbolicLink()) {
					throw new Error(`Symlinks are not supported in project paths: ${relative}`);
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
			}
			current = path.dirname(current);
		}
		return absolute;
	};
	return {
		read: async p => fs.readFile(await safe(p), 'utf8'),
		write: async (p, content) => { const target = await safe(p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); },
		entries: async p => (await fs.readdir(await safe(p), { withFileTypes: true })).filter(e => !e.isSymbolicLink()).map(e => [e.name, e.isDirectory()]),
		exists: async p => { try { await fs.stat(await safe(p)); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return false; } throw error; } },
		mkdir: async p => { await fs.mkdir(await safe(p), { recursive: true }); },
		remove: async p => { if (!p || path.resolve(base, p) === base) { throw new Error('Cannot remove project root.'); } await fs.rm(await safe(p), { recursive: true }); },
	};
}

export async function walk(fs: ProjectFs, directory: string): Promise<string[]> {
	if (!(await fs.exists(directory))) { return []; }
	const files: string[] = [];
	for (const [name, isDirectory] of (await fs.entries(directory)).sort(([a], [b]) => a.localeCompare(b))) {
		if (['.git', 'node_modules', '.capataz'].includes(name)) { continue; }
		const relative = directory ? `${directory}/${name}` : name;
		if (isDirectory) { files.push(...await walk(fs, relative)); } else { files.push(relative); }
	}
	return files;
}
