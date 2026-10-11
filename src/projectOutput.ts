import { layouts, selectLayout, selectSystemRoot } from './core/layout';
import * as vscode from 'vscode';
import { CapatazConfig } from './config';
import { defaultProjectFile, projectFilePath } from './core/project';
import { editorFs } from './editorFs';

/** Select before any mutation; cancellation must leave source and generated files untouched. */
export async function selectProjectOutput(root: vscode.Uri, config: CapatazConfig, source?: vscode.Uri, systemOperation = false): Promise<CapatazConfig | undefined> {
	let choices = layouts(config);
	const finish = async (selected: CapatazConfig): Promise<CapatazConfig | undefined> => {
		if (!systemOperation || !selected.systemRoots) { return selected; }
		const roots = Object.keys(selected.systemMounts ?? {});
		if (roots.length === 1) { return selectSystemRoot(selected, roots[0]); }
		const root = await vscode.window.showQuickPick(roots.map(name => ({ label: name, description: selected.systemRoots![name] })), { placeHolder: 'Select the system source root' });
		return root ? selectSystemRoot(selected, root.label) : undefined;
	};
	if (source && config.systemRoots && systemOperation) {
		const entry = Object.entries(config.systemRoots).find(([, directory]) => {
			const uri = vscode.Uri.joinPath(root, directory);
			return source.scheme === uri.scheme && source.authority === uri.authority && (source.path === uri.path || source.path.startsWith(uri.path + '/'));
		});
		const consumer = entry && choices.find(layout => Object.hasOwn(layout.systemMounts ?? {}, entry[0]));
		if (!entry || !consumer) { throw new Error('Selected folder does not belong to a mounted system root.'); }
		return selectSystemRoot(consumer, entry[0]);
	}
	if (source && config.projects) {
		choices = choices.filter(layout => {
			const directory = vscode.Uri.joinPath(root, layout.systemsDir ?? 'src/Systems');
			return source.path === directory.path || source.path.startsWith(directory.path + '/');
		});
		if (choices.length === 1) { return finish(choices[0]); }
		if (!choices.length) { throw new Error('Selected folder does not belong to a configured project Systems root.'); }
	}
	const configured = defaultProjectFile(config);
	const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/*.project.json'), '**/{node_modules,.git,.capataz,.vscode-test}/**');
	const candidates = [...new Set([...files.map(uri => uri.path.slice(root.path.length + 1)), ...choices.map(layout => defaultProjectFile(layout))])].filter(file => !config.projects || choices.some(layout => defaultProjectFile(layout) === file)).sort();
	const exists = await editorFs(root).exists(configured);
	if (candidates.length <= 1 && exists) { return finish(config.projects || config.coreDir ? selectLayout(config) : config); }
	const paths = config.projects ? candidates : [configured, ...candidates.filter(file => file !== configured)];
	const selected = await vscode.window.showQuickPick(paths.map(file => ({
		label: file,
		description: file === configured ? (exists ? 'Configured default' : 'Create configured default') : undefined,
	})), { placeHolder: 'Select the project file to regenerate from Capataz configuration', ignoreFocusOut: true });
	return selected ? finish(selectLayout(config, projectFilePath(selected.label))) : undefined;
}
