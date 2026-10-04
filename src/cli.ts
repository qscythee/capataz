import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { isSea } from 'node:sea';
import { CONFIG_FILE_NAME, defaultSystemsDir } from './config';
import { nodeFs, walk } from './core/fs';
import { initialize } from './core/init';
import { buildProject, generate, newSystem, projectIssues, projectText, readConfig, resolveSystemRoute, systemName } from './core/project';
import { previewFs } from './core/preview';
import { checkProject, CheckResult } from './lint/check';
import { embeddedTemplates } from './templates';
import { normalize } from './lint/index';

const commands: [string, string][] = [
	['init', 'Initialize or adopt a project, preserving authored files'],
	['system new <name>', 'Create Client/Server/Shared directories and regenerate'],
	['system remove <name>', 'Remove a system after confirmation and regenerate'],
	['system list', 'List systems and their available runtime parts'],
	['project generate', 'Generate the Rojo project and runtime route table'],
	['project check', 'Validate config/mounts and generated project freshness'],
	['check', 'Check imports and Client/Server/Shared boundaries'],
	['explain <file>', 'Show reachable imports and dependency paths to problems'],
	['graph', 'Export dependencies as JSON or Graphviz DOT'],
	['doctor', 'Check project health and availability of external tools'],
	['dev', 'Watch project structure; run Rojo serve and sourcemap watch'],
];
const options: [string, string][] = [
	['--root <directory>', 'Project root (default: current directory)'],
	['--format <text|json|dot>', 'Output format (dot only for graph; graph defaults to json)'],
	['--dry-run', 'Preview init/new/remove/generate without writing files'],
	['--yes', 'Confirm system removal for automation'],
	['--strict', 'Fail check/doctor/explain on all warnings too'],
	['--port <number>', 'Rojo serve port (dev)'],
	['--help, -h', 'Show command help'],
	['--version, -v', 'Show Capataz version'],
];
function helpRows(rows: [string, string][]): string {
	const width = Math.max(...rows.map(([label]) => label.length)) + 2;
	return rows.map(([label, description]) => `  ${label.padEnd(width)}${description}`).join('\n');
}

const HELP = `Capataz — feature-owned Roblox systems and runtime-boundary checks

Usage: capataz <command> [options]

${helpRows(commands)}

Options:
${helpRows(options)}

Exit codes: 0 success, 1 check failures, 2 usage/config/tool failures.
`;
declare const CAPATAZ_VERSION: string;
const VERSION = typeof CAPATAZ_VERSION === 'string' ? CAPATAZ_VERSION : 'development';
function emit(value: unknown, format: string, text: string): void { process.stdout.write((format === 'json' ? JSON.stringify(value, null, 2) : text) + '\n'); }
function diagnosticText(result: CheckResult): string {
	return [...result.diagnostics.map(d => `${d.file}:${d.line}:${d.column}: ${d.severity} [${d.code}] ${d.message}`), `Checked ${result.files} files: ${result.diagnostics.filter(d => d.severity === 'error').length} errors, ${result.diagnostics.filter(d => d.severity === 'warning').length} warnings.`].join('\n');
}
function summary(result: CheckResult): object { return { files: result.files, diagnostics: result.diagnostics, dependencies: result.dependencies }; }
function failed(result: CheckResult, strict: boolean): boolean { return result.diagnostics.some(d => strict || d.severity === 'error'); }

