import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_CLASSIFICATIONS } from './routeClassification';

// Parse every `app.<method>('<path>')` registration from the route files so the
// classification map can be enforced against the real, current route surface.
function extractRegisteredRoutes(): Set<string> {
    const routesDir = join(__dirname, 'routes');
    const files = readdirSync(routesDir).filter(
        (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'),
    );
    const routeRe = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
    const routes = new Set<string>();
    for (const file of files) {
        const src = readFileSync(join(routesDir, file), 'utf8');
        let m: RegExpExecArray | null;
        while ((m = routeRe.exec(src)) !== null) {
            routes.add(`${m[1].toUpperCase()} ${m[2]}`);
        }
    }
    return routes;
}

const classifiedKeys = new Set(ROUTE_CLASSIFICATIONS.map((r) => `${r.method} ${r.path}`));

describe('route retry classification is complete and current', () => {
    const registered = extractRegisteredRoutes();

    it('every registered route is classified (no silent default)', () => {
        const unclassified = [...registered].filter((r) => !classifiedKeys.has(r)).sort();
        expect(
            unclassified,
            `These routes are missing from routeClassification.ts — add each with an explicit retry class ('safe' | 'conditional' | 'unsafe'):\n${unclassified.join('\n')}`,
        ).toEqual([]);
    });

    it('no classification entry refers to a route that no longer exists', () => {
        const stale = [...classifiedKeys].filter((r) => !registered.has(r)).sort();
        expect(
            stale,
            `These classification entries no longer match any registered route — remove or fix them:\n${stale.join('\n')}`,
        ).toEqual([]);
    });

    it('has no duplicate classification entries', () => {
        expect(classifiedKeys.size).toBe(ROUTE_CLASSIFICATIONS.length);
    });
});
