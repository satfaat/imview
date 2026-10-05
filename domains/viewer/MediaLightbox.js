// Fullscreen media viewer. State comes from ViewerState; actions bubble to the controller.
import { UiElement, define, delegate, html, raw } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';

const SHIELD = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
const PREVIOUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>';
const NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';
const ICON = {
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 5 12 7-12 7V5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5v14m8-14v14"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2"/></svg>',
    flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M5 7h5l-5 5H2l3-5Zm14 0h-5l5 5h3l-3-5Zm-14 10h5l-5 5H2l3-5Zm14 0h-5l5 5h3l-3-5Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"/></svg>'
};

export class MediaLightbox extends UiElement {
    static styles = [cssUrl('./media-lightbox.css', import.meta.url)];
    #viewer = null;
    #unsub = null;
    #titles = new Map();
    #paintFrame = 0;
    #zoomFrame = 0;
    #zoomDelta = 0;
    #zoomStart = null;
    #zoomPending = null;
    #zoomCommitTimer = 0;
    #gestureScale = 1;
    #zoomOrigin = '50% 50%';
    #originUrl = null;
    #filmstripPinned = false;
    #toolbarPinned = false;
    #ctx = {
        list: [],
        isBlurred: () => false,
        isRevealed: () => false,
        isSensitive: () => false,
        isFavorite: () => false
    };

    setViewer(viewer) {
        this.#unsub?.();
        this.#unsub = null;
        this.#viewer = viewer;
        if (viewer && this.isReady) this.#unsub = viewer.subscribe(() => this.#queueRepaint());
        if (this.isReady) this.#repaint();
    }

    setContext(ctx) {
        this.#ctx = { ...this.#ctx, ...ctx };
        if (this.isReady) this.#repaint();
    }

    setup() {
        delegate(this, 'click', '[data-act]', (event, element) => {
            const { act } = element.dataset;
            if (act === 'stage') {
                if (event.target === element) this.emit('lightbox-close');
                return;
            }
            if (act === 'nav') {
                const item = this.#ctx.list[Number(element.dataset.idx)];
                if (item) this.emit('lightbox-nav', { item });
                return;
            }
            if (act === 'step-prev' || act === 'step-next') {
                this.emit('lightbox-step', { dir: act === 'step-prev' ? -1 : 1 });
                return;
            }
            if (act === 'filmstrip-toggle') {
                this.#filmstripPinned = !this.#filmstripPinned;
                this.$('.lightbox')?.classList.toggle('filmstrip-pinned', this.#filmstripPinned);
                element.setAttribute('aria-expanded', String(this.#filmstripPinned));
                return;
            }
            if (act === 'toolbar-toggle') {
                this.#toolbarPinned = !this.#toolbarPinned;
                this.$('.lightbox')?.classList.toggle('toolbar-pinned', this.#toolbarPinned);
                element.setAttribute('aria-expanded', String(this.#toolbarPinned));
                return;
            }
            this.emit('lightbox-' + act);
        });
        this.listen(this, 'change', event => {
            if (!event.target.matches('[data-title]') || !this.#viewer?.active) return;
            const title = event.target.value.trim() || this.#viewer.active.name;
            this.#titles.set(this.#viewer.active.url, title);
            event.target.value = title;
        });
        this.listen(this, 'keydown', event => {
            if (event.target.matches('[data-title]') && event.key === 'Enter') {
                event.preventDefault();
                event.target.blur();
            }
        });
        this.listen(this, 'wheel', event => {
            if (!(event.ctrlKey || event.metaKey) || !this.#viewer?.isImage || !event.target.closest('.lb-stage')) return;
            event.preventDefault();
            this.#setZoomOrigin(event);
            this.#queueZoom(event.deltaY);
        }, { passive: false, capture: true });
        this.listen(this, 'gesturestart', event => {
            if (!this.#viewer?.isImage) return;
            event.preventDefault();
            this.#gestureScale = event.scale || 1;
            this.#zoomStart = this.#viewer.zoom;
            this.#setZoomOrigin(event);
        }, { passive: false, capture: true });
        this.listen(this, 'gesturechange', event => {
            if (!this.#viewer?.isImage) return;
            event.preventDefault();
            const scale = event.scale || 1;
            this.#scheduleZoom(this.#zoomStart * scale, false);
            this.#gestureScale = scale;
        }, { passive: false, capture: true });
        this.listen(this, 'gestureend', event => {
            if (this.#zoomPending === null) return;
            event.preventDefault();
            const zoom = this.#zoomPending;
            this.#zoomStart = this.#zoomPending = null;
            this.emit('lightbox-zoom', { zoom });
        }, { passive: false, capture: true });
        this.#repaint();
    }

    connected() {
        if (this.#viewer && !this.#unsub) this.#unsub = this.#viewer.subscribe(() => this.#repaint());
    }

    disconnected() {
        this.#unsub?.();
        this.#unsub = null;
        cancelAnimationFrame(this.#paintFrame);
        cancelAnimationFrame(this.#zoomFrame);
        clearTimeout(this.#zoomCommitTimer);
        this.#paintFrame = this.#zoomFrame = 0;
        this.#zoomCommitTimer = 0;
    }

    #repaint() {
        if (!this.isReady) return;
        cancelAnimationFrame(this.#paintFrame);
        this.#paintFrame = 0;
        const viewer = this.#viewer;
        if (!viewer?.active) {
            cancelAnimationFrame(this.#zoomFrame);
            clearTimeout(this.#zoomCommitTimer);
            this.#zoomFrame = this.#zoomCommitTimer = 0;
            this.#zoomStart = this.#zoomPending = null;
            this.#zoomDelta = 0;
        }
        this.innerHTML = viewer?.active ? String(this.#rootTpl(viewer)) : '';
        this.$('.lightbox')?.classList.toggle('filmstrip-pinned', this.#filmstripPinned);
        this.$('.lightbox')?.classList.toggle('toolbar-pinned', this.#toolbarPinned);
    }

    #queueRepaint() {
        if (this.#paintFrame) return;
        this.#paintFrame = requestAnimationFrame(() => {
            this.#paintFrame = 0;
            this.#repaint();
        });
    }

    #queueZoom(deltaY) {
        if (this.#zoomStart === null) this.#zoomStart = this.#viewer.zoom;
        this.#zoomDelta += deltaY;
        this.#scheduleZoom(this.#zoomStart * Math.exp(-this.#zoomDelta * 0.002));
    }

    #setZoomOrigin(event) {
        const stage = this.$('.lb-stage');
        const image = stage?.querySelector('img');
        if (!stage || !image || image.naturalWidth === 0 || image.naturalHeight === 0
            || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;

        const bounds = stage.getBoundingClientRect();
        const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const left = bounds.left + (bounds.width - width) / 2;
        const top = bounds.top + (bounds.height - height) / 2;
        const x = Math.max(0, Math.min(1, (event.clientX - left) / width));
        const y = Math.max(0, Math.min(1, (event.clientY - top) / height));
        this.#zoomOrigin = `${x * 100}% ${y * 100}%`;
        image.style.transformOrigin = this.#zoomOrigin;
    }

    #scheduleZoom(zoom, commit = true) {
        this.#zoomPending = Math.max(0.5, Math.min(5, zoom));
        if (!this.#zoomFrame) {
            this.#zoomFrame = requestAnimationFrame(() => {
                this.#zoomFrame = 0;
                const image = this.$('.lb-stage img');
                if (image && this.#zoomPending !== null) {
                    const viewer = this.#viewer;
                    image.style.transform = `scale(${this.#zoomPending}) rotate(${viewer.rotation}deg) scaleX(${viewer.flipH ? -1 : 1})`;
                }
            });
        }
        if (!commit) return;
        clearTimeout(this.#zoomCommitTimer);
        this.#zoomCommitTimer = setTimeout(() => {
            const zoom = this.#zoomPending;
            this.#zoomStart = this.#zoomPending = null;
            this.#zoomDelta = 0;
            this.#zoomCommitTimer = 0;
            this.emit('lightbox-zoom', { zoom });
        }, 90);
    }

    #rootTpl(viewer) {
        const item = viewer.active;
        if (this.#originUrl !== item.url) {
            this.#originUrl = item.url;
            this.#zoomOrigin = '50% 50%';
        }
        const blurred = this.#ctx.isBlurred(item);
        const revealed = this.#ctx.isRevealed(item);
        const sensitive = this.#ctx.isSensitive(item);
        const favorite = this.#ctx.isFavorite(item);
        const title = this.#titles.get(item.url) ?? item.name;

        return html`
            <div class="lightbox">
                <button type="button" class="lb-top-trigger" data-act="toolbar-toggle" aria-label="Show viewer controls" aria-expanded="${this.#toolbarPinned}" title="Show viewer controls"></button>
                <header class="lb-header">
                    <div class="lb-title">
                        <input class="lb-title__input" data-title value="${title}" aria-label="Rename title" title="Rename title (session only)">
                        <span class="lb-count">${viewer.activeIndex + 1} / ${this.#ctx.list.length}</span>
                    </div>
                    <div class="lb-tools" aria-label="Media controls">
                        <button class="btn btn--icon lb-tool lb-tool--sensitive${sensitive ? ' is-active' : ''}" data-act="sensitive" aria-label="${sensitive ? 'Remove 18+ tag' : 'Add 18+ tag'}" aria-pressed="${sensitive}" title="${sensitive ? 'Remove 18+ tag' : 'Add 18+ tag'}">18+</button>
                        <button class="btn btn--icon lb-tool lb-tool--favorite${favorite ? ' is-active' : ''}" data-act="favorite" aria-label="${favorite ? 'Remove favorite' : 'Add favorite'}" aria-pressed="${favorite}" title="${favorite ? 'Remove favorite' : 'Add favorite'}">${raw(ICON.star)}</button>
                        ${viewer.isImage ? html`
                        <div class="lb-tool-group" aria-label="Image controls">
                            <button class="btn btn--icon lb-tool" data-act="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
                            <button class="btn btn--icon lb-tool" data-act="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
                            <button class="btn btn--icon lb-tool" data-act="rotate" aria-label="Rotate" title="Rotate (R)">${raw(ICON.rotate)}</button>
                            <button class="btn btn--icon lb-tool" data-act="flip" aria-label="Flip horizontally" title="Flip horizontally">${raw(ICON.flip)}</button>
                            <button class="btn btn--icon lb-tool${viewer.slideshow ? ' is-active' : ''}" data-act="slideshow" aria-label="${viewer.slideshow ? 'Pause slideshow' : 'Start slideshow'}" title="${viewer.slideshow ? 'Pause slideshow' : 'Play slideshow'} (Space)">${raw(viewer.slideshow ? ICON.pause : ICON.play)}</button>
                        </div>` : ''}
                        <button class="btn btn--icon lb-tool" data-act="download" aria-label="Download" title="Download (D)">${raw(ICON.download)}</button>
                        <button class="btn btn--icon lb-tool${viewer.showInfo ? ' is-active' : ''}" data-act="info" aria-label="Toggle information" aria-pressed="${viewer.showInfo}" title="Info (I)">${raw(ICON.info)}</button>
                        <button class="btn btn--icon lb-tool lb-close" data-act="close" aria-label="Close viewer" title="Close (Esc)">${raw(ICON.close)}</button>
                    </div>
                </header>

                <div class="lb-viewer">
                    <div class="lb-stage" data-act="stage">
                        ${blurred && !revealed ? html`
                        <div class="sensitive-curtain">
                            ${raw(SHIELD)}
                            <h3>Sensitive Content Shield</h3>
                            <p>This item is marked as sensitive / 18+ adult content and is blurred for privacy.</p>
                            <button class="btn btn--primary" data-act="reveal">Reveal Content [Unblur]</button>
                        </div>` : ''}
                        ${viewer.isImage ? html`
                        <img src="${item.url}" alt="${title}" class="${blurred && !revealed ? 'blurred' : ''}" style="transform-origin: ${this.#zoomOrigin}; transform: ${viewer.transform}">` : ''}
                        ${viewer.isVideo ? html`<bm-player class="lb-video" src="${item.url}" autoplay></bm-player>` : ''}
                    </div>
                    <div class="lb-nav-stack" aria-label="Navigate media">
                        <button type="button" class="lb-nav" data-act="step-prev" aria-label="Previous item" title="Previous (←)">${raw(PREVIOUS)}</button>
                        <button type="button" class="lb-nav" data-act="step-next" aria-label="Next item" title="Next (→)">${raw(NEXT)}</button>
                    </div>
                    ${viewer.showInfo ? html`
                    <aside class="info-drawer">
                        <h3>Inspector / Metadata</h3>
                        ${viewer.infoRows.map(row => html`<div class="info-row"><span>${row.label}</span><b${row.label === 'Blob URL' ? raw(' style="font-size:9px;"') : ''}>${row.value}</b></div>`)}
                    </aside>` : ''}
                </div>

                <button type="button" class="filmstrip-trigger" data-act="filmstrip-toggle" aria-label="Show thumbnails" aria-expanded="${this.#filmstripPinned}" title="Show thumbnails"></button>
                <nav class="filmstrip" aria-label="Media in current view">
                    ${this.#ctx.list.map((media, index) => html`
                    <button type="button" class="film-thumb${media.url === item.url ? ' active' : ''}" data-act="nav" data-idx="${index}" aria-label="Open ${media.name}" title="${media.name}">
                        ${media.type === 'image'
                            ? html`<img src="${media.url}" alt="" class="${this.#ctx.isBlurred(media) ? 'blurred' : ''}">`
                            : html`<video src="${media.url}" class="${this.#ctx.isBlurred(media) ? 'blurred' : ''}" muted></video>`}
                    </button>`)}
                </nav>
            </div>`;
    }
}

define('media-lightbox', MediaLightbox);
