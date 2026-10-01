import * as path from 'node:path';
import { ModuleInfo, ProjectIndex, normalize, resolveCustom, resolveNative } from './index';
import { Token, tokenize } from './tokens';

export interface Diagnostic { file: string; line: number; column: number; length: number; code: string; severity: 'error' | 'warning'; message: string; target?: string }
export interface Dependency { file: string; target?: string; specifier: string; line: number; column: number; custom: boolean }
export interface Analysis { diagnostics: Diagnostic[]; dependencies: Dependency[] }

type Value = { kind: 'unknown' | 'native' | 'factory' | 'custom' | 'requirer' | 'game' | 'instance' | 'string' | 'boolean' | 'table' | 'method' | 'union'; text?: string; fields?: Record<string, Value>; receiver?: Value; roots?: Record<string, string>; alternatives?: Value[]; caseSensitive?: boolean; unverified?: boolean };
const unknown: Value = { kind: 'unknown' };
function merge(values: Value[]): Value {
	const unique = new Map(values.flatMap(v => v.kind === 'union' ? v.alternatives! : [v]).map(v => [JSON.stringify(v), v]));
	return unique.size === 1 ? [...unique.values()][0] : { kind: 'union', alternatives: [...unique.values()] };
}
const operators: Record<string, number> = { or: 1, and: 2, '==': 3, '~=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '..': 4, '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '^': 7 };

