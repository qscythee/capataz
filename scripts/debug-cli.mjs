import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

export async function exposeDebugCli({ sessionRoot, workspace, repoRoot, nodeExecutable = process.execPath }) {
  const cli = join(repoRoot, 'dist', 'cli.cjs');
  try { await access(cli); }
  catch { throw new Error('Build the CLI before launching the debug host: npm run build:cli'); }
  const bin = join(sessionRoot, 'bin');
  await mkdir(bin, { recursive: true });
  if (process.platform === 'win32') {
    const quote = value => '"' + value.replaceAll('%', '%%') + '"';
    // Use .cmd so PowerShell execution policies do not block a .ps1 shim.
    await writeFile(join(bin, 'capataz.cmd'), `@echo off\r\n${quote(nodeExecutable)} ${quote(cli)} %*\r\nexit /b %errorlevel%\r\n`);
  } else {
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    const launcher = join(bin, 'capataz');
    await writeFile(launcher, `#!/bin/sh\nexec ${quote(nodeExecutable)} ${quote(cli)} "$@"\n`);
    await chmod(launcher, 0o755);
  }
  await mkdir(join(workspace, '.vscode'), { recursive: true });
  await writeFile(join(workspace, '.vscode', 'settings.json'), JSON.stringify({
    'terminal.integrated.env.windows': { PATH: `${bin};\${env:PATH}` },
    'terminal.integrated.env.linux': { PATH: `${bin}:\${env:PATH}` },
    'terminal.integrated.env.osx': { PATH: `${bin}:\${env:PATH}` },
  }, null, 2) + '\n');
  return bin;
}

export function withDebugCliPath(env, bin) {
  const key = Object.keys(env).find(key => key.toUpperCase() === 'PATH');
  const original = env[key] ?? '';
  // Windows treats environment names as case-insensitive; avoid duplicate PATH/Path.
  const result = Object.fromEntries(Object.entries(env).filter(([key]) => key.toUpperCase() !== 'PATH'));
  return { ...result, PATH: bin + delimiter + original };
}
