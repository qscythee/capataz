import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [target, bump = 'patch', ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const usage = 'Usage: npm run release:<cli|ext> -- <patch|minor|major|x.y.z> [--dry-run]';
if (!['cli', 'ext'].includes(target)) { fail(usage); }

function fail(message) { console.error(message); process.exit(1); }
function run(command, args, options = {}) {
	console.log(`> ${command} ${args.join(' ')}`);
	if (dryRun && options.mutates) { return ''; }
	const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
	if (result.status !== 0) { fail(`Failed: ${command} ${args.join(' ')}`); }
	return result.stdout?.trim() ?? '';
}

const branch = run('git', ['branch', '--show-current'], { capture: true });
if (run('git', ['status', '--porcelain'], { capture: true })) { fail('Working tree is not clean. Commit or stash changes first.'); }
run('git', ['fetch', 'origin']);
if (run('git', ['rev-list', '--count', `HEAD..origin/${branch}`], { capture: true }) !== '0') { fail(`Local ${branch} is behind origin. Pull first.`); }

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const current = manifest.version;
let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) { next = bump; }
else {
	const [major, minor, patch] = current.split('.').map(Number);
	next = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[bump];
	if (!next) { fail(usage); }
}
const tag = target === 'cli' ? `v${next}` : `ext-v${next}`;
if (run('git', ['tag', '--list', tag], { capture: true })) { fail(`Tag ${tag} already exists.`); }
console.log(`\n${target === 'cli' ? 'CLI' : 'Extension'} release: ${current} -> ${next} (tag ${tag})${dryRun ? ' [dry run]' : ''}\n`);

run('npm', ['run', 'compile']);
run('npm', ['run', 'test:unit']);
if (target === 'ext') { run('npm', ['test']); }

if (!dryRun) {
	writeFileSync('package.json', readFileSync('package.json', 'utf8').replace(/("version":\s*")[^"]+/, `$1${next}`));
	const lock = (() => { try { return JSON.parse(readFileSync('package-lock.json', 'utf8')); } catch { return undefined; } })();
	if (lock) {
		lock.version = next;
		if (lock.packages?.['']) { lock.packages[''].version = next; }
		writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
	}
}

if (target === 'ext') { run('npx', ['vsce', 'publish', '--no-dependencies'], { mutates: true }); }
run('git', ['add', 'package.json', 'package-lock.json'], { mutates: true });
run('git', ['commit', '-m', `release: ${target === 'cli' ? 'CLI' : 'extension'} ${next}`, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'], { mutates: true });
run('git', ['tag', tag], { mutates: true });
run('git', ['push', 'origin', branch, tag], { mutates: true });
console.log(target === 'cli'
	? `\nPushed ${tag}. The Release Capataz CLI workflow will build and publish the binaries: gh run watch`
	: `\nPublished extension ${next} and pushed ${tag}.`);
