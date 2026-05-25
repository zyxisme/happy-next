import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map<string, string>();

function loadFile(file: string): string {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    const content = readFileSync(join(process.cwd(), file), 'utf8');
    cache.set(file, content);
    return content;
}

/** Load a prompt template and substitute `{{var}}` placeholders. */
export function renderPrompt(file: string, vars: Record<string, string>): string {
    let content = loadFile(file);
    for (const [key, value] of Object.entries(vars)) {
        content = content.split(`{{${key}}}`).join(value ?? '');
    }
    return content;
}
