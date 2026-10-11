import { selectLayout, layouts, routeFile, selectSystemRoot } from './core/layout';
import { watchProject } from './core/watch';
import { checkTargets, lintTargets } from './lint/targets';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { isSea } from 'node:sea';
import { CONFIG_FILE_NAME, defaultSystemsDir } from './config';
import { nodeFs, walk } from './core/fs';
import { initialize } from './core/init';
import { buildProject, generate, newSystem, projectIssues, projectText, readConfig, discoverSystems, existingSystem, defaultProjectFile, projectFilePath, generateConsumers, validateSystemMutation } from './core/project';
import { previewFs } from './core/preview';
import { checkProject, CheckResult } from './lint/check';
import { embeddedTemplates } from './templates';
import { normalize } from './lint/index';

const commands: [string, string][] = [
	['init', 'Initialize or adopt a project, preserving authored files'],
	['system new <path>', 'Create a system at a slash-separated path and regenerate'],
	['system remove <path>', 'Remove a system after confirmation and regenerate'],
	['system list', 'List full system paths and their available runtime parts'],
	['project generate', 'Generate the Rojo project and runtime route table'],
	['project check', 'Validate config/mounts and generated project freshness'],
	['check', 'Check imports and Client/Server/Shared boundaries'],
	['explain <file>', 'Show reachable imports and dependency paths to problems'],
	['graph', 'Export dependencies as JSON or Graphviz DOT'],
	['doctor', 'Check project health and availability of external tools'],
	['watch [project-file]', 'Watch, regenerate and lint; never launch external tools'],
];
const options: [string, string][] = [
	['--root <directory>', 'Project root (default: current directory)'],
	['--format <text|json|dot>', 'Output format (dot only for graph; graph defaults to json)'],
	['--dry-run', 'Preview init/new/remove/generate without writing files'],
	['--yes', 'Confirm system removal for automation'],
	['--strict', 'Fail check/doctor/explain on all warnings too'],
	['--project-file <path>', 'Select project file (init/system/project commands)'],
	['--systems-root <name>', 'Select a reusable source root for system commands'],
	['--target <name>', 'Select a named project layout or lint target'],
	['--all-targets', 'Check lint targets or generate/check all project layouts'],
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
function diagnosticText(result: Pick<CheckResult, 'files' | 'diagnostics'>): string {
	return [...result.diagnostics.map(d => `${d.file}:${d.line}:${d.column}: ${d.severity} [${d.code}] ${d.message}`), `Checked ${result.files} files: ${result.diagnostics.filter(d => d.severity === 'error').length} errors, ${result.diagnostics.filter(d => d.severity === 'warning').length} warnings.`].join('\n');
}
function summary(result: Pick<CheckResult, 'files' | 'diagnostics' | 'dependencies'>): object { return { files: result.files, diagnostics: result.diagnostics, dependencies: result.dependencies }; }
function failed(result: Pick<CheckResult, 'diagnostics'>, strict: boolean): boolean { return result.diagnostics.some(d => strict || d.severity === 'error'); }

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

export async function main(args: string[]): Promise<number> {
	const parsed = parseArgs({ args, allowPositionals: true, options: {
		root: { type: 'string' }, format: { type: 'string' }, 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' }, strict: { type: 'boolean' }, 'systems-root': { type: 'string' }, 'project-file': { type: 'string' }, target: { type: 'string' }, 'all-targets': { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
	} });
	const { values, positionals } = parsed;
	if (values.version) { console.log(VERSION); return 0; }
	if (values.help || !positionals.length) { console.log(HELP); return 0; }
	const [command, subcommand, name] = positionals;
	const signature = command === 'system' || command === 'project' ? `${command} ${subcommand}` : command;
	const arities: Record<string, number> = { init: 1, 'system new': 3, 'system remove': 3, 'system list': 2, 'project generate': 2, 'project check': 2, check: 1, explain: 2, graph: 1, doctor: 1, watch: 1 };
	if (!(signature in arities) || (positionals.length !== arities[signature] && !(signature === 'watch' && positionals.length === 2))) { throw new Error(`Invalid command or arguments: ${positionals.join(' ')}. Run capataz --help.`); }
	const format = values.format ?? (command === 'graph' ? 'json' : 'text');
	if (!['text', 'json', ...(command === 'graph' ? ['dot'] : [])].includes(format) || command === 'watch' && format !== 'text') { throw new Error(`Unsupported output format for ${signature}: ${format}`); }
	const mutates = ['init', 'system new', 'system remove', 'project generate'].includes(signature);
	if (values['dry-run'] && !mutates) { throw new Error('--dry-run is only supported for init, system new/remove, and project generate.'); }
	if (values.yes && signature !== 'system remove') { throw new Error('--yes is only supported for system remove.'); }
	if (values.target && !['check', 'explain', 'graph', 'init', 'system', 'project'].includes(command)) { throw new Error('--target is supported for init, system, project, check, explain and graph.'); }
	if (values['all-targets'] && command !== 'check' && !['project generate', 'project check'].includes(signature)) { throw new Error('--all-targets is supported for check and project generate/check.'); }
	if (values['project-file'] !== undefined && values['all-targets']) { throw new Error('Choose --project-file or --all-targets, not both.'); }
	if (values.target && values['all-targets']) { throw new Error('Choose --target or --all-targets, not both.'); }
	if (values['project-file'] !== undefined && !['init', 'system new', 'system remove', 'system list', 'project generate', 'project check'].includes(signature)) { throw new Error('--project-file is supported for init, system new/remove, and project generate/check. Watch accepts a positional project file.'); }
	if (values.target && values['project-file'] !== undefined) { throw new Error('Choose --target or --project-file, not both.'); }
	let outputFile = values['project-file'] === undefined ? undefined : projectFilePath(values['project-file']);
	if (values['systems-root'] !== undefined && command !== 'system') { throw new Error('--systems-root is only supported for system commands.'); }
	const root = path.resolve(values.root ?? process.cwd());
	const base = nodeFs(root), preview = values['dry-run'] ? previewFs(base) : undefined, fs = preview?.fs ?? base;
	const outputMutation = (value: object, message: string) => emit({ ...value, ...(preview ? { dryRun: true, changes: preview.changes } : {}) }, format, preview ? `Dry run:\n${preview.changes.join('\n')}` : message);
	if (values.target && ['init', 'system', 'project'].includes(command)) {
		const layout = (await readConfig(fs)).projects?.[values.target];
		if (!layout) { throw new Error(`Unknown project layout '${values.target}'.`); }
		outputFile = layout.projectFile;
	}
	if (command === 'init') { const created = await initialize(fs, embeddedTemplates(), outputFile); outputMutation({ created }, `Initialized project (${created.length} new files/directories).`); return 0; }
	const workspaceConfig = await readConfig(fs);
	const layout = selectLayout(workspaceConfig, outputFile);
	const config = command === 'system' ? selectSystemRoot(layout, values['systems-root']) : layout;
	if (signature === 'system new') { const system = await newSystem(fs, config, name); outputMutation({ system }, `Created ${system}.`); return 0; }
	if (signature === 'system list') {
		const systems = (await discoverSystems(fs, config)).map(system => ({ name: system.name, parts: system.parts.map(part => part.route.name) }));
		systems.sort((a, b) => a.name.localeCompare(b.name)); emit(systems, format, systems.map(s => `${s.name}: ${s.parts.join(', ')}`).join('\n') || 'No systems.'); return 0;
	}
	if (signature === 'system remove') {
		const system = await existingSystem(fs, config, name), directory = `${defaultSystemsDir(config)}/${system}`;
		if (!(await fs.exists(directory))) { throw new Error(`System '${system}' does not exist.`); }
		await validateSystemMutation(fs, config);
		if (!preview && !values.yes) {
			if (!process.stdin.isTTY || format === 'json') { throw new Error('System removal requires --yes in non-interactive mode; use --dry-run to review it first.'); }
			const readline = createInterface({ input: process.stdin, output: process.stderr });
			try { if (await readline.question(`Permanently remove ${directory}? Type ${system} to confirm: `) !== system) { emit({ cancelled: true }, format, 'Cancelled.'); return 0; } } finally { readline.close(); }
		}
		const files = await walk(fs, directory); await fs.remove(directory); await generateConsumers(fs, config);
		outputMutation({ system, files }, `Removed ${system} (${files.length} files).`); return 0;
	}
	if (signature === 'project generate') {
		const selected = values['all-targets'] ? layouts(workspaceConfig) : [config];
		for (const layout of selected) { await generate(fs, layout); }
		outputMutation({ file: defaultProjectFile(config), routeFile: routeFile(config), outputs: selected.map(layout => ({ file: defaultProjectFile(layout), routeFile: routeFile(layout) })) }, 'Wrote projects and system routes'); return 0;
	}
	if (command === 'watch') { return watchProject(root, subcommand); }
	if (signature === 'project check') {
		const issues = (await Promise.all((values['all-targets'] ? layouts(workspaceConfig) : [config]).map(async layout => (await projectIssues(fs, layout)).map(issue => `${defaultProjectFile(layout)}: ${issue}`)))).flat();
		emit({ issues }, format, issues.join('\n') || 'Project config, mounts, and generated tree are current.'); return issues.length ? 1 : 0;
	}
	if (command === 'check') {
		const result = await checkTargets(fs, config, values.target);
		emit(summary(result), format, diagnosticText(result)); return failed(result, !!values.strict) ? 1 : 0;
	}
	if ((config.projects || config.lint?.targets) && ['graph', 'explain'].includes(command) && !values.target) { throw new Error('Select a lint target with --target for ' + command + '.'); }
	const selected = values.target ? lintTargets(config, values.target)[0][1] : config.systemRoots ? lintTargets(config)[0][1] : undefined;
	const result = await checkProject(fs, config, undefined, selected);
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
	if (config.projects || config.lint?.targets) { Object.assign(result, await checkTargets(fs, config)); }
	const health = { ...summary(result), projectIssues: issues, tools };
	const failure = issues.length > 0 || failed(result, !!values.strict);
	const text = [diagnosticText(result), ...issues, ...(issues.length ? [] : ['Project mounts and generated tree are current.']), ...tools.map(t => `${t.tool}: ${t.available ? t.version : 'unavailable (optional)'}`)].join('\n');
	emit(health, format, text); return failure ? 1 : 0;
}

if (isSea() || require.main === module) {
	main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
		if (process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'json' || process.argv.includes('--format=json')) { console.log(JSON.stringify({ error: (error as Error).message })); }
		else { console.error(`Capataz: ${(error as Error).message}`); }
		process.exitCode = 2;
	});
}