async function toolVersion(tool: string, root: string): Promise<{ tool: string; available: boolean; version?: string; error?: string }> {
	return new Promise(resolve => {
		const child = spawn(tool, ['--version'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
		let timedOut = false;
		const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
		child.on('error', error => { clearTimeout(timeout); resolve({ tool, available: false, error: error.message }); });
		child.on('close', code => { clearTimeout(timeout); resolve({ tool, available: code === 0, version: output.trim(), ...(code === 0 ? {} : { error: timedOut ? 'Version check timed out after 5 seconds; check the project toolchain/rokit.toml.' : `Exited ${code}` }) }); });
	});
}

async function dev(root: string, port?: string): Promise<number> {
	const fs = nodeFs(root);
	await generate(fs, await readConfig(fs));
	const children = [spawn('rojo', ['serve', 'default.project.json', ...(port ? ['--port', port] : [])], { cwd: root, windowsHide: true, stdio: 'inherit' }), spawn('rojo', ['sourcemap', '--include-non-scripts', '--watch', 'default.project.json', '--output', 'sourcemap.json'], { cwd: root, windowsHide: true, stdio: 'inherit' })];
	const closed = children.map(child => new Promise<void>(resolve => child.once('close', () => resolve())));
	return new Promise(resolve => {
		let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, running = false, pending = false;
		let regeneration = Promise.resolve();
		const stop = (code: number) => {
			if (stopped) { return; } stopped = true;
			if (timer) { clearTimeout(timer); } watcher.close();
			process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
			for (const child of children) { child.kill(); }
			void Promise.all([...closed, regeneration]).then(() => resolve(code));
		};
		const interrupt = () => stop(0);
		const regenerate = async () => {
			if (running) { pending = true; return; } running = true;
			try {
				do {
					pending = false;
					if (await generate(fs, await readConfig(fs))) { console.log('Regenerated project and system routes'); }
				} while (pending && !stopped);
			} catch (error) { console.error(`Capataz: ${(error as Error).message}`); }
			finally { running = false; }
		};
		let watcher: ReturnType<typeof watch>;
		try { watcher = watch(root, { recursive: true }, (_event, filename) => {
			const file = filename?.toString().replace(/\\/g, '/');
			if (!file || /(^|\/)(node_modules|\.git|\.capataz)(\/|$)/.test(file) || ['default.project.json', 'sourcemap.json'].includes(file)) { return; }
			if (timer) { clearTimeout(timer); } timer = setTimeout(() => { if (running) { pending = true; } else { regeneration = regenerate(); } }, 200);
		}); } catch (error) { for (const child of children) { child.on('error', () => {}); child.kill(); } throw error; }
		watcher.on('error', error => { console.error(error.message); stop(2); });
		for (const child of children) {
			child.on('error', error => { console.error(`Cannot start Rojo: ${error.message}`); stop(2); });
			child.on('exit', code => { if (!stopped) { stop(code === 0 ? 0 : 2); } });
		}
		process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
		console.log('Watching project structure. Press Ctrl+C to stop.');
	});
}

export async function main(args: string[]): Promise<number> {
	const parsed = parseArgs({ args, allowPositionals: true, options: {
		root: { type: 'string' }, format: { type: 'string' }, 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' }, strict: { type: 'boolean' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
	} });
	const { values, positionals } = parsed;
	if (values.version) { console.log(VERSION); return 0; }
	if (values.help || !positionals.length) { console.log(HELP); return 0; }
	const [command, subcommand, name] = positionals;
	const signature = command === 'system' || command === 'project' ? `${command} ${subcommand}` : command;
	const arities: Record<string, number> = { init: 1, 'system new': 3, 'system remove': 3, 'system list': 2, 'project generate': 2, 'project check': 2, check: 1, explain: 2, graph: 1, doctor: 1, dev: 1 };
	if (!(signature in arities) || positionals.length !== arities[signature]) { throw new Error(`Invalid command or arguments: ${positionals.join(' ')}. Run capataz --help.`); }
	const format = values.format ?? (command === 'graph' ? 'json' : 'text');
	if (!['text', 'json', ...(command === 'graph' ? ['dot'] : [])].includes(format) || command === 'dev' && format !== 'text') { throw new Error(`Unsupported output format for ${signature}: ${format}`); }
	const mutates = ['init', 'system new', 'system remove', 'project generate'].includes(signature);
	if (values['dry-run'] && !mutates) { throw new Error('--dry-run is only supported for init, system new/remove, and project generate.'); }
	if (values.yes && signature !== 'system remove') { throw new Error('--yes is only supported for system remove.'); }
	if (values.port && (command !== 'dev' || !/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535)) { throw new Error('--port must be a number from 1 to 65535 for dev.'); }
	const root = path.resolve(values.root ?? process.cwd());
	const base = nodeFs(root), preview = values['dry-run'] ? previewFs(base) : undefined, fs = preview?.fs ?? base;
	const outputMutation = (value: object, message: string) => emit({ ...value, ...(preview ? { dryRun: true, changes: preview.changes } : {}) }, format, preview ? `Dry run:\n${preview.changes.join('\n')}` : message);
	if (command === 'init') { const created = await initialize(fs, embeddedTemplates()); outputMutation({ created }, `Initialized project (${created.length} new files/directories).`); return 0; }
	const config = await readConfig(fs);
	if (signature === 'system new') { const system = await newSystem(fs, config, name); outputMutation({ system }, `Created ${system}.`); return 0; }
	if (signature === 'system list') {
		const systems = [];
		for (const [system, directory] of await fs.entries(defaultSystemsDir(config))) {
			if (directory) {
				const parts = [];
				for (const [part, isDirectory] of await fs.entries(`${defaultSystemsDir(config)}/${system}`)) {
					const route = isDirectory ? resolveSystemRoute(config, part) : undefined;
					if (route) { parts.push(route.name); }
				}
				systems.push({ name: system, parts });
			}
		}
		systems.sort((a, b) => a.name.localeCompare(b.name)); emit(systems, format, systems.map(s => `${s.name}: ${s.parts.join(', ')}`).join('\n') || 'No systems.'); return 0;
	}
	if (signature === 'system remove') {
		const system = systemName(name), directory = `${defaultSystemsDir(config)}/${system}`;
		if (!(await fs.exists(directory))) { throw new Error(`System '${system}' does not exist.`); }
		if (!preview && !values.yes) {
			if (!process.stdin.isTTY || format === 'json') { throw new Error('System removal requires --yes in non-interactive mode; use --dry-run to review it first.'); }
			const readline = createInterface({ input: process.stdin, output: process.stderr });
			try { if (await readline.question(`Permanently remove ${directory}? Type ${system} to confirm: `) !== system) { emit({ cancelled: true }, format, 'Cancelled.'); return 0; } } finally { readline.close(); }
		}
		const files = await walk(fs, directory); await fs.remove(directory); await generate(fs, config);
		outputMutation({ system, files }, `Removed ${system} (${files.length} files).`); return 0;
	}
	if (signature === 'project generate') { await generate(fs, config); outputMutation({ file: 'default.project.json', routeFile: 'src/Core/Shared/CustomRequirer/SystemRoutes.luau' }, 'Wrote project and system routes'); return 0; }
	if (command === 'dev') { return dev(root, values.port); }
	if (signature === 'project check') {
		const issues = await projectIssues(fs, config);
		emit({ issues }, format, issues.join('\n') || 'Project config, mounts, and generated tree are current.'); return issues.length ? 1 : 0;
	}
	const result = await checkProject(fs, config);
	if (command === 'check') { emit(summary(result), format, diagnosticText(result)); return failed(result, !!values.strict) ? 1 : 0; }
	if (command === 'graph') {
		const graph = { nodes: [...result.index.modules.values()], edges: result.dependencies, diagnostics: result.diagnostics };
		if (format === 'dot') {
			console.log(['digraph Capataz {', ...graph.nodes.map(n => `  ${JSON.stringify(n.file)} [label=${JSON.stringify(`${n.file}\n${n.side ?? 'Unclassified'}`)}];`), ...graph.edges.filter(e => e.target).map(e => `  ${JSON.stringify(e.file)} -> ${JSON.stringify(e.target)};`), '}'].join('\n'));
		} else { emit(graph, format, result.dependencies.map(e => `${e.file}:${e.line} -> ${e.target ?? `unresolved (${e.specifier})`}`).join('\n')); }
		return 0;
	}
	if (command === 'explain') {
		const file = normalize(path.relative(root, path.resolve(root, subcommand)).replace(/\\/g, '/'));
		const module = result.index.modules.get(file); if (!module) { throw new Error(`Not an indexed Luau file: ${subcommand}`); }
		const paths = new Map<string, string[]>([[file, [file]]]);
		for (const [current, chain] of paths) { for (const edge of result.dependencies.filter(e => e.file === current && e.target)) { if (!paths.has(edge.target!)) { paths.set(edge.target!, [...chain, edge.target!]); } } }
		const issues = result.diagnostics.filter(d => paths.has(d.file)).map(d => ({ ...d, chain: [...paths.get(d.file)!, ...(d.target ? [d.target] : [])] }));
		const dependencies = result.dependencies.filter(e => paths.has(e.file));
		emit({ module, dependencies, diagnostics: issues }, format, [`${file}: ${module.side ?? 'Unclassified'} at ${module.instance || '(unmounted)'}`, ...dependencies.map(e => `${e.file}:${e.line} -> ${e.target ?? e.specifier} (${e.custom ? 'custom' : 'native'})`), ...issues.map(d => `${d.severity} [${d.code}] ${d.chain.join(' -> ')}\n  ${d.message}`)].join('\n'));
		return issues.some(d => values.strict || d.severity === 'error') ? 1 : 0;
	}
	const tools = await Promise.all(['rokit', 'rojo', 'luau-lsp', 'selene', 'stylua', 'wally'].map(tool => toolVersion(tool, root)));
	const issues = await projectIssues(fs, config);
	const health = { ...summary(result), projectIssues: issues, tools };
	const mandatoryMissing = tools.some(t => t.tool === 'rojo' && !t.available);
	const failure = issues.length > 0 || mandatoryMissing || failed(result, !!values.strict);
	const text = [diagnosticText(result), ...issues, ...(issues.length ? [] : ['Project mounts and generated tree are current.']), ...tools.map(t => `${t.tool}: ${t.available ? t.version : `unavailable${t.tool === 'rojo' ? ' (required for dev)' : ' (optional)'}`}`)].join('\n');
	emit(health, format, text); return failure ? 1 : 0;
}

if (isSea() || require.main === module) {
	main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
		if (process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'json' || process.argv.includes('--format=json')) { console.log(JSON.stringify({ error: (error as Error).message })); }
		else { console.error(`Capataz: ${(error as Error).message}`); }
		process.exitCode = 2;
	});
}
