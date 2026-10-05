// Dependency-free validation for module imports and gallery-page assets.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMPORTS = [
    /(?:^|[\s;])(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g
];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__checks__'].includes(entry.name) || entry.name.startsWith('.')) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file, out);
        else if (entry.name.endsWith('.js')) out.push(file);
    }
    return out;
}

const self = fileURLToPath(import.meta.url);
const build = path.join(ROOT, 'build.js');
const modules = walk(ROOT).filter(file => file !== self && file !== build).sort();
const failures = [];
let checked = 0;
let bare = 0;

for (const file of modules) {
    const source = readFileSync(file, 'utf8');
    for (const regex of IMPORTS) {
        for (const match of source.matchAll(regex)) {
            const specifier = match[1];
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
                bare++;
                continue;
            }
            checked++;
            const resolved = specifier.startsWith('/')
                ? path.join(ROOT, specifier)
                : path.resolve(path.dirname(file), specifier);
            if (!existsSync(resolved) || !statSync(resolved).isFile()) {
                failures.push(`${path.relative(ROOT, file)} -> '${specifier}' (expected ${path.relative(ROOT, resolved)})`);
            }
        }
    }
}

assert.deepStrictEqual(failures, [], failures.join('\n'));

const pages = ['index.html'];
const missing = [];
const escapes = [];
for (const rel of pages) {
    const file = path.join(ROOT, rel);
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
        const specifier = match[1];
        if (specifier.includes('${') || /^(?:[a-z]+:)?\/\//i.test(specifier) || specifier.startsWith('data:')) continue;
        const resolved = path.resolve(path.dirname(file), specifier);
        const relative = path.relative(ROOT, resolved);
        if (relative === '' || relative.startsWith('..')) escapes.push(`${rel} -> '${specifier}'`);
        else if (!existsSync(resolved)) missing.push(`${rel} -> '${specifier}'`);
    }
}

assert.deepStrictEqual(escapes, [], `Gallery page assets escape project root:\n${escapes.join('\n')}`);
assert.deepStrictEqual(missing, [], `Gallery page assets do not exist:\n${missing.join('\n')}`);
console.log(`html-root: ok (${pages.length} gallery pages, assets resolve within project root).`);
console.log(`imports: ok (${checked} relative imports across ${modules.length} modules; ${bare} bare/node imports skipped).`);
