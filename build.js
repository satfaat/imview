// Bundles modular application source into a local classic script.
// Classic scripts and stylesheets load from file://; ES modules do not.
// Zero dependencies. Deterministic: same sources always yield byte-identical output.
//
// Run: npm run build (from the project root)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)); // imview/
const ENTRY = join(ROOT, 'core', 'app.js');
const STYLES_ID = join(ROOT, 'common', 'lib', 'styles.js');
const INDEX = join(ROOT, 'index.html');
const OUTPUT = join(ROOT, 'core', 'app.bundle.js');

const rel = file => relative(ROOT, file).split('\\').join('/');

// Stylesheets are linked in index.html, so replace the lazy loader with a no-op
// when combining modules into a classic script.
const STYLES_STUB = [
    'const cssUrl = (rel) => rel;',
    'function useStyles() {}',
    'const stylesReady = () => Promise.resolve();',
    ''
].join('\n');

// Split one module into { deps, body }: drop import statements (recording their
// specifiers for the graph walk), strip the `export ` prefix from declarations.
// Anything fancier (export lists, default exports, re-exports, dynamic import)
// is a loud error, not a silent mis-bundle.
function parseModule(file) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const out = [];
    const deps = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*import(?![\w$])/.test(line)) {
            let stmt = line;
            while (
                !/from\s*['"][^'"]+['"]\s*;?\s*$/.test(stmt) &&
                !/^\s*import\s*['"][^'"]+['"]\s*;?\s*$/.test(stmt) &&
                i + 1 < lines.length
            ) {
                stmt += '\n' + lines[++i];
            }
            const m = stmt.match(/from\s*['"]([^'"]+)['"]/) ?? stmt.match(/^\s*import\s*['"]([^'"]+)['"]/);
            if (!m) throw new Error('build: cannot parse import in ' + rel(file) + ': ' + stmt.trim());
            deps.push(m[1]);
            continue;
        }
        if (/^\s*export\s+(const|let|var|function|async\s+function|class)\b/.test(line)) {
            out.push(line.replace(/^\s*export\s+/, match => match.replace('export ', '')));
            continue;
        }
        if (/^\s*export\b/.test(line)) {
            throw new Error('build: unsupported export form in ' + rel(file) + ': ' + line.trim());
        }
        out.push(line);
    }
    let body = out.join('\n');
    if (/(^|[^\w$])import\s*\(/.test(body)) {
        throw new Error('build: dynamic import() in ' + rel(file) + ' — the bundle cannot resolve it');
    }
    // import.meta is a syntax error in a classic script. Every call site passes it
    // to cssUrl(), whose stub ignores its second argument, so any string works.
    body = body.split('import.meta.url').join('"bundle"');
    return { deps, body };
}

const cache = new Map();
function load(file) {
    let m = cache.get(file);
    if (!m) {
        m = parseModule(file);
        cache.set(file, m);
    }
    return m;
}

// Post-order walk from the entry: every dependency is emitted before its user.
// Throws naming the cycle instead of recursing forever or emitting broken order.
const order = [];
const marks = new Map();
function visit(file, stack) {
    const mark = marks.get(file) ?? 0;
    if (mark === 2) return;
    if (mark === 1) {
        throw new Error('build: import cycle: ' + [...stack, file].map(rel).join(' -> '));
    }
    marks.set(file, 1);
    for (const spec of load(file).deps) {
        if (!spec.startsWith('.')) throw new Error('build: non-relative import ' + JSON.stringify(spec) + ' in ' + rel(file));
        visit(resolve(dirname(file), spec), [...stack, file]);
    }
    marks.set(file, 2);
    order.push(file);
}
visit(ENTRY, []);

// Modules are emitted dependency-first. app.js uses top-level await, so wrap the
// generated app in an async function to make it valid as a classic script.
const chunks = [];
for (const file of order) {
    if (file === STYLES_ID) {
        chunks.push('/* ==== common/lib/styles.js (build stub: CSS is inlined above) ==== */', STYLES_STUB.replace(/\s+$/, ''));
        continue;
    }
    let body = load(file).body.replace(/\s+$/, '');
    if (file === ENTRY) {
        body = '(async () => {\n' + body + '\n})();';
    }
    chunks.push('/* ==== ' + rel(file) + ' ==== */', body);
}
const scriptBlock = chunks.join('\n\n');

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, scriptBlock.replace(/\s+$/, '') + '\n');
console.log('build: ok (' + order.length + ' modules -> ' + rel(OUTPUT) + ')');
