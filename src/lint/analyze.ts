import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ModuleInfo, ProjectIndex, normalize, resolveCustom, resolveNative } from './index';
import { Token, tokenize } from './tokens';

export interface Diagnostic { file: string; line: number; column: number; length: number; endLine: number; endColumn: number; code: string; severity: 'error' | 'warning'; message: string; target?: string }
export interface Dependency { file: string; target?: string; specifier: string; line: number; column: number; custom: boolean }
export interface Analysis { diagnostics: Diagnostic[]; dependencies: Dependency[] }

export type Value = { kind: 'opaque' | 'nil' | 'number' | 'function' | 'builtin' | 'unknown' | 'native' | 'factory' | 'custom' | 'requirer' | 'game' | 'instance' | 'string' | 'boolean' | 'table' | 'method' | 'union'; text?: string; fields?: Record<string, Value>; receiver?: Value; roots?: Record<string, string>; alternatives?: Value[]; caseSensitive?: boolean; unverified?: boolean; resolver?: Value; routes?: Value; parameters?: string[]; body?: Token[]; captures?: Map<string, Value>[]; dynamicRoots?: string[]; owner?: ModuleInfo };
export interface EvaluationContext {
	runtime: 'Client' | 'Server';
	exportOf(module: ModuleInfo): Value;
}
const truth = (value: Value): boolean | undefined => value.kind === 'nil' ? false : value.kind === 'boolean' ? value.text === 'true' : ['string', 'number', 'instance', 'table', 'function', 'factory'].includes(value.kind) ? true : undefined;
const unknown: Value = { kind: 'unknown' };
function merge(values: Value[]): Value {
	const unique: Value[] = [];
	// Class tables can reference themselves through __index; compare without JSON serialization.
	for (const value of values.flatMap(v => v.kind === 'union' ? v.alternatives! : [v])) {
		if (!unique.some(existing => isDeepStrictEqual(existing, value))) { unique.push(value); }
	}
	return unique.length === 1 ? unique[0] : { kind: 'union', alternatives: unique };
}
const operators: Record<string, number> = { or: 1, and: 2, '==': 3, '~=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '..': 4, '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '^': 7 };

