export interface Token { text: string; kind: 'word' | 'string' | 'symbol' | 'comment'; start: number; end: number; line: number; column: number; endLine: number; endColumn: number }

/** Luau lexer: comments and quoted/long strings never become executable tokens. */
export function tokenize(source: string, comments?: Token[]): Token[] {
	const tokens: Token[] = [];
	let i = 0, line = 1, column = 1;
	const advance = (end: number) => { while (i < end) { if (source[i++] === '\n') { line++; column = 1; } else { column++; } } };
	const long = (start: number) => /^\[(=*)\[/.exec(source.slice(start));
	while (i < source.length) {
		if (/\s/.test(source[i])) { advance(i + 1); continue; }
		if (source.startsWith('--', i)) {
			const match = long(i + 2);
			if (match) { const close = `]${match[1]}]`; const end = source.indexOf(close, i + 2 + match[0].length); advance(end < 0 ? source.length : end + close.length); }
			else {
				const start = i, tokenLine = line, tokenColumn = column;
				const end = source.indexOf('\n', i);
				const finish = end < 0 ? source.length : end;
				comments?.push({ text: source.slice(start, finish), kind: 'comment', start, end: finish, line: tokenLine, column: tokenColumn, endLine: line, endColumn: column + finish - start });
				advance(finish);
			}
			continue;
		}
		const start = i, tokenLine = line, tokenColumn = column;
		let text: string, kind: Token['kind'] = 'symbol', end: number;
		const match = long(i);
		if (match) {
			const close = `]${match[1]}]`; const finish = source.indexOf(close, i + match[0].length);
			end = finish < 0 ? source.length : finish + close.length;
			text = source.slice(i + match[0].length, finish < 0 ? source.length : finish).replace(/^\r?\n/, ''); kind = 'string';
		} else if (source[i] === '"' || source[i] === "'") {
			const quote = source[i]; end = i + 1; text = ''; kind = 'string';
			while (end < source.length && source[end] !== quote) {
				if (source[end] === '\\') {
					end++;
					const escaped = source[end++];
					if (escaped === 'z') { while (/\s/.test(source[end] ?? '') && end < source.length) { end++; } }
					else if (/[0-9]/.test(escaped ?? '')) { const digits = (escaped + source.slice(end)).match(/^\d{1,3}/)![0]; text += String.fromCharCode(Number(digits)); end += digits.length - 1; }
					else if (escaped === 'x') { text += String.fromCharCode(parseInt(source.slice(end, end + 2), 16)); end += 2; }
					else { text += ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[escaped] ?? escaped ?? ''; }
				} else { text += source[end++]; }
			}
			if (end < source.length) { end++; }
		} else if (source[i] === '`') {
			// Interpolation is deliberately unknown, never a statically resolved path.
			end = i + 1; while (end < source.length && source[end] !== '`') { if (source[end] === '\\') { end++; } end++; } end = Math.min(source.length, end + 1); text = '<interpolated>';
		} else {
			const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
			const symbol = /^(\.\.\.|\.\.|::|==|~=|<=|>=|\+=|-=|\*=|\/=|->|\/\/)/.exec(source.slice(i));
			text = word?.[0] ?? symbol?.[0] ?? source[i]; end = i + text.length; kind = word ? 'word' : 'symbol';
		}
		advance(end); tokens.push({ text, kind, start, end, line: tokenLine, column: tokenColumn, endLine: line, endColumn: column });
	}
	return tokens;
}
