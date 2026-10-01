import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { exposeDebugCli, withDebugCliPath } from './debug-cli.mjs';

const [executableOrStop, rootArgument] = process.argv.slice(2);
if (!executableOrStop || !rootArgument) throw new Error('Expected the VS Code executable (or --stop) and repository root.');
const repoRoot = resolve(rootArgument);
const debugRoot = join(repoRoot, '.vscode-debug');
const stateFile = join(debugRoot, 'active-session.json');
const port = Number(process.env.CAPATAZ_DEBUG_PORT ?? 58739);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CAPATAZ_DEBUG_PORT.');

async function readState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function control(state, action) {
  if (!Number.isInteger(state.controlPort) || state.controlPort < 1 || state.controlPort > 65535 || typeof state.token !== 'string') throw new Error('Invalid debug session state.');
  return fetch(`http://127.0.0.1:${state.controlPort}/${action}`, {
    method: action === 'stop' ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${state.token}` },
    signal: AbortSignal.timeout(action === 'stop' ? 30000 : 1000),
  });
}
async function removeSession(directory) {
  // Only delete a launcher-created session directly within this repository's debug root.
  if (typeof directory !== 'string' || dirname(resolve(directory)) !== debugRoot || !/^session-[A-Za-z0-9]{6}$/.test(basename(directory))) throw new Error('Refusing to delete an unexpected debug session path.');
  try {
    if (dirname(await realpath(directory)) !== await realpath(debugRoot)) throw new Error('Debug session resolves outside the debug root.');
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const old = await readState();
if (executableOrStop === '--stop') {
  if (old) {
    let response;
    try { response = await control(old, 'stop'); }
    catch (error) {
      // Check whether the supervisor already completed normal window-close cleanup.
      if (!(await readState())) process.exit(0);
      throw new Error(`Could not stop the debug host: ${error.message}. Close its window and retry.`);
    }
    if (!response.ok) throw new Error(await response.text());
    console.log(await response.text());
  }
  process.exit(0);
}

if (old) {
  let alive = false;
  try { alive = (await control(old, 'status')).ok; } catch { /* Previous supervisor has exited. */ }
  if (alive) throw new Error('A Capataz debug session is already running. Stop that session before starting another.');
  await removeSession(old.sessionRoot);
  await rm(stateFile, { force: true });
}
async function inspectorReady() {
  try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok; }
  catch { return false; }
}
if (await inspectorReady()) throw new Error(`An existing debug host is using port ${port}. Close the previous Development Host before starting a fresh session.`);

console.log('Capataz debug host starting');
await mkdir(debugRoot, { recursive: true });
const sessionRoot = await mkdtemp(join(debugRoot, 'session-'));
const workspace = join(sessionRoot, 'debug-workspace');
await mkdir(workspace);
await writeFile(join(workspace, 'README.md'), '# Disposable Capataz workspace\n\nOpen a terminal and run `capataz --help` or `capataz init` to test the CLI. **Capataz: Init** also works from the Command Palette. The command uses the repository’s current CLI build; rebuild with `npm run build:cli` in the source repository after CLI changes. This workspace and all edits are deleted when debugging stops or this window closes.\n');
const token = randomUUID();
let child;
let childClosed = Promise.resolve();
let cleanupPromise;
let finished = false;
let ready = false;
let stopRequested = false;
const server = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return; }
  if (request.method === 'GET' && request.url === '/status') { response.end('running'); return; }
  if (request.method !== 'POST' || request.url !== '/stop') { response.writeHead(404).end(); return; }
  try { stopRequested = true; await cleanup(); response.end('Capataz debug workspace deleted.'); }
  catch (error) { response.writeHead(500).end(error.message); }
});
async function terminateChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); resolve(); });
      killer.once('close', code => { if (code !== 0) child.kill(); resolve(); });
    });
  } else child.kill('SIGTERM');
  let timeout;
  try { await Promise.race([childClosed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Could not close the Development Host. Close its window, then run the stop extension host task again.')), 10000); })]); }
  finally { clearTimeout(timeout); }
}
function cleanup() {
  if (!cleanupPromise) cleanupPromise = (async () => {
    finished = true;
    await terminateChild();
    await removeSession(sessionRoot);
    const state = await readState();
    if (state?.token === token) await rm(stateFile, { force: true });
    server.close();
  })().catch(error => { cleanupPromise = undefined; throw error; });
  return cleanupPromise;
}
try {
  const cliBin = await exposeDebugCli({ sessionRoot, workspace, repoRoot });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  await writeFile(stateFile, JSON.stringify({ sessionRoot, controlPort: server.address().port, token }), { flag: 'wx' });
  const args = [
    '--new-window',
    `--user-data-dir=${join(sessionRoot, 'user-data')}`,
    `--extensions-dir=${join(sessionRoot, 'extensions')}`,
    '--disable-extensions', '--disable-workspace-trust', '--skip-welcome',
    `--inspect-brk-extensions=${port}`, `--extensionDevelopmentPath=${repoRoot}`, workspace,
  ];
  if (process.env.CAPATAZ_DEBUG_NO_SANDBOX === '1') args.unshift('--no-sandbox', '--disable-gpu-sandbox');
  const env = withDebugCliPath(process.env, cliBin);
  delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_DEV;
  child = spawn(executableOrStop, args, { stdio: 'ignore', env });
  let launchError;
  childClosed = new Promise(resolve => child.once('close', resolve));
  child.once('error', error => { launchError = error; });
  child.once('close', () => { void cleanup().catch(error => { console.error(error.message); process.exitCode = 1; }); });
  const shutdown = () => { void cleanup().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  const deadline = Date.now() + 20000;
  while (!finished && Date.now() < deadline) {
    if (launchError) throw launchError;
    if (await inspectorReady()) {
      ready = true;
      console.log(`Disposable workspace: ${workspace}`);
      console.log(`Capataz debug host ready at 127.0.0.1:${port}`);
      // Keep supervising until the host closes or postDebugTask requests cleanup.
      await childClosed;
      await cleanup();
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready && !stopRequested) throw launchError ?? new Error(finished ? 'The Development Host closed before its debugger was ready.' : 'The Development Host did not expose its inspector within 20 seconds.');
} catch (error) {
  await cleanup();
  throw error;
}
