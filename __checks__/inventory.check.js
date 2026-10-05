// Structural check: pin the modular gallery's user-facing features and standalone entry.
import './_shim.js';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let features = 0;
function has(src, needle, msg) {
    features++;
    assert.ok(src.includes(needle), msg ?? ('missing: ' + needle));
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(root, rel), 'utf8');
const index = read('index.html');
const bundle = read('core/app.bundle.js');
const app = read('core/app.js');
const header = read('domains/media/GalleryHeader.js');
const batch = read('domains/media/BatchBar.js');
const store = read('domains/media/MediaStore.js');
const viewer = read('domains/viewer/viewerState.js');
const card = read('domains/media/MediaCard.js');
const preview = read('domains/media/media-preview.js');
const actions = read('domains/media/MediaActions.js');
const collection = read('domains/media/MediaCollection.js');
const lightbox = read('domains/viewer/MediaLightbox.js');

// All supported navigation and media shortcuts remain documented.
for (const key of ['⌘', 'Ctrl', '←', '→', 'B', 'N', 'Space', 'Z', 'R', 'F', 'I', 'D', 'Esc']) {
    has(index, '<span class="kbd">' + key + '</span>', 'help lost key ' + key);
}

// All 5 filter labels, 3 view labels, 5 sort labels.
for (const label of ['All', 'Images', 'Videos', '★ Favs', '18+ Sensitive']) has(header, label, 'filter label: ' + label);
for (const label of ['Grid', 'Masonry', 'List']) has(header, label, 'view label: ' + label);
for (const label of ['Name A–Z', 'Name Z–A', 'Size ↓', 'Size ↑', 'Type']) has(header, label, 'sort label: ' + label);
has(header, "['nsfw', '18+']", 'sensitive filter uses a compact label');
has(header, 'data-search-toggle', 'search has a collapsible icon control');
has(header, 'aria-expanded', 'search toggle exposes expanded state');
has(header, '.#openSearch()', 'keyboard shortcut can open search');

// The 3 privacy labels and the 3 storage keys.
for (const label of ['🛡️ Blur: All', '🛡️ Blur: 18+', '👁️ Blur: Off']) has(store, label, 'privacy label: ' + label);
for (const k of ['bm_gallery_favorites', 'bm_gallery_nsfw', 'bm_gallery_privacyMode']) has(store, k, 'storage key: ' + k);

// Zoom slider bounds, batch-bar 5 actions, info-drawer 5 rows.
for (const bound of ['min="160"', 'max="360"', 'step="20"']) has(header, bound, 'slider bound: ' + bound);
has(header, 'data-size-toggle', 'grid size has a visible Size control');
has(header, 'aria-controls="grid-size-control"', 'Size control identifies its slider');
has(header, '#toggleSize()', 'Size control can pin its slider open');
has(read('domains/media/gallery-header.css'), '.size-control:hover input[type=range]', 'grid slider expands on hover');
for (const label of ['Select All', 'Download Selected', 'Star Selected', 'Tag 18+ Sensitive', 'Clear']) has(batch, label, 'batch action: ' + label);
for (const label of ['File Name', 'Media Type', '18+ Sensitive', 'File Size', 'Blob URL']) has(viewer, label, 'info row: ' + label);

// Help modal is wired: dialog present and opened from the event bus.
has(index, '<ui-dialog id="help"', 'help dialog element');
has(app, 'HELP_TOGGLED', 'help bus wiring');
has(app, 'installShortcuts', 'shortcuts installed');

// The readable entry links local styles and classic scripts. The generated
// classic bundle avoids the module CORS restriction for file://.
{
    const moduleScripts = index.match(/<script\b[^>]*type="module"/g) ?? [];
    features++;
    assert.strictEqual(moduleScripts.length, 0, 'index.html must not load ES modules from file://');
    const scripts = index.match(/<script\b[^>]*\bsrc=/g) ?? [];
    features++;
    assert.strictEqual(scripts.length, 2, 'index.html should load the player and app as local classic scripts');
    features++;
    has(index, '<script src="core/app.bundle.js"></script>', 'source page loads the generated classic bundle');
    has(index, '<link rel="stylesheet" href="common/styles/tokens.css">', 'source page loads design tokens');
    has(bundle, "define('gallery-grid'", 'generated bundle registers app components');
    for (const gone of ['location.protocol', 'Serve this gallery over HTTP', './serve.sh', 'src/index.html', 'dist.html', 'offline.html', '<!-- build:']) {
        features++;
        assert.ok(!index.includes(gone), 'obsolete output-path remnant still in index.html: ' + gone);
    }
}

