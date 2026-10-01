import { copyFileSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inject } from 'postject';
import { resolve } from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} exited ${result.status}`);
}
mkdirSync('out/sea', { recursive: true });
const executable = resolve(`dist/capataz${process.platform === 'win32' ? '.exe' : ''}`);
const blob = resolve('out/sea/capataz.blob');
writeFileSync('out/sea/config.json', JSON.stringify({ main: resolve('dist/cli.cjs'), output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
run(process.execPath, ['--experimental-sea-config', 'out/sea/config.json']);
copyFileSync(process.execPath, executable);
if (process.platform === 'win32') {
  // The copied Node signature cannot apply to the modified Capataz binary.
  const image = readFileSync(executable);
  const pe = image.readUInt32LE(0x3c);
  if (image.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Expected a PE executable');
  const optional = pe + 24;
  const magic = image.readUInt16LE(optional);
  if (![0x10b, 0x20b].includes(magic)) throw new Error('Unsupported PE optional header');
  const security = optional + (magic === 0x20b ? 112 : 96) + 4 * 8;
  const offset = image.readUInt32LE(security), size = image.readUInt32LE(security + 4);
  image.fill(0, security, security + 8);
  image.writeUInt32LE(0, optional + 64);
  writeFileSync(executable, offset && offset + size === image.length ? image.subarray(0, offset) : image);
}
if (process.platform === 'darwin') run('codesign', ['--remove-signature', executable]);
await inject(executable, 'NODE_SEA_BLOB', readFileSync(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', machoSegmentName: 'NODE_SEA' });
chmodSync(executable, 0o755);
if (process.platform === 'darwin') run('codesign', ['--sign', '-', executable]);
run(executable, ['--version']);
console.log(`Standalone executable: ${executable}`);
