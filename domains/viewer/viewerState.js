// Viewer (lightbox) domain state. DOM-free on purpose — no
// document, no window, no elements — so it stays unit-testable under plain node.
// Timer functions are injected (tests pass fakes); sensitive status arrives via an
// injected predicate so this file never touches the store either.
import { formatBytes } from '../media/MediaStore.js';

export class ViewerState {
    active = null;
    activeIndex = -1;
    zoom = 1;
    rotation = 0;
    flipH = false;
    showInfo = false;
    slideshow = false;
    slideshowTimer = null;
    version = 0;
    #listeners = new Set();
    #setIntervalFn;
    #clearIntervalFn;
    #isSensitive;

    constructor({ setIntervalFn = setInterval, clearIntervalFn = clearInterval, isSensitive = () => false } = {}) {
        this.#setIntervalFn = setIntervalFn;
        this.#clearIntervalFn = clearIntervalFn;
        this.#isSensitive = isSensitive;
    }

    subscribe(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn);
    }

    #bump() {
        this.version++;
        for (const fn of [...this.#listeners]) fn(this.version);
    }

    open(item, list) {
        this.active = item;
        this.activeIndex = list.indexOf(item);
        this.resetTransform();
        if (this.slideshow) this.stopSlideshow();
        else this.#bump();
    }

    close() {
        this.stopSlideshow();
        this.active = null;
        this.activeIndex = -1;
        this.resetTransform();
        this.#bump();
    }

    resetTransform() {
        this.zoom = 1;
        this.rotation = 0;
        this.flipH = false;
        this.#bump();
    }

    zoomIn() {
        this.setZoom(this.zoom + 0.3);
    }

    zoomOut() {
        this.setZoom(this.zoom - 0.3);
    }

    setZoom(zoom) {
        const value = Number(zoom);
        this.zoom = Math.max(0.5, Math.min(5, Number.isFinite(value) ? value : 1));
        this.#bump();
    }

    rotate() {
        this.rotation = (this.rotation + 90) % 360;
        this.#bump();
    }

    toggleFlip() {
        this.flipH = !this.flipH;
        this.#bump();
    }

    toggleInfo() {
        this.showInfo = !this.showInfo;
        this.#bump();
    }

    step(dir, list) {
        if (!list.length) return;
        let next = this.activeIndex + dir;
        if (next < 0) next = list.length - 1;
        if (next >= list.length) next = 0;
        this.activeIndex = next;
        this.active = list[next];
        this.resetTransform();
        this.#bump();
    }

    toggleSlideshow(listProvider) {
        if (this.slideshow) {
            this.stopSlideshow();
        } else {
            this.slideshow = true;
            // The list is re-read on every tick (like the legacy step re-reading
            // its filtered getter), so a filter change mid-slideshow takes effect.
            this.slideshowTimer = this.#setIntervalFn(() => {
                this.step(1, listProvider());
            }, 3000);
            this.#bump();
        }
    }

    stopSlideshow() {
        this.slideshow = false;
        if (this.slideshowTimer) {
            this.#clearIntervalFn(this.slideshowTimer);
            this.slideshowTimer = null;
        }
        this.#bump();
    }

    get transform() {
        return `scale(${this.zoom}) rotate(${this.rotation}deg) scaleX(${this.flipH ? -1 : 1})`;
    }

    get isImage() {
        return this.active?.type === 'image';
    }

    get isVideo() {
        return this.active?.type === 'video';
    }

    get infoRows() {
        if (!this.active) return [];
        return [
            { label: 'File Name', value: this.active.name },
            { label: 'Media Type', value: this.active.type.toUpperCase() },
            { label: '18+ Sensitive', value: this.#isSensitive(this.active) ? 'YES (Tagged)' : 'NO' },
            { label: 'File Size', value: formatBytes(this.active.size) },
            { label: 'Blob URL', value: this.active.url }
        ];
    }
}