/** Static expression evaluator. Never executes project code. Unknown values stay unknown. */
class Reader {
	i = 0;
	result: Analysis = { diagnostics: [], dependencies: [] };
	scopes: Map<string, Value>[];
	constructor(private tokens: Token[], private index: ProjectIndex, private caller: ModuleInfo) {
		this.scopes = [new Map<string, Value>([['require', { kind: 'native' }], ['game', { kind: 'game' }], ['script', { kind: 'instance', text: caller.instance }]])];
	}
	peek(offset = 0): string { return this.tokens[this.i + offset]?.text ?? ''; }
	get(name: string): Value { for (let i = this.scopes.length - 1; i >= 0; i--) { const value = this.scopes[i].get(name); if (value) { return value; } } return unknown; }
	set(name: string, value: Value, local = false): void {
		if (!local) { for (let i = this.scopes.length - 1; i >= 0; i--) { if (this.scopes[i].has(name)) { this.scopes[i].set(name, value); return; } } }
		this.scopes[this.scopes.length - 1].set(name, value);
	}
	report(token: Token, code: string, message: string, severity: Diagnostic['severity'] = 'error', target?: string): void {
		this.result.diagnostics.push({ file: this.caller.file, line: token.line, column: token.column, length: token.end - token.start, code, severity, message, target });
	}
	invoke(value: Value, args: Value[], token: Token): Value {
		if (args[0]?.kind === 'union') { return merge(args[0].alternatives!.map(argument => this.invoke(value, [argument, ...args.slice(1)], token))); }
		if (value.kind === 'union') {
			if (value.alternatives!.some(v => v.kind === 'unknown')) { this.report(token, 'dynamic-require', 'Callable binding differs between control-flow paths; not every import could be verified.', 'warning'); }
			return merge(value.alternatives!.map(v => this.invoke(v, args, token)));
		}
		if (value.kind === 'factory') { return { kind: 'custom', text: args[0]?.kind === 'instance' ? args[0].text : '', roots: value.roots, caseSensitive: value.caseSensitive, unverified: value.unverified }; }
		if (value.kind === 'method') {
			const name = value.text, receiver = value.receiver!;
			if (receiver.kind === 'game' && name === 'GetService' && args[0]?.kind === 'string') { return { kind: 'instance', text: args[0].text }; }
			if (receiver.kind === 'instance' && ['WaitForChild', 'FindFirstChild'].includes(name ?? '') && args[0]?.kind === 'string') { return { kind: 'instance', text: `${receiver.text}/${args[0].text}` }; }
			if (receiver.kind === 'requirer' && name === 'new') {
				const ancestors = args[0]?.fields?.Ancestors?.fields;
				const roots: Record<string, string> = {};
				for (const [alias, root] of Object.entries(ancestors ?? {})) { if (root.kind === 'instance' && root.text) { roots[alias] = root.text; } }
				const caseOption = args[0]?.fields?.CaseSensitive;
				const unverified = !ancestors || !!args[0]?.fields?.RootResolver || !!caseOption && caseOption.kind !== 'boolean';
				if (unverified) { this.report(token, 'dynamic-requirer', 'CustomRequirer configuration cannot be fully resolved statically; use the project Import factory or literal Ancestors without RootResolver.', 'warning'); }
				return { kind: 'factory', roots, caseSensitive: caseOption?.text === 'true', unverified };
			}
			return unknown;
		}
		if (value.kind !== 'native' && value.kind !== 'custom') { return unknown; }
		if (value.unverified) {
			this.report(token, 'dynamic-require', 'Custom resolver behavior is dynamic; this import could not be verified.', 'warning');
			this.result.dependencies.push({ file: this.caller.file, specifier: args[0]?.kind === 'string' ? args[0].text! : '<dynamic>', line: token.line, column: token.column, custom: true });
			return unknown;
		}
		const argument = args[0];
		let target: ModuleInfo | undefined;
		let specifier = '<dynamic>';
		if (argument?.kind === 'instance') { specifier = argument.text ?? ''; target = this.index.instances.get(normalize(specifier)); }
		else if (argument?.kind === 'string') {
			specifier = argument.text!;
			target = value.kind === 'custom' ? resolveCustom(this.index, this.caller, specifier, value.text ?? '', value.roots, value.caseSensitive ?? true) : resolveNative(this.index, this.caller, specifier);
		} else {
			this.report(token, 'dynamic-require', 'Require target is dynamic; its runtime boundary could not be verified.', 'warning');
			this.result.dependencies.push({ file: this.caller.file, specifier, line: token.line, column: token.column, custom: value.kind === 'custom' });
			return unknown;
		}
		this.result.dependencies.push({ file: this.caller.file, target: target?.file, specifier, line: token.line, column: token.column, custom: value.kind === 'custom' });
		if (!target) { this.report(token, 'unresolved-require', `Cannot resolve ${value.kind === 'custom' ? 'custom import' : 'require'} '${specifier}' in the generated Rojo tree.`); return unknown; }
		if (!target.module) { this.report(token, 'not-module', `'${specifier}' resolves to a Script/LocalScript, not a ModuleScript.`, 'error', target.file); }
		const from = this.caller.side, to = target.side;
		if (from === 'Client' && /^(ServerScriptService|ServerStorage)\//.test(target.instance) && to !== 'Server') {
			this.report(token, 'cross-boundary', `Client code cannot access server-only mount '${target.instance}'. This WILL error at runtime.`, 'error', target.file);
		} else if (from === 'Server' && to === 'Client') {
			this.report(token, 'cross-boundary', `Requiring Client code from Server code is discouraged: '${specifier}'. It may succeed at runtime, but server code should avoid depending on client modules.`, 'warning', target.file);
		} else if (from && to && (from === 'Shared' ? to !== 'Shared' : to !== from && to !== 'Shared')) {
			this.report(token, 'cross-boundary', `${from} code cannot require ${to} code: '${specifier}'.${from === 'Client' && to === 'Server' ? ' This WILL error at runtime.' : ''}`, 'error', target.file);
		}
		if (target.file === 'src/Import.luau') { return { kind: 'factory' }; }
		if (target.file === 'src/Core/Shared/CustomRequirer/init.luau') { return { kind: 'requirer' }; }
		return unknown;
	}
	expression(minimum = 0): Value {
		const token = this.tokens[this.i];
		if (!token) { return unknown; }
		let value: Value;
		if (token.text === 'if') {
			this.i++; this.expression(); if (this.peek() === 'then') { this.i++; }
			const branches = [this.expression()];
			while (this.peek() === 'elseif') { this.i++; this.expression(); if (this.peek() === 'then') { this.i++; } branches.push(this.expression()); }
			if (this.peek() === 'else') { this.i++; branches.push(this.expression()); }
			value = merge(branches);
		} else if (['true', 'false'].includes(token.text)) { value = { kind: 'boolean', text: token.text }; this.i++; }
		else if (token.kind === 'string') { value = { kind: 'string', text: token.text }; this.i++; }
		else if (token.text === '(') { this.i++; value = this.expression(); if (this.peek() === ')') { this.i++; } }
		else if (token.text === '{') {
			this.i++; const fields: Record<string, Value> = {};
			while (this.peek() && this.peek() !== '}') {
				const start = this.i;
				let key = this.peek();
				if (this.peek(1) === '=') { this.i += 2; fields[key] = this.expression(); }
				else if (this.peek() === '[') { this.i++; const k = this.expression(); key = k.text ?? ''; if (this.peek() === ']') { this.i++; } if (this.peek() === '=') { this.i++; fields[key] = this.expression(); } }
				else { this.expression(); }
				if (this.peek() === ',' || this.peek() === ';') { this.i++; }
				if (this.i === start) { this.i++; }
			}
			if (this.peek() === '}') { this.i++; } value = { kind: 'table', fields };
		} else if (token.text === 'function') {
			this.i++; this.functionBody(); value = unknown;
		} else if (['not', '-', '#'].includes(token.text)) { this.i++; this.expression(8); value = unknown; }
		else if (token.kind === 'word') { value = this.get(token.text); this.i++; }
		else { this.i++; value = unknown; }
		while (this.peek()) {
			if (this.peek() === '.' || this.peek() === ':') {
				const colon = this.peek() === ':';
				this.i++; const name = this.peek(); this.i++;
				if (value.kind === 'instance' && !colon) { value = { kind: 'instance', text: name === 'Parent' ? path.posix.dirname(value.text ?? '') : `${value.text}/${name}` }; }
				else if ((value.kind === 'game' || value.kind === 'instance') && colon || value.kind === 'requirer' && name === 'new') { value = { kind: 'method', text: name, receiver: value }; }
				else { value = value.fields?.[name] ?? unknown; }
			} else if (this.peek() === '[') {
				this.i++; const key = this.expression(); if (this.peek() === ']') { this.i++; }
				value = key.kind === 'string' ? value.kind === 'instance' ? { kind: 'instance', text: `${value.text}/${key.text}` } : value.fields?.[key.text!] ?? unknown : unknown;
			} else if (this.peek() === '(' || this.tokens[this.i]?.kind === 'string' || this.peek() === '{') {
				const callToken = token;
				const args: Value[] = [];
				if (this.peek() === '(') {
					this.i++;
					while (this.peek() && this.peek() !== ')') { const before = this.i; args.push(this.expression()); if (this.peek() !== ',') { break; } this.i++; if (this.i === before) { break; } }
					if (this.peek() === ')') { this.i++; }
				} else { args.push(this.expression(9)); }
				value = this.invoke(value, args, callToken);
			} else if (this.peek() === '::') {
				this.i++; this.skipType();
			} else {
				const op = this.peek(), precedence = operators[op];
				if (!precedence || precedence <= minimum) { break; }
				this.i++; const right = this.expression(precedence);
				value = ['and', 'or'].includes(op) ? merge([value, right]) : op === '..' && value.kind === 'string' && right.kind === 'string' ? { kind: 'string', text: value.text! + right.text! } : unknown;
			}
		}
		return value;
	}
	skipType(): void {
		const startLine = this.tokens[this.i]?.line;
		let depth = 0;
		while (this.peek()) {
			const text = this.peek();
			if (depth === 0 && (['=', ',', ')', ';'].includes(text) || this.tokens[this.i].line !== startLine)) { break; }
			if (['{', '(', '<', '['].includes(text)) { depth++; }
			if (['}', ')', '>', ']'].includes(text)) { if (!depth) { break; } depth--; }
			this.i++;
			// A single named type ends before expression suffixes or the next statement.
			if (!depth && !['.', '?', '|', '&', '<', '[', '->'].includes(this.peek())) { break; }
		}
	}
	functionBody(): void {
		const scope = new Map<string, Value>();
		if (this.peek() === '<') {
			let depth = 0;
			do { const text = this.peek(); this.i++; if (text === '<') { depth++; } else if (text === '>') { depth--; } } while (this.peek() && depth);
		}
		if (this.peek() === '(') {
			this.i++;
			while (this.peek() && this.peek() !== ')') {
				const name = this.peek(); this.i++; scope.set(name, unknown);
				if (this.peek() === ':') { this.i++; this.skipType(); }
				if (this.peek() === ',') { this.i++; }
			}
			if (this.peek() === ')') { this.i++; }
		}
		if (this.peek() === ':') { this.i++; this.skipType(); }
		// Function bodies must not mutate the analysis state of their enclosing scope.
		const saved = this.scopes; this.scopes = structuredClone(saved); this.scopes.push(scope);
		this.block(new Set(['end'])); if (this.peek() === 'end') { this.i++; }
		this.scopes = saved;
	}
	block(stops = new Set<string>()): void {
		while (this.peek() && !stops.has(this.peek())) {
			const start = this.i;
			const local = this.peek() === 'local';
			if (local) { this.i++; }
			if (this.peek() === 'function') {
				this.i++;
				const name = this.peek(); this.set(name, unknown, local); this.i++;
				while (this.peek() === '.' || this.peek() === ':') { this.i += 2; }
				this.functionBody();
			} else if (this.peek() === 'if' && !local) {
				this.i++; this.expression();
				if (this.peek() === 'then') { this.i++; }
				const saved = this.scopes, branches: Map<string, Value>[][] = [];
				let hasElse = false;
				while (true) {
					this.scopes = structuredClone(saved); this.scopes.push(new Map());
					this.block(new Set(['elseif', 'else', 'end'])); this.scopes.pop(); branches.push(this.scopes);
					this.scopes = saved;
					if (this.peek() === 'elseif') { this.i++; this.expression(); if (this.peek() === 'then') { this.i++; } }
					else if (this.peek() === 'else') { hasElse = true; this.i++; }
					else { break; }
				}
				if (!hasElse) { branches.push(saved); }
				for (let s = 0; s < saved.length; s++) {
					for (const name of saved[s].keys()) {
						const values = branches.map(b => b[s].get(name) ?? unknown);
						saved[s].set(name, merge(values));
					}
				}
				if (this.peek() === 'end') { this.i++; }
			} else if (['do', 'for', 'while', 'repeat'].includes(this.peek()) && !local) {
				const kind = this.peek(); this.i++;
				const saved = this.scopes; this.scopes = structuredClone(saved); this.scopes.push(new Map());
				if (kind === 'for') {
					while (this.peek() && !['=', 'in'].includes(this.peek())) { if (this.tokens[this.i].kind === 'word') { this.set(this.peek(), unknown, true); } this.i++; }
					this.i++;
				}
				if (kind === 'while' || kind === 'for') { while (this.peek() && this.peek() !== 'do') { const before = this.i; this.expression(); if (this.i === before) { this.i++; } } if (this.peek() === 'do') { this.i++; } }
				this.block(new Set([kind === 'repeat' ? 'until' : 'end'])); if (this.peek()) { this.i++; } if (kind === 'repeat') { this.expression(); }
				const modified = this.scopes;
				this.scopes = saved;
				for (let s = 0; s < saved.length; s++) {
					for (const name of saved[s].keys()) {
						const after = modified[s].get(name) ?? unknown;
						saved[s].set(name, kind === 'do' || kind === 'repeat' ? after : merge([saved[s].get(name)!, after]));
					}
				}
			} else if (this.peek() === 'type' || this.peek() === 'export' && this.peek(1) === 'type') {
				const line = this.tokens[this.i].line;
				while (this.peek() && this.tokens[this.i].line === line) { this.i++; }
			} else if (local || this.tokens[this.i]?.kind === 'word' && ['=', ','].includes(this.peek(1))) {
				const names: string[] = [];
				while (this.peek()) {
					names.push(this.peek()); this.i++;
					if (this.peek() === ':') { this.i++; this.skipType(); }
					if (this.peek() !== ',') { break; } this.i++;
				}
				const values: Value[] = [];
				if (this.peek() === '=') { this.i++; values.push(this.expression()); while (this.peek() === ',') { this.i++; values.push(this.expression()); } }
				names.forEach((name, i) => this.set(name, values[i] ?? unknown, local));
			} else if (this.tokens[this.i]?.kind === 'word' && ['.', '['].includes(this.peek(1))) {
				const before = this.i;
				let container = this.get(this.peek()); this.i++;
				let parent = unknown, key = '';
				while (['.', '['].includes(this.peek())) {
					parent = container;
					if (this.peek() === '.') { this.i++; key = this.peek(); this.i++; }
					else { this.i++; const field = this.expression(); key = field.kind === 'string' ? field.text! : ''; if (this.peek() === ']') { this.i++; } }
					container = parent.fields?.[key] ?? unknown;
				}
				if (this.peek() === '=') { this.i++; const value = this.expression(); if (parent.kind === 'table' && key) { parent.fields![key] = value; } }
				else { this.i = before; this.expression(); }
			} else if (this.peek() === 'return') { this.i++; this.expression(); }
			else { this.expression(); }
			if (this.i === start) { this.i++; }
		}
	}
}

export function analyzeSource(source: string, index: ProjectIndex, caller: ModuleInfo): Analysis {
	const reader = new Reader(tokenize(source), index, caller);
	reader.block();
	const lines = source.split(/\r?\n/);
	reader.result.diagnostics = reader.result.diagnostics.filter(d => {
		if (d.severity === 'error' || !['dynamic-require', 'dynamic-requirer'].includes(d.code)) { return true; }
		const directive = /--\s*capataz-ignore\s+([a-z-]+)\s*:/.exec(lines[d.line - 2] ?? '');
		return directive?.[1] !== d.code;
	});
	reader.result.diagnostics = [...new Map(reader.result.diagnostics.map(d => [`${d.line}:${d.column}:${d.code}:${d.message}`, d])).values()];
	reader.result.dependencies = [...new Map(reader.result.dependencies.map(d => [`${d.line}:${d.column}:${d.target}:${d.specifier}:${d.custom}`, d])).values()];
	return reader.result;
}
