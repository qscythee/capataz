import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
const flags = args.filter(arg => arg.startsWith('--'));
const [target, requested] = args.filter(arg => !arg.startsWith('--'));
const dryRun = flags.includes('--dry-run');
const assumeYes = flags.includes('--yes');
const usage = 'Usage: npm run release:<cli|ext|all> [-- <patch|minor|major|x.y.z>] [--dry-run] [--yes]';
if (!['cli', 'ext', 'all'].includes(target)) { fail(usage); }

const doCli = target !== 'ext';
const doExt = target !== 'cli';
const labels = { cli: 'CLI', ext: 'extension', all: 'CLI + extension' };

function fail(message) { console.error(message); process.exit(1); }
function run(command, commandArgs, options = {}) {
	console.log(`> ${command} ${commandArgs.join(' ')}`);
	if (dryRun && options.mutates) { return ''; }
	const result = spawnSync(command, commandArgs, {
		encoding: 'utf8',
		shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
		stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
	});
	if (result.status !== 0) { fail(`Failed: ${command} ${commandArgs.join(' ')}`); }
	return result.stdout?.trim() ?? '';
}

function bumped(current, kind) {
	const [major, minor, patch] = current.split('.').map(Number);
	return { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[kind];
}

async function ask(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

const branch = run('git', ['branch', '--show-current'], { capture: true });
if (run('git', ['status', '--porcelain'], { capture: true })) { fail('Working tree is not clean. Commit or stash changes first.'); }
run('git', ['fetch', 'origin', '--tags']);
if (run('git', ['rev-list', '--count', `HEAD..origin/${branch}`], { capture: true }) !== '0') { fail(`Local ${branch} is behind origin. Pull first.`); }

const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
let choice = requested;
if (!choice) {
	if (!process.stdin.isTTY) { fail(`No version given and input is not interactive.\n${usage}`); }
	console.log(`\nReleasing ${labels[target]}. Current version: ${current}`);
	console.log(`  patch -> ${bumped(current, 'patch')}\n  minor -> ${bumped(current, 'minor')}\n  major -> ${bumped(current, 'major')}`);
	choice = (await ask('New version (patch/minor/major/x.y.z) [patch]: ')) || 'patch';
}
const next = /^\d+\.\d+\.\d+$/.test(choice) ? choice : bumped(current, choice);
if (!next) { fail(`Invalid version '${choice}'.\n${usage}`); }

const tags = [...(doCli ? [`v${next}`] : []), ...(doExt ? [`ext-v${next}`] : [])];
for (const tag of tags) {
	if (run('git', ['tag', '--list', tag], { capture: true })) { fail(`Tag ${tag} already exists.`); }
}
console.log(`\n${labels[target]} release: ${current} -> ${next}\nTags: ${tags.join(', ')}${dryRun ? '  [dry run]' : ''}\n`);
if (!assumeYes && !dryRun) {
	if (!process.stdin.isTTY) { fail('Confirmation required; pass --yes to run non-interactively.'); }
	if ((await ask('Proceed? (y/N): ')).toLowerCase() !== 'y') { fail('Cancelled.'); }
}

run('npm', ['run', 'compile']);
run('npm', ['run', 'test:unit']);
if (doExt) { run('npm', ['test']); }

if (!dryRun) {
	writeFileSync('package.json', readFileSync('package.json', 'utf8').replace(/("version":\s*")[^"]+/, `$1${next}`));
	try {
		const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
		lock.version = next;
		if (lock.packages?.['']) { lock.packages[''].version = next; }
		writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
	} catch { /* no lockfile */ }
}

if (doExt) { run('npx', ['vsce', 'publish', '--no-dependencies'], { mutates: true }); }
run('git', ['add', 'package.json', 'package-lock.json'], { mutates: true });
run('git', ['commit', '-m', `release: ${labels[target]} ${next}`, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'], { mutates: true });
for (const tag of tags) { run('git', ['tag', tag], { mutates: true }); }
run('git', ['push', 'origin', branch, ...tags], { mutates: true });

if (dryRun) { console.log('\nDry run complete; nothing was changed.'); }
else {
	if (doExt) { console.log(`\nPublished extension ${next}.`); }
	if (doCli) { console.log(`\nPushed v${next}. The Release Capataz CLI workflow builds the binaries: gh run watch`); }
}
