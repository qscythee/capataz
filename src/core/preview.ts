import { ProjectFs } from './fs';

/** Overlay for dry runs; project reads see planned writes without touching disk. */
export function previewFs(base: ProjectFs): { fs: ProjectFs; changes: string[] } {
	const files = new Map<string, string>(), directories = new Set<string>(), removed = new Set<string>(), changes: string[] = [];
	const deleted = (p: string) => [...removed].some(r => p === r || p.startsWith(r + '/'));
	const mkdir = (p: string) => { const pieces = p.split('/'); for (let i = 1; i <= pieces.length; i++) { directories.add(pieces.slice(0, i).join('/')); } };
	const fs: ProjectFs = {
		read: async p => { if (deleted(p)) { throw new Error(`Removed path: ${p}`); } return files.get(p) ?? base.read(p); },
		write: async (p, content) => { files.set(p, content); mkdir(p.split('/').slice(0, -1).join('/')); changes.push(`write ${p}`); },
		exists: async p => !deleted(p) && (files.has(p) || directories.has(p) || await base.exists(p)),
		mkdir: async p => { mkdir(p); changes.push(`mkdir ${p}`); },
		remove: async p => { removed.add(p); changes.push(`remove ${p}`); },
		entries: async p => {
			const result = new Map<string, boolean>(await base.exists(p) ? await base.entries(p) : []);
			const planned: [string, boolean][] = [...[...files.keys()].map(p => [p, false] as [string, boolean]), ...[...directories].map(p => [p, true] as [string, boolean])];
			for (const [entry, directory] of planned) {
				const relative = entry.slice(p ? p.length + 1 : 0);
				if ((p === '' || entry.startsWith(p + '/')) && relative && !relative.includes('/')) { result.set(relative, directory); }
			}
			return [...result].filter(([name]) => !deleted(p ? `${p}/${name}` : name)).sort(([a], [b]) => a.localeCompare(b));
		},
	};
	return { fs, changes };
}
