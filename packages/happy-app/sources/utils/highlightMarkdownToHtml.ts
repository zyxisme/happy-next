import { parser as markdownParser } from '@lezer/markdown';
import { highlightCode, classHighlighter } from '@lezer/highlight';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const HTML_ESCAPE_RE = /[&<>]/g;

function escapeHtml(s: string): string {
    return s.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c]);
}

export function highlightMarkdownToHtml(text: string): string {
    const tree = markdownParser.parse(text);
    const out: string[] = [];
    highlightCode(
        text,
        tree,
        classHighlighter,
        (chunk, classes) => {
            const safe = escapeHtml(chunk);
            out.push(classes ? `<span class="${classes}">${safe}</span>` : safe);
        },
        () => { out.push('\n'); }
    );
    return out.join('');
}
