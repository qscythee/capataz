import * as path from 'node:path';
import { Minimatch } from 'minimatch';

/** Match project-relative paths; ignored modules remain indexed for import resolution. */
export function createLintIgnore(globs: readonly string[] = []): (file: string) => boolean {
	const patterns = globs.map(glob => new Minimatch(glob.replace(/\\/g, '/').replace(/^\.\//, ''), { dot: true, nonegate: true, nocomment: true }));
	return file => {
		const relative = path.posix.normalize(file.replace(/\\/g, '/')).replace(/^\.\//, '');
		return patterns.some(pattern => pattern.match(relative));
	};
}
