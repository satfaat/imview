// node __checks__/css.check.js — keeps the stylesheet architecture honest.
//  1. every rule of a shared/domain stylesheet sits inside a cascade @layer
//  2. a simple top-level class is defined in exactly one stylesheet (no duplicates)
//  3. no hard-coded hex colours outside tokens.css and skin stylesheets (use tokens)
//  4. the stylesheet is syntactically survivable: /* */ comments only, balanced braces
//
// Rule 4 exists because it shipped once. The split stylesheets were commented with
// `//`, which is JavaScript, not CSS. The parser treats each `//` line as an invalid
// at-rule and swallows the block that follows it, so every rule that had a comment
// above it disappeared — the page rendered completely unstyled. Rules 1-3 all passed,
// because none of them looks at syntax. Only a real CSS parser would catch this
// class properly; this rule catches the specific, common case of JS-style comments.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = d => readdirSync(d).flatMap(n => (['__checks__', 'node_modules'].includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(root).filter(f => f.endsWith('.css')).map(f => ({ rel: relative(root, f), src: readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

if (files.length === 0) {
    console.log('css: note (no stylesheets found)');
    process.exit(0);
}

const problems = [];

const isSkin = rel => rel.includes('/skins/');
const defs = new Map();
for (const { rel, src } of files) {
    if (!isSkin(rel) && rel !== 'shell/shell.css' && !/@layer\s+[\w, ]+[{;]/.test(src)) problems.push(`${rel}: no @layer`);
    for (const m of src.matchAll(/^\s{4}\.([a-z][\w-]*)\s*\{/gm)) {          // top-level (layer-depth) simple class rule
        (defs.get(m[1]) ?? defs.set(m[1], new Set()).get(m[1])).add(rel);
    }
    if (rel !== 'common/styles/tokens.css' && !isSkin(rel)) {
        const hex = src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)?.filter(h => !['#fff', '#fff8ee', '#2b1d3f'].includes(h.toLowerCase()));
        if (hex?.length) problems.push(`${rel}: hard-coded colour ${[...new Set(hex)].join(', ')}`);
    }
    // Rule 4: a JS-style comment is not a comment in CSS — it eats the next block.
    // Only line-leading `//` counts, so `https://` in a url() or a value is safe.
    for (const [n, line] of readFileSync(join(root, rel), 'utf8').split('\n').entries()) {
        if (/^\s*\/\//.test(line)) problems.push(`${rel}:${n + 1}: JS-style // comment (invalid CSS, hides the next rule)`);
    }
    const braces = src.split('{').length - src.split('}').length;           // src has comments stripped
    if (braces !== 0) problems.push(`${rel}: unbalanced braces (${braces > 0 ? 'missing ' + braces + ' }' : 'extra ' + -braces + ' }'})`);
}
for (const [cls, where] of defs) if (where.size > 1) problems.push(`.${cls} defined in ${[...where].join(' and ')}`);

const baseStyles = files.find(f => f.rel === 'common/styles/base.css')?.src ?? '';
if (!/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/.test(baseStyles)) {
    problems.push('common/styles/base.css: custom elements must respect the hidden attribute');
}
const cardStyles = files.find(f => f.rel === 'domains/media/media-card.css')?.src ?? '';
if (/\.card\.blurred:hover\s+(?:img|video)/.test(cardStyles)) {
    problems.push('domains/media/media-card.css: blurred thumbnails must not reveal on hover');
}

assert.deepEqual(problems, [], '\n' + problems.join('\n'));
console.log(`css: ok (${files.length} stylesheets)`);
