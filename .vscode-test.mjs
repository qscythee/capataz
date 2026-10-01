import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const localCode = process.platform === 'win32' && process.env.LOCALAPPDATA
	? join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
	: undefined;
const executable = process.env.VSCODE_EXECUTABLE_PATH || (localCode && existsSync(localCode) ? localCode : undefined);

export default defineConfig({
	files: 'out/test/**/*.test.js',
	useInstallation: executable
		? { fromPath: executable }
		: { fromMachine: true },
});
