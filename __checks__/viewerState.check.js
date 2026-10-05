import './_shim.js';
import assert from 'node:assert/strict';
import { ViewerState } from '../domains/viewer/viewerState.js';

let assertions = 0;
function eq(actual, expected, message) {
    assertions++;
    assert.strictEqual(actual, expected, message ?? 'viewer state differs from expectation');
}
function deep(actual, expected, message) {
    assertions++;
    assert.deepStrictEqual(actual, expected, message);
}
function ok(value, message) {
    assertions++;
    assert.ok(value, message);
}
function makeViewer(sensitive = () => false) {
    const timers = { calls: [], cleared: [] };
    const viewer = new ViewerState({
        isSensitive: sensitive,
        setIntervalFn(fn, ms) {
            const id = timers.calls.length + 1;
            timers.calls.push({ id, fn, ms });
            return id;
        },
        clearIntervalFn(id) { timers.cleared.push(id); }
    });
    return { viewer, timers };
}
function fixtures() {
    return [
        { name: 'a/photo.jpg', type: 'image', url: 'blob:a', size: 100 },
        { name: 'b/clip.mp4', type: 'video', url: 'blob:b', size: 500 },
        { name: 'c/photo.png', type: 'image', url: 'blob:c', size: 300 },
        { name: 'd/movie.webm', type: 'video', url: 'blob:d', size: 200 }
    ];
}

{
    const { viewer } = makeViewer();
    const items = fixtures();
    viewer.zoom = 3;
    viewer.rotation = 90;
    viewer.flipH = true;
    viewer.open(items[2], items);
    eq(viewer.active, items[2]);
    eq(viewer.activeIndex, 2);
    eq(viewer.zoom, 1);
    eq(viewer.rotation, 0);
    eq(viewer.flipH, false);
    viewer.zoom = 2;
    viewer.rotation = 180;
    viewer.toggleFlip();
    viewer.step(1, items);
    eq(viewer.active, items[3]);
    eq(viewer.zoom, 1);
    eq(viewer.rotation, 0);
    eq(viewer.flipH, false);
    viewer.step(1, items);
    eq(viewer.activeIndex, 0, 'next wraps to first');
    viewer.step(-1, items);
    eq(viewer.activeIndex, 3, 'previous wraps to last');
    viewer.close();
    eq(viewer.active, null);
    eq(viewer.activeIndex, -1);
    eq(viewer.zoom, 1);
    eq(viewer.slideshow, false);
    viewer.step(1, []);
    eq(viewer.active, null);
    eq(viewer.activeIndex, -1);
}

{
    const { viewer } = makeViewer();
    viewer.zoom = 1;
    viewer.zoomIn();
    eq(viewer.zoom, 1.3);
    viewer.zoom = 4.9;
    viewer.zoomIn();
    eq(viewer.zoom, 5);
    viewer.zoomIn();
    eq(viewer.zoom, 5);
    viewer.zoom = 0.6;
    viewer.zoomOut();
    eq(viewer.zoom, 0.5);
    viewer.zoomOut();
    eq(viewer.zoom, 0.5);
    viewer.setZoom(2.75);
    eq(viewer.zoom, 2.75, 'setZoom accepts continuous zoom levels');
    viewer.setZoom(9);
    eq(viewer.zoom, 5, 'setZoom caps zoom');
    viewer.setZoom(0.1);
    eq(viewer.zoom, 0.5, 'setZoom enforces minimum zoom');
    viewer.setZoom(0);
    eq(viewer.zoom, 0.5, 'zero zoom clamps to the minimum');
    viewer.rotate();
    eq(viewer.rotation, 90);
    viewer.rotate();
    viewer.rotate();
    eq(viewer.rotation, 270);
    viewer.rotate();
    eq(viewer.rotation, 0);
    viewer.toggleFlip();
    eq(viewer.flipH, true);
    viewer.toggleFlip();
    eq(viewer.flipH, false);
    viewer.resetTransform();
    eq(viewer.transform, 'scale(1) rotate(0deg) scaleX(1)');
    viewer.zoom = 2;
    viewer.rotation = 90;
    viewer.toggleFlip();
    eq(viewer.transform, 'scale(2) rotate(90deg) scaleX(-1)');
    viewer.resetTransform();
    eq(viewer.transform, 'scale(1) rotate(0deg) scaleX(1)');
}

{
    const items = fixtures();
    const { viewer, timers } = makeViewer(item => item.name === 'a/photo.jpg');
    eq(viewer.isImage, false);
    eq(viewer.isVideo, false);
    viewer.open(items[0], items);
    eq(viewer.isImage, true);
    eq(viewer.isVideo, false);
    deep(viewer.infoRows, [
        { label: 'File Name', value: 'a/photo.jpg' },
        { label: 'Media Type', value: 'IMAGE' },
        { label: '18+ Sensitive', value: 'YES (Tagged)' },
        { label: 'File Size', value: '100 B' },
        { label: 'Blob URL', value: 'blob:a' }
    ]);
    viewer.open(items[1], items);
    eq(viewer.isImage, false);
    eq(viewer.isVideo, true);
    eq(viewer.infoRows[2].value, 'NO');
    viewer.open(items[0], items);
    viewer.toggleSlideshow(() => items);
    eq(viewer.slideshow, true);
    eq(timers.calls[0].ms, 3000);
    timers.calls[0].fn();
    eq(viewer.activeIndex, 1);
    eq(viewer.active, items[1]);
    viewer.stopSlideshow();
    eq(viewer.slideshow, false);
    eq(viewer.slideshowTimer, null);
    deep(timers.cleared, [1]);
    viewer.stopSlideshow();
    deep(timers.cleared, [1], 'stopping twice is safe');
    viewer.toggleInfo();
    eq(viewer.showInfo, true);
    viewer.toggleInfo();
    eq(viewer.showInfo, false);
    viewer.close();
    eq(viewer.rotation, 0);
    eq(viewer.flipH, false);
}

{
    const { viewer, timers } = makeViewer();
    const first = fixtures();
    const second = [{ name: 'z/other.jpg', type: 'image', url: 'blob:z', size: 9 }];
    let current = first;
    viewer.open(first[0], first);
    viewer.toggleSlideshow(() => current);
    eq(viewer.slideshow, true);
    current = second;
    timers.calls[0].fn();
    eq(viewer.active, second[0], 'slideshow reads the current filtered list');
    eq(viewer.activeIndex, 0);
    viewer.toggleSlideshow(() => current);
    eq(viewer.slideshow, false);
    deep(timers.cleared, [1]);
}

{
    const { viewer } = makeViewer();
    let calls = 0;
    const unsubscribe = viewer.subscribe(() => calls++);
    viewer.toggleInfo();
    eq(viewer.version, 1);
    eq(calls, 1);
    unsubscribe();
    viewer.toggleInfo();
    eq(viewer.version, 2);
    eq(calls, 1);
}

console.log(`viewerState: ok (${assertions} assertions)`);
