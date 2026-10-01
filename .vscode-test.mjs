import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const localCode = process.platform === 'win32' && process.env.LOCALAPPDATA
	? join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
	: undefined;
const executable = process.env.VSCODE_EXECUTABLE_PATH || (localCode && existsSync(localCode) ? localCode : undefined);
const fixture = join(process.cwd(), 'out', 'editor-fixture');
mkdirSync(fixture, { recursive: true });

export default defineConfig({
	files: 'out/test/**/*.test.js',
	launchArgs: [fixture],
	useInstallation: executable
		? { fromPath: executable }
		: { fromMachine: true },
});