/** Static expression evaluator. Never executes project code. Unknown values stay unknown. */
class Reader {
	i = 0;
	result: Analysis = { diagnostics: [], dependencies: [] };
	scopes: Map<string, Value>[];
	returns: Value[][] = [];
	terminated = false;
	uncertain = false;
	constructor(private tokens: Token[], private index: ProjectIndex, private caller: ModuleInfo, private context?: EvaluationContext, private evaluationOnly = false) {
		this.scopes = [new Map<string, Value>([['require', { kind: 'native' }], ['game', { kind: 'game' }], ['script', { kind: 'instance', text: caller.instance }], ['string', { kind: 'table', fields: { lower: { kind: 'builtin', text: 'lower' } } }]])];
	}
	peek(offset = 0): string { return this.tokens[this.i + offset]?.text ?? ''; }
	get(name: string): Value { for (let i = this.scopes.length - 1; i >= 0; i--) { const value = this.scopes[i].get(name); if (value) { return value; } } return unknown; }
	set(name: string, value: Value, local = false): void {
		if (!local) { for (let i = this.scopes.length - 1; i >= 0; i--) { if (this.scopes[i].has(name)) { this.scopes[i].set(name, value); return; } } }
		this.scopes[this.scopes.length - 1].set(name, value);
	}
	report(token: Token, code: string, message: string, severity: Diagnostic['severity'] = 'error', target?: string, endToken = token): void {
		this.result.diagnostics.push({ file: this.caller.file, line: token.line, column: token.column, length: endToken.end - token.start, endLine: endToken.endLine, endColumn: endToken.endColumn, code, severity, message, target });
	}
	invoke(value: Value, args: Value[], token: Token, endToken = token): Value {
		if (args[0]?.kind === 'union') { return merge(args[0].alternatives!.map(argument => this.invoke(value, [argument, ...args.slice(1)], token, endToken))); }
		if (value.kind === 'union') {
			if (value.alternatives!.some(v => v.kind === 'unknown') && value.alternatives!.some(v => ['native', 'custom', 'factory'].includes(v.kind))) { this.report(token, 'dynamic-require', 'Callable binding differs between control-flow paths; not every import could be verified.', 'warning', undefined, endToken); }
			return merge(value.alternatives!.map(v => this.invoke(v, args, token, endToken)));
		}
		if (value.kind === 'factory') { return { ...value, kind: 'custom', text: args[0]?.kind === 'instance' ? args[0].text : '' }; }
		if (value.kind === 'builtin' && value.text === 'lower') { return args[0]?.kind === 'string' ? { kind: 'string', text: args[0].text!.toLowerCase() } : unknown; }
		if (value.kind === 'opaque') { return args[0]?.kind === 'instance' ? { kind: 'custom', unverified: true } : unknown; }
		if (value.kind === 'function') {
			if (this.evaluationOnly) { this.uncertain = true; return unknown; }
			const result = this.evaluateFunction(value, args)[0] ?? unknown;
			return result.kind === 'unknown' && args[0]?.kind === 'instance' ? { kind: 'custom', unverified: true } : result;
		}
		if (value.kind === 'method') {
			const name = value.text, receiver = value.receiver!;
			if (receiver.kind === 'instance' && receiver.text === 'RunService' && ['IsClient', 'IsServer'].includes(name ?? '')) {
				return this.context ? { kind: 'boolean', text: String(this.context.runtime === (name === 'IsClient' ? 'Client' : 'Server')) } : unknown;
			}
			if (receiver.kind === 'game' && name === 'GetService' && args[0]?.kind === 'string') { return { kind: 'instance', text: args[0].text }; }
			if (receiver.kind === 'instance' && ['WaitForChild', 'FindFirstChild'].includes(name ?? '') && args[0]?.kind === 'string') { return { kind: 'instance', text: `${receiver.text}/${args[0].text}` }; }
			if (receiver.kind === 'requirer' && name === 'new') {
				const ancestors = args[0]?.fields?.Ancestors?.fields;
				const roots: Record<string, string> = {};
				for (const [alias, root] of Object.entries(ancestors ?? {})) { if (root.kind === 'instance' && root.text) { roots[alias] = root.text; } }
				const caseOption = args[0]?.fields?.CaseSensitive;
				const resolver = args[0]?.fields?.RootResolver;
				const unverified = !ancestors || !!resolver && resolver.kind !== 'function' && resolver.kind !== 'nil' || !!caseOption && caseOption.kind !== 'boolean';
				if (unverified) { this.report(token, 'dynamic-requirer', 'CustomRequirer configuration cannot be fully resolved statically; use statically known Ancestors or declare a factory override.', 'warning', undefined, endToken); }
				return { kind: 'factory', roots, caseSensitive: caseOption?.text === 'true', unverified, resolver, routes: args[0]?.fields?.ServiceRoutes, dynamicRoots: Object.entries(ancestors ?? {}).filter(([, root]) => root.kind !== 'instance').map(([alias]) => alias.toLowerCase()) };
			}
			return unknown;
		}
		if (value.kind !== 'native' && value.kind !== 'custom') { this.uncertain = true; return unknown; }
		if (this.evaluationOnly) { this.uncertain = true; return unknown; }
		if (value.unverified) {
			this.report(token, 'dynamic-require', 'Custom resolver behavior is dynamic; this import could not be verified.', 'warning', undefined, endToken);
			this.result.dependencies.push({ file: this.caller.file, specifier: args[0]?.kind === 'string' ? args[0].text! : '<dynamic>', line: token.line, column: token.column, custom: true });
			return unknown;
		}
		const argument = args[0];
		let target: ModuleInfo | undefined;
		let specifier = '<dynamic>';
		if (argument?.kind === 'instance') { specifier = argument.text ?? ''; target = this.index.instances.get(normalize(specifier)); }
		else if (argument?.kind === 'string') {
			specifier = argument.text!;
			if (value.kind === 'custom') {
				const resolved = this.customTarget(value, specifier);
				if (resolved.dynamic) {
					this.report(token, 'dynamic-require', 'Custom resolver behavior is dynamic; this import could not be verified.', 'warning', undefined, endToken);
					this.result.dependencies.push({ file: this.caller.file, specifier, line: token.line, column: token.column, custom: true }); return unknown;
				}
				target = resolved.target;
			} else { target = resolveNative(this.index, this.caller, specifier); }
		} else {
			this.report(token, 'dynamic-require', 'Require target is dynamic; its runtime boundary could not be verified.', 'warning', undefined, endToken);
			this.result.dependencies.push({ file: this.caller.file, specifier, line: token.line, column: token.column, custom: value.kind === 'custom' });
			return unknown;
		}
		this.result.dependencies.push({ file: this.caller.file, target: target?.file, specifier, line: token.line, column: token.column, custom: value.kind === 'custom' });
		if (!target) { this.report(token, 'unresolved-require', `Cannot resolve ${value.kind === 'custom' ? 'custom import' : 'require'} '${specifier}' in the generated Rojo tree.`, 'error', undefined, endToken); return unknown; }
		if (!target.module) { this.report(token, 'not-module', `'${specifier}' resolves to a Script/LocalScript, not a ModuleScript.`, 'error', target.file, endToken); }
		const from = this.caller.side, to = target.side;
		if (from === 'Client' && /^(ServerScriptService|ServerStorage)\//.test(target.instance) && to !== 'Server') {
			this.report(token, 'cross-boundary', `Client code cannot access server-only mount '${target.instance}'. This WILL error at runtime.`, 'error', target.file, endToken);
		} else if (from === 'Server' && to === 'Client') {
			this.report(token, 'cross-boundary', `Requiring Client code from Server code is discouraged: '${specifier}'. It may succeed at runtime, but server code should avoid depending on client modules.`, 'warning', target.file, endToken);
		} else if (from && to && (from === 'Shared' ? to !== 'Shared' : to !== from && to !== 'Shared')) {
			this.report(token, 'cross-boundary', `${from} code cannot require ${to} code: '${specifier}'.${from === 'Client' && to === 'Server' ? ' This WILL error at runtime.' : ''}`, 'error', target.file, endToken);
		}
				if (target.file === 'src/Core/Shared/CustomRequirer/init.luau') { return { kind: 'requirer' }; }
		return this.context?.exportOf(target) ?? unknown;
	}
	evaluateFunction(fn: Value, args: Value[]): Value[] {
		if (fn.kind !== 'function' || !fn.body || fn.body.length > 2000 || fn.body.some(token => ['while', 'for', 'repeat', 'function'].includes(token.text))) { return [unknown]; }
		const reader = new Reader(fn.body, this.index, fn.owner ?? this.caller, this.context, true);
		reader.scopes = structuredClone(fn.captures ?? this.scopes);
		reader.scopes.push(new Map((fn.parameters ?? []).map((name, i) => [name, args[i] ?? { kind: 'nil' } as Value])));
		reader.block();
		if (!reader.uncertain && !reader.terminated && reader.returns.length === 0) { return [{ kind: 'nil' }]; }
		if (reader.uncertain || !reader.terminated || reader.returns.length !== 1) { return [unknown]; }
		return reader.returns[0];
	}
	customTarget(value: Value, specifier: string): { target?: ModuleInfo; dynamic?: boolean } {
		if (!specifier.startsWith('@')) { return { target: resolveCustom(this.index, this.caller, specifier, value.text ?? '', value.roots ?? {}, value.caseSensitive ?? true) }; }
		const [alias, ...parts] = specifier.slice(1).split('/');
		let roots = value.roots ?? {};
		let redirected: string | undefined;
		const route = alias.toLowerCase() === 'systems' ? value.routes?.fields?.[parts[1]?.toLowerCase()] : undefined;
		if (value.routes && value.routes.kind !== 'table' && value.routes.kind !== 'nil') { return { dynamic: true }; }
		if (route) {
			if (route.fields?.Service?.kind !== 'string' || route.fields?.Name?.kind !== 'string') { return { dynamic: true }; }
			redirected = route.fields.Service.text + '/Systems'; parts[1] = route.fields.Name.text!;
		} else if (value.resolver && value.resolver.kind !== 'nil') {
			const result = this.evaluateFunction(value.resolver, [{ kind: 'string', text: alias }, { kind: 'table', fields: Object.fromEntries(parts.map((part, i) => [String(i + 1), { kind: 'string', text: part } as Value])) }, { kind: 'instance', text: value.text }]);
			if (result[0]?.kind === 'instance') {
				const consumed = !result[1] || result[1].kind === 'nil' ? 0 : result[1].kind === 'number' ? Number(result[1].text) : NaN;
				if (!Number.isInteger(consumed) || consumed < 0) { return { dynamic: true }; }
				redirected = result[0].text; parts.splice(0, consumed);
			} else if (result[0]?.kind !== 'nil') { return { dynamic: true }; }
		}
		if (redirected) { roots = { [alias]: redirected }; }
		else if (value.dynamicRoots?.includes(alias.toLowerCase())) { return { dynamic: true }; }
		return { target: resolveCustom(this.index, this.caller, '@' + alias + '/' + parts.join('/'), value.text ?? '', roots, value.caseSensitive ?? true) };
	}
	expression(minimum = 0): Value {
		const token = this.tokens[this.i];
		if (!token) { return unknown; }
		let value: Value;
		if (token.text === 'if') {
			this.i++; let condition = truth(this.expression()); if (this.peek() === 'then') { this.i++; }
			const branches: Value[] = []; let remaining = true;
			const branch = () => {
				const diagnostics = this.result.diagnostics.length, dependencies = this.result.dependencies.length, uncertain = this.uncertain;
				const result = this.expression();
				if (remaining && condition !== false) { branches.push(result); }
				else { this.result.diagnostics.length = diagnostics; this.result.dependencies.length = dependencies; this.uncertain = uncertain; }
				if (condition === true) { remaining = false; }
			};
			branch();
			while (this.peek() === 'elseif') { this.i++; condition = truth(this.expression()); if (this.peek() === 'then') { this.i++; } branch(); }
			if (this.peek() === 'else') { this.i++; condition = true; branch(); }
			value = merge(branches.length ? branches : [unknown]);
		} else if (token.text === 'nil') { value = { kind: 'nil' }; this.i++; }
		else if (/^\d$/.test(token.text)) { let text = ''; while (/^\d$/.test(this.peek())) { text += this.peek(); this.i++; } value = { kind: 'number', text }; }
		else if (['true', 'false'].includes(token.text)) { value = { kind: 'boolean', text: token.text }; this.i++; }
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
			this.i++; value = this.functionBody();
		} else if (['not', '-', '#'].includes(token.text)) { this.i++; const operand = this.expression(8); const known = truth(operand); value = token.text === 'not' && known !== undefined ? { kind: 'boolean', text: String(!known) } : unknown; }
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
				value = ['string', 'number'].includes(key.kind) ? value.kind === 'instance' ? { kind: 'instance', text: `${value.text}/${key.text}` } : value.fields?.[key.text!] ?? (value.kind === 'table' ? { kind: 'nil' } : unknown) : unknown;
			} else if (this.peek() === '(' || this.tokens[this.i]?.kind === 'string' || this.peek() === '{') {
				const callToken = token;
				const args: Value[] = [];
				if (this.peek() === '(') {
					this.i++;
					while (this.peek() && this.peek() !== ')') { const before = this.i; args.push(this.expression()); if (this.peek() !== ',') { break; } this.i++; if (this.i === before) { break; } }
					if (this.peek() === ')') { this.i++; }
				} else { args.push(this.expression(9)); }
				value = this.invoke(value, args, callToken, this.tokens[this.i - 1] ?? callToken);
			} else if (this.peek() === '::') {
				this.i++; this.skipType();
			} else {
				const op = this.peek(), precedence = operators[op];
				if (!precedence || precedence <= minimum) { break; }
				this.i++; const right = this.expression(precedence);
				if (op === 'and' || op === 'or') { const known = truth(value); value = known === undefined ? merge([value, right]) : (op === 'and' ? known : !known) ? right : value; }
				else if (['==', '~='].includes(op) && ['string', 'number', 'boolean', 'nil'].includes(value.kind) && ['string', 'number', 'boolean', 'nil'].includes(right.kind)) { value = { kind: 'boolean', text: String((value.kind === right.kind && value.text === right.text) === (op === '==')) }; }
				else { value = op === '..' && value.kind === 'string' && right.kind === 'string' ? { kind: 'string', text: value.text! + right.text! } : unknown; }
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
	functionBody(): Value {
		const parameters: string[] = [];
		const scope = new Map<string, Value>();
		if (this.peek() === '<') {
			let depth = 0;
			do { const text = this.peek(); this.i++; if (text === '<') { depth++; } else if (text === '>') { depth--; } } while (this.peek() && depth);
		}
		if (this.peek() === '(') {
			this.i++;
			while (this.peek() && this.peek() !== ')') {
				const name = this.peek(); this.i++; scope.set(name, unknown); parameters.push(name);
				if (this.peek() === ':') { this.i++; this.skipType(); }
				if (this.peek() === ',') { this.i++; }
			}
			if (this.peek() === ')') { this.i++; }
		}
		if (this.peek() === ':') { this.i++; this.skipType(); }
		// Function bodies must not mutate the analysis state of their enclosing scope.
		const bodyStart = this.i, savedReturns = this.returns, savedTerminated = this.terminated, savedUncertain = this.uncertain;
		this.returns = []; this.terminated = false;
		const saved = this.scopes; this.scopes = structuredClone(saved); this.scopes.push(scope);
		this.block(new Set(['end'])); const body = this.tokens.slice(bodyStart, this.i); if (this.peek() === 'end') { this.i++; }
		this.scopes = saved; this.returns = savedReturns; this.terminated = savedTerminated; this.uncertain = savedUncertain;
		// Capture only referenced bindings, avoiding recursively copying every earlier function.
		if (body.length > 2000 || body.some(token => ['while', 'for', 'repeat', 'function'].includes(token.text))) { return { kind: 'function', parameters }; }
		const referenced = new Set(body.filter(token => token.kind === 'word').map(token => token.text));
		const captures = saved.map(scope => new Map([...scope].filter(([name]) => referenced.has(name))));
		return { kind: 'function', parameters, body, captures: structuredClone(captures), owner: this.caller };
	}
	block(stops = new Set<string>()): void {
		while (this.peek() && !stops.has(this.peek())) {
			const start = this.i;
			const dead = this.terminated;
			const checkpoint = dead ? { scopes: structuredClone(this.scopes), diagnostics: this.result.diagnostics.length, dependencies: this.result.dependencies.length, returns: this.returns.length, uncertain: this.uncertain } : undefined;
			const local = this.peek() === 'local';
			if (local) { this.i++; }
			if (this.peek() === 'function') {
				this.i++;
				const name = this.peek(); this.set(name, unknown, local); this.i++;
				while (this.peek() === '.' || this.peek() === ':') { this.i += 2; }
				const fn = this.functionBody(); this.set(name, fn, local);
			} else if (this.peek() === 'if' && !local) {
				this.i++; let condition = truth(this.expression());
				if (this.peek() === 'then') { this.i++; }
				const saved = this.scopes, branches: Map<string, Value>[][] = [];
				let remaining = true, hasElse = false;
				while (true) {
					const possible = remaining && condition !== false;
					const diagnostics = this.result.diagnostics.length, dependencies = this.result.dependencies.length, returns = this.returns.length, uncertain = this.uncertain;
					this.scopes = structuredClone(saved); this.scopes.push(new Map()); this.terminated = false;
					this.block(new Set(['elseif', 'else', 'end'])); this.scopes.pop();
					if (possible) { if (!this.terminated) { branches.push(this.scopes); } }
					else { this.result.diagnostics.length = diagnostics; this.result.dependencies.length = dependencies; this.returns.length = returns; this.uncertain = uncertain; }
					this.scopes = saved; this.terminated = false;
					if (condition === true) { remaining = false; }
					if (this.peek() === 'elseif') { this.i++; condition = truth(this.expression()); if (this.peek() === 'then') { this.i++; } }
					else if (this.peek() === 'else') { hasElse = true; condition = true; this.i++; }
					else { break; }
				}
				if (!hasElse && remaining) { branches.push(saved); }
				for (let scope = 0; scope < saved.length; scope++) {
					for (const name of saved[scope].keys()) { saved[scope].set(name, merge(branches.map(branch => branch[scope].get(name) ?? unknown))); }
				}
				this.terminated = branches.length === 0;
				if (this.peek() === 'end') { this.i++; }
			} else if (['do', 'for', 'while', 'repeat'].includes(this.peek()) && !local) {
				const kind = this.peek(); this.i++; if (kind !== 'do') { this.uncertain = true; }
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
				if (this.peek() === '=') { this.i++; const value = this.expression(); if (parent.kind === 'table' && key) { parent.fields![key] = value; } else { this.uncertain = true; } }
				else { this.i = before; this.expression(); }
			} else if (this.peek() === 'return') { this.i++; const values = [this.expression()]; while (this.peek() === ',') { this.i++; values.push(this.expression()); } this.returns.push(values); this.terminated = true; }
			else { this.expression(); }
			if (checkpoint) { this.scopes = checkpoint.scopes; this.result.diagnostics.length = checkpoint.diagnostics; this.result.dependencies.length = checkpoint.dependencies; this.returns.length = checkpoint.returns; this.uncertain = checkpoint.uncertain; this.terminated = true; }
			if (this.i === start) { this.i++; }
		}
	}
}

