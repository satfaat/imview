// Bundle check: index.html stays readable and uses file://-safe classic scripts.
import './_shim.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

let assertions = 0;
function ok(value, message) {
    assertions++;
    assert.ok(value, message);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'index.html');
const bundlePath = join(root, 'core', 'app.bundle.js');
const sourceBefore = readFileSync(indexPath, 'utf8');

execFileSync(process.execPath, ['build.js'], { cwd: root, stdio: 'pipe' });
const bundle = readFileSync(bundlePath, 'utf8');
execFileSync(process.execPath, ['build.js'], { cwd: root, stdio: 'pipe' });
assertions++;
assert.strictEqual(readFileSync(bundlePath, 'utf8'), bundle, 'build.js is not deterministic');
assertions++;
assert.strictEqual(readFileSync(indexPath, 'utf8'), sourceBefore, 'build.js rewrote index.html');

const index = sourceBefore;
const vendor = readFileSync(join(root, 'common', 'elements', 'bm-player.js'), 'utf8');
const page = index + vendor + bundle;

ok(index.split('\n').length < 100, 'index.html should remain short and readable');
ok(index.includes('<script src="core/app.bundle.js"></script>'), 'index.html does not load the generated app bundle');
ok(!index.includes('type="module"'), 'index.html must not load ES modules from file://');
ok((index.match(/<script\b[^>]*\bsrc=/g) ?? []).length === 2, 'expected local classic scripts for player and app');
ok((index.match(/<link\b[^>]*rel="stylesheet"/g) ?? []).length > 0, 'index.html must link local stylesheets');
ok(!existsSync(join(root, 'offline.html')), 'obsolete offline.html must not exist');
ok(!existsSync(join(root, 'dist.html')), 'obsolete dist.html must not exist');
ok(!existsSync(join(root, 'src')), 'redundant src directory is removed');
ok(!existsSync(join(root, 'gallery')), 'obsolete nested gallery directory is removed');
ok(!existsSync(join(root, 'gallery-3.html')), 'obsolete monolithic gallery is removed');

for (const match of index.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/gs)) {
    assertions++;
    assert.ok(!/^(?:https?:)?\/\//.test(match[2]), 'index.html references a remote asset: ' + match[2]);
}
ok(!/@import/i.test(index), 'index.html contains CSS @import');
ok(!/https?:\/\//.test(index), 'index.html contains remote origins');
ok(!/(?:^|\n)\s*(?:import|export)\b/.test(bundle), 'classic bundle contains module syntax');
ok(!bundle.includes('import.meta'), 'classic bundle contains import.meta');
ok(!/[^\w$]import\s*\(/.test(bundle), 'classic bundle contains dynamic import()');
assertions++;
assert.doesNotThrow(() => new vm.Script(bundle), 'generated app bundle does not parse as a classic script');

// All gallery elements are present in page markup or templates and registered.
for (const tag of ['gallery-header', 'empty-state', 'batch-bar', 'gallery-grid', 'gallery-masonry', 'gallery-list', 'media-card', 'media-lightbox', 'ui-dialog']) {
    ok(page.includes(tag), 'gallery lost tag ' + tag);
    ok(bundle.includes(`define('${tag}',`), 'bundle never defines ' + tag);
}
ok(page.includes('<bm-player') || bundle.includes('<bm-player'), 'gallery lost <bm-player>');
ok(vendor.includes("customElements.define('bm-player'"), 'shared player is not registered');

// The bundle must introduce no top-level name collisions.
{
    const seen = new Set();
    for (const match of bundle.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        assertions++;
        assert.ok(!seen.has(match[1]), 'duplicate top-level declaration: ' + match[1]);
        seen.add(match[1]);
    }
    ok(seen.size > 50, 'bundle looks incomplete: only ' + seen.size + ' declarations');
}

// Every application source line survives bundling except import/export syntax
// and import.meta URLs, which the build must remove for classic-script loading.
{
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? (entry.name === '__checks__' ? [] : walk(path)) : [path];
    });
    const stubbed = join(root, 'common', 'lib', 'styles.js');
    const sources = ['core', 'common', 'domains']
        .flatMap(dir => walk(join(root, dir)))
        .filter(path => path.endsWith('.js') && path !== stubbed && !path.endsWith('/bm-player.js'));
    let checked = 0;
    for (const file of sources) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const text = line.trim();
            if (text.length < 30 || /^(import|export)\b/.test(text) || text.includes('import.meta.url') || !/[;{}]$/.test(text)) continue;
            assertions++;
            assert.ok(bundle.includes(text), `bundle rewrote or dropped source line from ${file.slice(root.length + 1)}: ${text.slice(0, 90)}`);
            checked++;
        }
    }
    ok(checked > 300, 'bundle fidelity check was too small: ' + checked);
}

ok(!existsSync(join(root, 'serve.sh')), 'unexpected server script');
console.log(`bundle: ok (${assertions} assertions)`);
