import { Templates } from './core/init';
declare const CAPATAZ_TEMPLATES: Record<string, string>;
export function embeddedTemplates(): Templates {
	return {
		read: async relative => { const content = CAPATAZ_TEMPLATES[relative]; if (content === undefined) { throw new Error(`Missing embedded template: ${relative}`); } return content; },
		entries: async relative => Object.keys(CAPATAZ_TEMPLATES).filter(p => p.startsWith(relative + '/') && !p.slice(relative.length + 1).includes('/')).map(p => [p.slice(relative.length + 1), false]),
	};
}
