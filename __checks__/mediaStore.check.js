import './_shim.js';
import assert from 'node:assert/strict';
import { MediaStore, MEDIA_EXT, VIDEO_EXT, formatBytes } from '../domains/media/MediaStore.js';
import { tiltMath, tiltStyle, sheenStyle } from '../domains/media/MediaCard.js';
import { downloadName, downloadDelay, DOWNLOAD_STAGGER_MS } from '../domains/media/GalleryController.js';

let assertions = 0;
function eq(actual, expected, message) {
    assertions++;
    assert.strictEqual(actual, expected, message);
}
function deep(actual, expected, message) {
    assertions++;
    assert.deepStrictEqual(actual, expected, message);
}
function ok(value, message) {
    assertions++;
    assert.ok(value, message);
}
function resetEnv() {
    globalThis.localStorage.reset();
    globalThis.__objectUrls.reset();
}
function fixtures() {
    return [
        { name: 'a/photo.jpg', type: 'image', url: 'blob:a', size: 100 },
        { name: 'b/clip.mp4', type: 'video', url: 'blob:b', size: 500 },
        { name: 'c/photo.png', type: 'image', url: 'blob:c', size: 300 },
        { name: 'd/movie.webm', type: 'video', url: 'blob:d', size: 200 }
    ];
}

for (const name of ['a.jpg', 'f.MOV', 'd.ogg']) ok(MEDIA_EXT.test(name), `${name} is media`);
for (const name of ['b.txt', 'c.json']) eq(MEDIA_EXT.test(name), false, `${name} is not media`);
for (const name of ['e.mp4', 'd.ogg', 'h.m4v']) ok(VIDEO_EXT.test(name), `${name} is video`);
eq(VIDEO_EXT.test('a.jpg'), false);
deep([0, null, 1, 1024, 1536, 1048576, 1234567].map(formatBytes),
    ['—', '—', '1 B', '1 KB', '1.5 KB', '1 MB', '1.2 MB']);

{
    const store = new MediaStore();
    store.items = fixtures();
    const names = () => store.filtered.map(item => item.name);
    deep(names(), ['a/photo.jpg', 'b/clip.mp4', 'c/photo.png', 'd/movie.webm']);
    store.setFilter('image');
    deep(names(), ['a/photo.jpg', 'c/photo.png']);
    store.setFilter('video');
    deep(names(), ['b/clip.mp4', 'd/movie.webm']);
    store.favorites.add('a/photo.jpg');
    store.favorites.add('b/clip.mp4');
    store.setFilter('favorite');
    deep(names(), ['a/photo.jpg', 'b/clip.mp4']);
    store.sensitiveItems.add('c/photo.png');
    store.setFilter('nsfw');
    deep(names(), ['c/photo.png']);
    store.setFilter('all');
    store.setQuery('PHOTO');
    deep(names(), ['a/photo.jpg', 'c/photo.png']);
    store.setQuery('  clip  ');
    deep(names(), []);
    store.setQuery('');
    store.setSort('name-desc');
    deep(names(), ['d/movie.webm', 'c/photo.png', 'b/clip.mp4', 'a/photo.jpg']);
    store.setSort('size-desc');
    deep(names(), ['b/clip.mp4', 'c/photo.png', 'd/movie.webm', 'a/photo.jpg']);
    store.setSort('size-asc');
    deep(names(), ['a/photo.jpg', 'd/movie.webm', 'c/photo.png', 'b/clip.mp4']);
    store.setSort('type');
    deep(names(), ['a/photo.jpg', 'c/photo.png', 'b/clip.mp4', 'd/movie.webm']);
    const original = store.items.map(item => item.name);
    const result = store.filtered;
    ok(result !== store.filtered, 'filtered returns a fresh array');
    result.reverse();
    deep(store.items.map(item => item.name), original, 'sorting does not mutate items');
}

{
    resetEnv();
    const store = new MediaStore();
    const item = { name: 'a/b/photo.jpg', url: 'blob:x' };
    store.toggleFavorite(item);
    store.toggleSensitive(item);
    deep(JSON.parse(localStorage.getItem('bm_gallery_favorites')), [item.name]);
    deep(JSON.parse(localStorage.getItem('bm_gallery_nsfw')), [item.name]);
    eq(store.isFavorite(item), true);
    eq(store.isSensitive(item), true);
    eq(store.isFavorite(null), null);
    eq(store.isSensitive(null), null);
    store.toggleFavorite(item);
    store.toggleSensitive(item);
    eq(store.isFavorite(item), false);
    eq(store.isSensitive(item), false);
    localStorage.setItem('bm_gallery_favorites', JSON.stringify(['a/photo.jpg']));
    localStorage.setItem('bm_gallery_nsfw', JSON.stringify(['b/clip.mp4']));
    localStorage.setItem('bm_gallery_privacyMode', 'all');
    store.hydrate();
    ok(store.favorites.has('a/photo.jpg'));
    ok(store.sensitiveItems.has('b/clip.mp4'));
    eq(store.privacyMode, 'all');
    localStorage.setItem('bm_gallery_favorites', '{bad json');
    store.hydrate();
    eq(store.privacyMode, 'all', 'malformed saved arrays do not break hydration');
}