// No Alpine reference survives in modular first-party app code. The shared
// player is vendored third-party code and remains out of scope.
{
    const hits = [];
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => {
        const full = join(d, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
    for (const dir of ['core', 'common', 'domains']) for (const f of walk(join(root, dir))) {
        if (f.endsWith('/common/elements/bm-player.js')) continue;
        if (!/\.(js|html|css)$/.test(f)) continue;
        const src = readFileSync(f, 'utf8');
        for (const needle of ['x-data', 'x-show', 'x-for', 'x-model', 'Alpine', 'alpinejs']) {
            if (src.includes(needle)) hits.push(f.replace(root + '/', '') + ': ' + needle);
        }
    }
    features++;
    assert.deepStrictEqual(hits, [], 'Alpine remnants:\n' + hits.join('\n'));
}

// Video split: cards render light metadata-only thumbs; the lightbox has the player.
{
    features++;
    assert.ok(!card.includes('bm-player'), 'MediaCard.js must not reference bm-player');
    has(preview, '<video src=', 'shared video preview');
    has(preview, 'preload="metadata"', 'shared video metadata preload');
    has(lightbox, '<bm-player', 'lightbox keeps the full player');
}

    has(lightbox, 'data-title', 'lightbox title can be renamed for the session');
    has(lightbox, "event.ctrlKey", 'trackpad pinch zoom intercepts browser page zoom');
    has(lightbox, "this.emit('lightbox-zoom'", 'trackpad zoom routes through viewer state');
    has(lightbox, 'requestAnimationFrame', 'trackpad zoom previews without rerendering every wheel tick');
    has(lightbox, 'event.metaKey', 'trackpad zoom also handles Meta-modified gestures');
    has(lightbox, 'gesturechange', 'Safari gesture zoom is handled');
    has(lightbox, '#setZoomOrigin(event)', 'zoom anchors to the trackpad gesture position');
    has(lightbox, 'image.naturalWidth === 0', 'zoom safely handles unloaded images');
    has(lightbox, 'Math.exp(-this.#zoomDelta * 0.002)', 'trackpad zoom uses a gentler nonlinear scale');
    has(lightbox, 'data-act="step-prev"', 'lightbox has previous navigation control');
    has(lightbox, 'data-act="step-next"', 'lightbox has next navigation control');
    has(lightbox, 'data-act="download"', 'lightbox download action remains available');
    const lightboxCss = read('domains/viewer/media-lightbox.css');
    has(lightbox, 'filmstrip-toggle', 'filmstrip can be pinned open on touch');
    has(lightboxCss, '.filmstrip-trigger:hover::after', 'filmstrip has a small hover handle');
    has(lightboxCss, '.lightbox:has(.filmstrip-trigger:hover) .filmstrip', 'filmstrip appears from its bottom hover handle');
    features++;
    assert.ok(!lightboxCss.includes('.lightbox:hover .filmstrip,'), 'filmstrip should not open whenever the pointer is anywhere in the lightbox');
    has(lightboxCss, '.film-thumb:hover', 'filmstrip thumbnails magnify on hover');
    has(lightboxCss, 'transform-origin: center bottom;', 'filmstrip thumbnails magnify upward from the dock baseline');
    has(lightboxCss, 'width: 100%;\n        height: 100%;', 'media fills the viewer stage');
    has(lightboxCss, '.lb-nav-stack', 'navigation controls are stacked');
    has(lightboxCss, 'background: transparent;\n        opacity: 0;', 'top bar rests transparent over the image');
    has(lightboxCss, '.lb-header:hover', 'top bar appears when hovered');
    has(lightbox, 'toolbar-toggle', 'top bar can be toggled on touch devices');

    has(actions, "define('media-actions'", 'grid and list share the media actions component');
has(collection, 'replaceChildren(...cards)', 'grid and masonry share a collection renderer');
has(read('common/styles/utilities.css'), '.stack', 'shared layout utilities');
has(read('common/styles/components.css'), '--tone-bg:', 'semantic CSS tone derivation');

console.log('inventory: ok (' + features + ' features)');
