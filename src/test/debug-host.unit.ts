import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as { port: number }).port;
	await new Promise<void>(resolve => server.close(() => resolve()));
	return port;
}
async function run(root: string, port: number, executable = process.execPath): Promise<{ code: number | null; output: string }> {
	if (executable !== '--stop') { await fs.mkdir(path.join(root, 'dist'), { recursive: true }); await fs.writeFile(path.join(root, 'dist', 'cli.cjs'), 'console.log("debug CLI fixture");'); }
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.resolve('scripts/launch-debug-host.mjs'), executable, root], { env: { ...process.env, CAPATAZ_DEBUG_PORT: String(port) }, windowsHide: true });
		let output = '';
		child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
		const timeout = setTimeout(() => { child.kill(); reject(new Error('Debug launcher test timed out')); }, 15000);
		child.once('error', error => { clearTimeout(timeout); reject(error); });
		child.once('close', code => { clearTimeout(timeout); resolve({ code, output }); });
	});
}
test('failed debug launch cleans its workspace/profile and stop without a session is harmless', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-debug-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const port = await availablePort();
	assert.equal((await run(root, port, '--stop')).code, 0);
	// Node rejects VS Code's flags, simulating a Development Host that exits before readiness.
	const result = await run(root, port);
	assert.equal(result.code, 1); assert.match(result.output, /closed before its debugger was ready/);
	assert.deepEqual(await fs.readdir(path.join(root, '.vscode-debug')), []);
});
test('a stale owned session is removed on the next launch', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-debug-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const port = await availablePort(), debugRoot = path.join(root, '.vscode-debug'), sessionRoot = path.join(debugRoot, 'session-ABC123');
	await fs.mkdir(sessionRoot, { recursive: true }); await fs.writeFile(path.join(sessionRoot, 'temporary-edit.luau'), 'return {}');
	await fs.writeFile(path.join(debugRoot, 'active-session.json'), JSON.stringify({ sessionRoot, controlPort: port, token: 'stale-session' }));
	assert.equal((await run(root, port)).code, 1);
	assert.deepEqual(await fs.readdir(debugRoot), []);
});
test('stale session cleanup refuses paths outside its managed directory', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz-debug-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const port = await availablePort(), debugRoot = path.join(root, '.vscode-debug'), sessionRoot = path.join(root, 'keep-me');
	await fs.mkdir(debugRoot); await fs.mkdir(sessionRoot); await fs.writeFile(path.join(sessionRoot, 'keep.txt'), 'preserve');
	await fs.writeFile(path.join(debugRoot, 'active-session.json'), JSON.stringify({ sessionRoot, controlPort: port, token: 'stale-session' }));
	const result = await run(root, port); assert.equal(result.code, 1); assert.match(result.output, /unexpected debug session path/);
	assert.equal(await fs.readFile(path.join(sessionRoot, 'keep.txt'), 'utf8'), 'preserve');
});
test('debug terminal resolves capataz to the current build, preserves cwd, and supports rebuilds', async t => {
	const { exposeDebugCli, withDebugCliPath } = await import(pathToFileURL(path.resolve('scripts/debug-cli.mjs')).href);
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capataz cli debug ')); t.after(() => fs.rm(root, { recursive: true, force: true }));
	const sessionRoot = path.join(root, 'session'), workspace = path.join(sessionRoot, 'debug-workspace'), repoRoot = path.join(root, 'source repo');
	await fs.mkdir(path.join(repoRoot, 'dist'), { recursive: true });
	const cli = path.join(repoRoot, 'dist', 'cli.cjs');
	await fs.writeFile(cli, 'console.log(JSON.stringify({args:process.argv.slice(2), cwd:process.cwd(), version:1}));');
	const bin = await exposeDebugCli({ sessionRoot, workspace, repoRoot });
	const env = withDebugCliPath({ ...process.env, Path: process.env.PATH ?? process.env.Path }, bin);
	assert.equal(Object.keys(env).filter(key => key.toUpperCase() === 'PATH').length, 1);
	const invoke = () => process.platform === 'win32'
		? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'capataz --root "path with spaces"'], { cwd: workspace, env, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
		: spawnSync('capataz', ['--root', 'path with spaces'], { cwd: workspace, env, encoding: 'utf8' });
	const first = invoke(); assert.equal(first.status, 0, first.stderr);
	const reported = JSON.parse(first.stdout) as { cwd: string };
	assert.deepEqual({ ...reported, cwd: realpathSync.native(reported.cwd) }, { args: ['--root', 'path with spaces'], cwd: realpathSync.native(workspace), version: 1 });
	await fs.writeFile(cli, 'console.log(JSON.stringify({version:2}));');
	assert.equal(JSON.parse(invoke().stdout).version, 2);
	const settings = JSON.parse(await fs.readFile(path.join(workspace, '.vscode', 'settings.json'), 'utf8'));
	assert.equal(settings['terminal.integrated.env.windows'].PATH, `${bin};\${env:PATH}`);
	assert.equal(settings['terminal.integrated.env.linux'].PATH, `${bin}:\${env:PATH}`);
});