export function analyzeSource(source: string, index: ProjectIndex, caller: ModuleInfo, context?: EvaluationContext): Analysis {
	const comments: Token[] = [];
	const reader = new Reader(tokenize(source, comments), index, caller, context);
	reader.block();
	const disabledLines = new Map<number, Set<string>>();
	for (const comment of comments) {
		const directive = /^--\s*Capataz\(([a-z-]+)\)(?:\s+.*)?$/i.exec(comment.text.trimEnd());
		if (directive) {
			for (const line of [comment.line, comment.line + 1]) {
				const rules = disabledLines.get(line) ?? new Set<string>();
				rules.add(directive[1].toLowerCase());
				disabledLines.set(line, rules);
			}
		}
	}
	const lines = source.split(/\r?\n/);
	reader.result.diagnostics = reader.result.diagnostics.filter(d => {
		if (d.severity === 'error' || !['dynamic-require', 'dynamic-requirer'].includes(d.code)) { return true; }
		if (d.code === 'dynamic-require' && index.config.lint?.rules?.['dynamic-require'] === 'off') { return false; }
		if (disabledLines.get(d.line)?.has(d.code)) { return false; }
		const directive = /--\s*capataz-ignore\s+([a-z-]+)\s*:/.exec(lines[d.line - 2] ?? '');
		return directive?.[1] !== d.code;
	});
	reader.result.diagnostics = [...new Map(reader.result.diagnostics.map(d => [`${d.line}:${d.column}:${d.code}:${d.message}`, d])).values()];
	reader.result.dependencies = [...new Map(reader.result.dependencies.map(d => [`${d.line}:${d.column}:${d.target}:${d.specifier}:${d.custom}`, d])).values()];
	return reader.result;
}

/** A module summary is evaluated per runtime; project code is never executed. */
export function inferExport(source: string, index: ProjectIndex, caller: ModuleInfo, context: EvaluationContext): Value {
	const reader = new Reader(tokenize(source), index, caller, context);
	reader.block();
	const values = reader.returns.map(result => result[0] ?? unknown);
	if (!reader.terminated) { values.push(unknown); }
	const result = merge(values.length ? values : [unknown]);
	if (reader.uncertain) {
		const taint = (value: Value): Value => value.kind === 'factory' ? { ...value, unverified: true } : value.kind === 'union' ? { ...value, alternatives: value.alternatives!.map(taint) } : value;
		return taint(result);
	}
	return result;
}
