import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [codeExecutable, repoRoot] = process.argv.slice(2);
const port = 58739;
const inspectorUrl = `http://127.0.0.1:${port}/json/version`;

if (!codeExecutable || !repoRoot) {
  throw new Error('Expected the VS Code executable and extension workspace path.');
}

async function inspectorReady() {
  try {
    const response = await fetch(inspectorUrl, { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
}

if (await inspectorReady()) {
  console.log(`Reusing the open Capataz debug host on 127.0.0.1:${port}. Reload that window to pick up new builds.`);
  process.exit(0);
}

const debugRoot = join(repoRoot, '.vscode-debug');
await mkdir(debugRoot, { recursive: true });

const args = [
  '--new-window',
  `--user-data-dir=${join(debugRoot, 'user-data')}`,
  `--extensions-dir=${join(debugRoot, 'extensions')}`,
  '--disable-extensions',
  '--disable-workspace-trust',
  '--skip-welcome',
  `--inspect-brk-extensions=${port}`,
  `--extensionDevelopmentPath=${repoRoot}`,
  join(repoRoot, 'debug-workspace'),
];

// The test sandbox requires these flags. Normal F5 launches keep Chromium's sandbox enabled.
if (process.env.CAPATAZ_DEBUG_NO_SANDBOX === '1') {
  args.unshift('--no-sandbox', '--disable-gpu-sandbox');
}

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
delete childEnv.VSCODE_DEV;
const child = spawn(codeExecutable, args, { detached: true, stdio: 'ignore', env: childEnv });
child.unref();

for (let attempt = 0; attempt < 150; attempt++) {
  if (await inspectorReady()) {
    console.log(`Extension host inspector ready at 127.0.0.1:${port}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

throw new Error('The Extension Development Host did not expose its inspector within 15 seconds.');