{
    resetEnv();
    const store = new MediaStore();
    const item = { name: 'sensitive.jpg', url: 'blob:sensitive' };
    eq(store.isBlurred(item), false);
    store.toggleSensitive(item);
    eq(store.isBlurred(item), true);
    store.reveal(item);
    eq(store.isBlurred(item), false);
    eq(store.isRevealed(item), true);
    store.unrevealAll();
    eq(store.isBlurred(item), true);
    store.togglePrivacy();
    eq(store.privacyMode, 'all');
    eq(store.isBlurred(item), true);
    const ordinary = { name: 'ordinary.jpg', url: 'blob:ordinary' };
    eq(store.isBlurred(ordinary), true);
    store.togglePrivacy();
    eq(store.privacyMode, 'off');
    eq(store.isBlurred(ordinary), false);
    store.togglePrivacy();
    eq(store.privacyMode, 'sensitive');
    deep([
        store.privacyLabel,
        store.privacyTitle
    ], [
        '🛡️ Blur: 18+',
        'Blur 18+ Sensitive media only (Click to cycle)'
    ]);
    eq(localStorage.getItem('bm_gallery_privacyMode'), 'sensitive');
    eq(store.isBlurred(null), false);
}

{
    resetEnv();
    const store = new MediaStore();
    store.items = [{ name: 'old.jpg', type: 'image', url: 'blob:old', size: 1 }];
    store.selected.add('blob:old');
    const files = [
        { name: 'a.jpg', webkitRelativePath: '', size: 10 },
        { name: 'b.txt', webkitRelativePath: '', size: 20 },
        { name: 'd.ogg', webkitRelativePath: 'lib/d.ogg', size: 40 },
        { name: 'f.MOV', webkitRelativePath: '', size: 60 },
        { name: 'g.webp', webkitRelativePath: 'lib/g.webp', size: 70 }
    ];
    const states = [];
    const create = URL.createObjectURL;
    URL.createObjectURL = file => {
        states.push(store.loading);
        return create(file);
    };
    try { store.setFiles(files); } finally { URL.createObjectURL = create; }
    deep(store.items.map(item => [item.name, item.type, item.size]), [
        ['a.jpg', 'image', 10], ['lib/d.ogg', 'video', 40],
        ['f.MOV', 'video', 60], ['lib/g.webp', 'image', 70]
    ]);
    ok(states.length > 0 && states.every(Boolean), 'loading remains true while creating URLs');
    eq(store.loading, false);
    eq(store.selected.size, 0);
    ok(globalThis.__objectUrls.revoked.includes('blob:old'), 'replacing files revokes previous URLs');
    const urls = store.items.map(item => item.url);
    store.dispose();
    for (const url of urls) ok(globalThis.__objectUrls.revoked.includes(url), 'dispose revokes media URL');
    store.items = [
        { name: 'a.jpg', type: 'image', url: 'blob:a', size: 100 },
        { name: 'b.jpg', type: 'image', url: 'blob:b' }
    ];
    eq(store.totalSize, 100);
    eq(store.totalSizeFormatted, '100 B');
    store.items = [];
    eq(store.totalSizeFormatted, '—');
}

{
    const store = new MediaStore();
    store.items = fixtures();
    store.setFilter('image');
    store.selectAllFiltered();
    deep([...store.selected].sort(), ['blob:a', 'blob:c']);
    store.starSelected();
    ok(store.favorites.has('a/photo.jpg'));
    ok(!store.favorites.has('b/clip.mp4'));
    store.tagSelectedSensitive();
    ok(store.sensitiveItems.has('a/photo.jpg'));
    ok(!store.sensitiveItems.has('b/clip.mp4'));
    store.clearSelection();
    eq(store.selected.size, 0);
    let stopped = false;
    store.toggleSelect(store.items[0], { stopPropagation() { stopped = true; } });
    ok(stopped);
    ok(store.selected.has('blob:a'));
}

{
    const store = new MediaStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.setQuery('x');
    store.setFilter('image');
    eq(store.version, 2);
    eq(calls, 2);
    unsubscribe();
    store.setSort('size-desc');
    eq(calls, 2);
}

{
    const tilt = { ...tiltMath({ left: 0, top: 0, width: 100, height: 100 }, 25, 75), hovering: true };
    deep(tilt, { rx: -3.5, ry: -3.5, mx: 25, my: 75, hovering: true });
    ok(tiltStyle(tilt).includes('scale(1.03)'));
    ok(tiltStyle(tilt).includes('rotateX(-3.5deg)'));
    ok(tiltStyle(tilt).includes('rotateY(-3.5deg)'));
    ok(sheenStyle(tilt).includes('radial-gradient'));
    ok(sheenStyle(tilt).includes('0.12'));
    eq(sheenStyle({ rx: 0, ry: 0, mx: 50, my: 50, hovering: false }).includes('opacity:0'), true);
    eq(downloadName({ name: 'a/b/photo.jpg' }), 'photo.jpg');
    eq(DOWNLOAD_STAGGER_MS, 250);
    deep([0, 1, 3].map(downloadDelay), [0, 250, 750]);
}

console.log(`mediaStore: ok (${assertions} assertions)`);
