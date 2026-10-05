// Check for the hotkey router: real KeyboardEvent-style stubs driven through the
// window listener captured around installShortcuts, with fake controller/viewer/help
// facades recording calls. window.addEventListener is a no-op in the shim, so the
// listener is captured by temporarily swapping it (shim file itself untouched).
import './_shim.js';
import assert from 'node:assert/strict';
import { installShortcuts } from '../core/shortcuts.js';

let assertions = 0;
function ok(v, msg) {
    assertions++;
    assert.ok(v, msg);
}
function eq(a, b, msg) {
    assertions++;
    assert.strictEqual(a, b, msg);
}

const realAdd = globalThis.addEventListener;
const realRemove = globalThis.removeEventListener;
const captured = new Map();
globalThis.addEventListener = (type, fn) => {
    if (!captured.has(type)) captured.set(type, new Set());
    captured.get(type).add(fn);
};
globalThis.removeEventListener = (type, fn) => {
    captured.get(type)?.delete(fn);
};

function fakes(active) {
    const calls = [];
    const controller = {
        filtered: [{ name: 'a/photo.jpg' }],
        togglePrivacy: () => { calls.push(['togglePrivacy']); },
        toggleSensitive: item => { calls.push(['toggleSensitive', item]); },
        toggleFavorite: item => { calls.push(['toggleFavorite', item]); },
        downloadCurrent: item => { calls.push(['downloadCurrent', item]); },
        setZoom: z => { calls.push(['setZoom', z]); },
        step: dir => { calls.push(['step', dir]); },
        closeLightbox: () => { calls.push(['closeLightbox']); }
    };
    const viewer = {
        active,
        zoom: 1,
        toggleSlideshow: () => { calls.push(['toggleSlideshow']); },
        toggleInfo: () => { calls.push(['toggleInfo']); },
        rotate: () => { calls.push(['rotate']); }
    };
    const help = {
        isOpen: false,
        opened: 0,
        closed: 0,
        open() { this.opened++; this.isOpen = true; },
        close() { this.closed++; this.isOpen = false; }
    };
    const header = { focuses: 0, focusSearch() { this.focuses++; } };
    return { calls, controller, viewer, help, header };
}

function fire(key, tagName = 'DIV', modifiers = {}) {
    const listeners = [...(captured.get('keydown') ?? [])];
    let prevented = false;
    const e = {
        key,
        target: { tagName },
        ...modifiers,
        preventDefault: () => { prevented = true; }
    };
    for (const fn of listeners) fn(e);
    return { count: listeners.length, prevented };
}

// Search shortcut works even while a text field has focus.
{
    captured.clear();
    const f = fakes(null);
    installShortcuts({ controller: f.controller, viewer: f.viewer, help: f.help, header: f.header });
    const result = fire('k', 'INPUT', { metaKey: true });
    eq(f.header.focuses, 1, 'Cmd+K focuses search');
    ok(result.prevented, 'Cmd+K prevents browser search shortcut');
}

const IMG = { name: 'a/photo.jpg', url: 'blob:a', type: 'image', size: 100 };
const VID = { name: 'b/clip.mp4', url: 'blob:b', type: 'video', size: 500 };

// INPUT and TEXTAREA targets are ignored.
{
    captured.clear();
    const f = fakes(null);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    eq(captured.get('keydown')?.size, 1, 'one keydown listener installed');
    fire('b', 'INPUT');
    fire('b', 'TEXTAREA');
    eq(f.calls.length, 0, 'typing targets ignored');
}

// Help modal + Escape closes it and short-circuits the privacy toggle.
{
    captured.clear();
    const f = fakes(null);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    f.help.isOpen = true;
    fire('Escape');
    eq(f.help.closed, 1, 'Escape closes help');
    eq(f.calls.length, 0, 'help Escape short-circuits privacy');
    f.help.isOpen = false;
    fire('Escape');
    eq(f.help.closed, 1, 'closed help stays shut');
    eq(f.calls.length, 0, 'Escape with no lightbox does nothing');
}

// b toggles privacy with the lightbox closed and open; case-insensitive.
{
    captured.clear();
    const f = fakes(null);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    fire('b');
    fire('B');
    eq(f.calls.filter(c => c[0] === 'togglePrivacy').length, 2, 'b toggles while closed');
    const g = fakes(IMG);
    captured.clear();
    installShortcuts({ controller: g.controller, viewer: g.viewer, lightbox: null, help: g.help });
    fire('b');
    eq(g.calls[0][0], 'togglePrivacy', 'b toggles while open');
    eq(g.calls.length, 1, 'b does nothing else while open');
}

// Lightbox keys map to the right calls.
{
    captured.clear();
    const f = fakes(IMG);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    fire('Escape');
    eq(f.calls[0][0], 'closeLightbox', 'Escape closes');
    fire('ArrowRight');
    eq(f.calls[1][0], 'step', 'ArrowRight steps');
    eq(f.calls[1][1], 1, 'ArrowRight steps forward');
    fire('ArrowLeft');
    eq(f.calls[2][1], -1, 'ArrowLeft steps back');
    fire('n');
    eq(f.calls[3][0], 'toggleSensitive', 'n tags sensitive');
    ok(f.calls[3][1] === IMG, 'n passes the active item');
    eq(f.calls[3][1].name, 'a/photo.jpg', 'n keys by name');
    fire('N');
    eq(f.calls[4][0], 'toggleSensitive', 'N works via toLowerCase');
    fire('f');
    eq(f.calls[5][0], 'toggleFavorite', 'f favorites');
    ok(f.calls[5][1] === IMG, 'f passes the active item');
    eq(f.calls[5][1].name, 'a/photo.jpg', 'f keys by name');
    fire('i');
    eq(f.calls[6][0], 'toggleInfo', 'i toggles info');
    fire('d');
    eq(f.calls[7][0], 'downloadCurrent', 'd downloads');
    ok(f.calls[7][1] === IMG, 'd downloads the active item');
}

// Image-only keys apply to images and are ignored for video.
{
    captured.clear();
    const f = fakes(IMG);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    const space = fire(' ');
    eq(f.calls[0][0], 'toggleSlideshow', 'space toggles slideshow on images');
    ok(space.prevented, 'space preventDefaults on images');
    fire('z');
    eq(f.calls[1][0], 'setZoom', 'z zooms on images');
    eq(f.calls[1][1], 2, 'z toggles 1 to 2');
    f.viewer.zoom = 2;
    fire('z');
    eq(f.calls[2][1], 1, 'z toggles 2 to 1');
    fire('r');
    eq(f.calls[3][0], 'rotate', 'r rotates on images');
}
{
    captured.clear();
    const f = fakes(VID);
    installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    const space = fire(' ');
    eq(f.calls.length, 0, 'space ignored for video');
    ok(!space.prevented, 'space does not preventDefault for video');
    fire('z');
    fire('r');
    eq(f.calls.length, 0, 'z/r ignored for video');
}

// installShortcuts returns a working cleanup.
{
    captured.clear();
    const f = fakes(null);
    const cleanup = installShortcuts({ controller: f.controller, viewer: f.viewer, lightbox: null, help: f.help });
    eq(typeof cleanup, 'function', 'returns a cleanup function');
    fire('b');
    eq(f.calls.length, 1, 'listener live before cleanup');
    cleanup();
    eq(captured.get('keydown')?.size ?? 0, 0, 'cleanup removes the listener');
    fire('b');
    eq(f.calls.length, 1, 'no calls after cleanup');
}

globalThis.addEventListener = realAdd;
globalThis.removeEventListener = realRemove;

console.log('shortcuts: ok (' + assertions + ' assertions)');
