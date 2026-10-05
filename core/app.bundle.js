/* ==== common/lib/bus.js ==== */

// App event bus: a module-level Map of handler Sets. Domains announce intent and the
// owning domain reacts — nothing reaches into another domain's internals. Unlike a
// document-CustomEvent bus this works dependency-free (no document needed), so node
// checks can import it too. Each EVT entry notes who emits it and who listens.
const EVT = Object.freeze({
    FOLDER_LOADED: 'media:folder-loaded',         // store emits after loadFolder(); toolbar counts + status listen
    FILTER_CHANGED: 'media:filter-changed',       // toolbar emits (detail: filter); grid listens
    VIEW_CHANGED: 'media:view-changed',           // toolbar emits (detail: view); grid + shell listen
    SEARCH_CHANGED: 'media:search-changed',       // toolbar emits (detail: query); grid listens
    SORT_CHANGED: 'media:sort-changed',           // toolbar emits (detail: sort); grid listens
    GRID_SIZE_CHANGED: 'media:grid-size-changed', // toolbar slider emits (detail: px); grid listens
    LIGHTBOX_OPEN: 'lightbox:open',               // grid emits (detail: item); lightbox + shell listen
    LIGHTBOX_CLOSE: 'lightbox:close',             // lightbox emits; shell listens
    LIGHTBOX_STEP: 'lightbox:step',               // lightbox emits (detail: index); filmstrip listens
    MEDIA_REVEALED: 'media:revealed',             // card/lightbox emit on user reveal (detail: url); store listens to persist
    PRIVACY_TOGGLED: 'privacy:toggled',           // any privacy toggle emits (detail: mode); grid + lightbox + toolbar listen
    HELP_TOGGLED: 'help:toggled',                 // shell hotkey emits; help dialog listens
    SELECTION_CHANGED: 'selection:changed',       // grid emits (detail: urls[]); batch bar listens
});

const handlers = new Map();

// Subscribe; returns an unsubscribe function.
function on(name, handler) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(handler);
    return () => off(name, handler);
}

function off(name, handler) {
    const set = handlers.get(name);
    if (!set) return;
    if (handler) set.delete(handler);
    else set.clear();
}

function emit(name, detail) {
    for (const fn of [...(handlers.get(name) ?? [])]) fn(detail);
}

/* ==== common/lib/styles.js (build stub: CSS is inlined above) ==== */

const cssUrl = (rel) => rel;
function useStyles() {}
const stylesReady = () => Promise.resolve();

/* ==== common/lib/dom.js ==== */

// DOM toolkit: escape-by-default templates and a base class for light-DOM components.
//
//   html`<b>${userText}</b>`   interpolations are HTML-escaped unless they are themselves
//                              html`` results (or raw()), arrays are joined. File names come
//                              from the user's disk and are untrusted, so markup is never
//                              built with raw string concatenation of user-controlled values.

class Safe {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

// Mark a string as trusted markup (use only for strings you built yourself).
const raw = value => new Safe(String(value ?? ''));

const render = v => (v == null || v === false ? '' : v instanceof Safe ? v.value : Array.isArray(v) ? v.map(render).join('') : esc(v));
const html = (strings, ...values) => new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));

// Delegated listener: handler(event, matchedElement). Returns an unsubscribe function.
function delegate(root, type, selector, handler, options) {
    const listener = event => {
        const match = event.target.closest?.(selector);
        if (match && root.contains(match)) handler(event, match);
    };
    root.addEventListener(type, listener, options);
    return () => root.removeEventListener(type, listener, options);
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

// Base class for light-DOM components (global tokens/utilities keep applying).
//
//   static styles = [cssUrl('./x.css', "bundle")]   lazy-loaded once, ever
//   render()      → template (string | html``) painted ONCE on first connect
//   setup()       → once, after render: wire listeners on your own subtree
//   connected()   → every connect: wire document/window listeners with this.listen()
//   disconnected()
//
// this.listen() listeners are removed automatically on disconnect, so components never leak.
class UiElement extends HTMLElement {
    static styles = [];
    #abort = null;
    #ready = false;

    connectedCallback() {
        if (!this.#ready) {
            this.#ready = true;
            useStyles(...this.constructor.styles);
            const tpl = this.render?.();
            if (tpl != null) this.innerHTML = String(tpl);
            this.setup?.();
        }
        this.#abort = new AbortController();
        this.connected?.();
    }

    disconnectedCallback() {
        this.#abort?.abort();
        this.disconnected?.();
    }

    get isReady() { return this.#ready; }

    listen(target, type, handler, options) {
        target.addEventListener(type, handler, { ...options, signal: this.#abort?.signal });
    }

    $(selector) { return this.querySelector(selector); }
    $$(selector) { return [...this.querySelectorAll(selector)]; }

    emit(name, detail, { bubbles = true } = {}) {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles }));
    }
}

// Define once, tolerate hot re-imports and node shims.
function define(tag, ctor) {
    if (!customElements.get(tag)) customElements.define(tag, ctor);
}

/* ==== common/elements/ui-dialog.js ==== */

// <ui-dialog heading="…" size="sm|md|lg|xl" [static] [flush]>
//
// The one modal for the whole app, built on the native <dialog> (focus trap, Esc, top
// layer for free). Children are slotted by attribute:
//
//   (default)         body            [slot=footer]   footer actions
//   [slot=heading]    replaces the title text        [slot=actions] extra header controls
//
// `static` disables dismiss-by-backdrop-click (use for forms with unsaved input).
// Events: dialog-open, dialog-close (detail: returnValue). Used for the help modal.

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>';

class UiDialog extends UiElement {
    static styles = [cssUrl('./ui-dialog.css', "bundle")];
    static observedAttributes = ['heading'];

    render() {
        const kids = [...this.childNodes];
        this.innerHTML = html`
            <dialog class="dlg" part="dialog" aria-labelledby="dlg-title">
                <header class="dlg__head">
                    <h2 class="dlg__title" id="dlg-title"><span data-heading></span></h2>
                    <div class="dlg__actions" data-actions></div>
                    <button type="button" class="btn btn--ghost btn--icon btn--sm" data-close title="Close (Esc)" aria-label="Close">${raw(CLOSE_SVG)}</button>
                </header>
                <div class="dlg__body" data-body></div>
                <footer class="dlg__foot" data-foot hidden></footer>
            </dialog>`.toString();

        const part = name => this.querySelector(`[data-${name}]`);
        for (const node of kids) {
            const slot = node.nodeType === 1 ? node.getAttribute('slot') : null;
            if (slot === 'footer') { part('foot').hidden = false; part('foot').append(...node.childNodes); }
            else if (slot === 'actions') part('actions').append(node);
            else if (slot === 'heading') part('heading').replaceWith(node);
            else part('body').append(node);
        }
        this.#syncHeading();
        return null;
    }

    setup() {
        this.dialog = this.$('dialog');
        this.dialog.addEventListener('close', () => this.emit('dialog-close', this.dialog.returnValue));
        this.dialog.addEventListener('click', e => {
            if (e.target === this.dialog && !this.hasAttribute('static')) this.close();
        });
        delegate(this, 'click', '[data-close]', () => this.close());
    }

    attributeChangedCallback(name) { if (name === 'heading') this.#syncHeading(); }
    #syncHeading() {
        const span = this.querySelector('span[data-heading]');
        if (span) span.textContent = this.getAttribute('heading') ?? '';
    }

    get isOpen() { return !!this.dialog?.open; }
    get body() { return this.$('[data-body]'); }

    open() {
        if (!this.isReady || this.isOpen) return;
        this.dialog.showModal();
        this.emit('dialog-open');
    }
    close(returnValue = '') { if (this.isOpen) this.dialog.close(returnValue); }
    toggle() { this.isOpen ? this.close() : this.open(); }
}

define('ui-dialog', UiDialog);

/* ==== domains/media/GalleryHeader.js ==== */

// Gallery header: brand, folder picker, privacy toggle, filter/view segmented controls,
// zoom slider, sort select, search box, help button. Presentational only — it emits bus
// events and never mutates the store; the controller binds the file input itself.

const FOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';
const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
const PRIVACY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>';

const FILTERS = [
    ['all', 'All'],
    ['image', 'Images'],
    ['video', 'Videos'],
    ['favorite', '★ Favs'],
    ['nsfw', '18+']
];
const VIEWS = [
    ['grid', 'Grid'],
    ['masonry', 'Masonry'],
    ['list', 'List']
];
const SORTS = [
    ['name-asc', 'Name A–Z'],
    ['name-desc', 'Name Z–A'],
    ['size-desc', 'Size ↓'],
    ['size-asc', 'Size ↑'],
    ['type', 'Type']
];

class GalleryHeader extends UiElement {
    static styles = [cssUrl('./gallery-header.css', "bundle")];
    #state = null;
    #sizePinned = false;

    render() {
        this.innerHTML = html`
            <header>
                <div class="header-inner">
                    <div class="brand">
                        <div class="brand-mark">A</div>
                        <div>
                            <h1>Aurora Gallery</h1>
                            <p data-status role="status" aria-live="polite">No folder selected</p>
                        </div>
                    </div>
                    <div class="controls">
                        <label class="btn btn--primary btn--icon header-icon" title="Choose media folder" aria-label="Choose media folder">
                            ${raw(FOLDER_SVG)}
                            <input type="file" webkitdirectory directory multiple data-folder aria-label="Choose a media folder">
                        </label>
                        <button type="button" class="btn btn--icon header-icon privacy-toggle" data-privacy title="" aria-label="" aria-pressed="false">
                            ${raw(PRIVACY_SVG)}
                            <span data-privacy-label></span>
                        </button>
                        <div class="seg" data-filter-seg role="group" aria-label="Filter media">
                            ${FILTERS.map(([v, label]) => html`<button type="button" class="seg__btn${v === 'nsfw' ? ' filter-sensitive' : ''}" data-filter="${v}" aria-label="${v === 'nsfw' ? '18+ Sensitive' : label}" aria-pressed="false">${label}</button>`)}
                        </div>
                        <div class="seg" data-view-seg role="group" aria-label="Gallery layout">
                            ${VIEWS.map(([v, label]) => html`<button type="button" class="seg__btn" data-view="${v}" title="${label} view" aria-pressed="false">${label}</button>`)}
                        </div>
                        <div class="size-control" data-zoom>
                            <button type="button" class="size-control__toggle" data-size-toggle aria-expanded="false" aria-controls="grid-size-control" title="Adjust grid thumbnail size">
                                Size <span aria-hidden="true">⌄</span>
                            </button>
                            <input id="grid-size-control" type="range" min="160" max="360" step="20" value="220" data-grid-size aria-label="Grid thumbnail size" tabindex="-1">
                        </div>
                        <select data-sort aria-label="Sort media" title="Sort media">
                            ${SORTS.map(([v, label]) => html`<option value="${v}">${label}</option>`)}
                        </select>
                        <div class="search-box" data-search-box>
                            <button type="button" class="btn btn--icon search-toggle" data-search-toggle aria-label="Open search" aria-expanded="false" title="Search (Ctrl/Cmd+K)">
                                ${raw(SEARCH_SVG)}
                                <span class="search-indicator" data-search-indicator hidden></span>
                            </button>
                            <input type="search" placeholder="Search files…" data-query aria-label="Search files" title="Search files (Ctrl/Cmd+K)">
                        </div>
                        <button type="button" class="btn btn--icon" data-help title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
                    </div>
                </div>
            </header>`.toString();
        return null;
    }

    setup() {
        delegate(this, 'click', '[data-filter]', (e, btn) => emit(EVT.FILTER_CHANGED, { filter: btn.dataset.filter }));
        delegate(this, 'click', '[data-view]', (e, btn) => emit(EVT.VIEW_CHANGED, { view: btn.dataset.view }));
        delegate(this, 'click', '[data-privacy]', () => emit(EVT.PRIVACY_TOGGLED));
        delegate(this, 'click', '[data-help]', () => emit(EVT.HELP_TOGGLED));
        delegate(this, 'click', '[data-search-toggle]', () => this.#toggleSearch());
        delegate(this, 'click', '[data-size-toggle]', () => this.#toggleSize());
        const sizeControl = this.$('[data-zoom]');
        this.listen(sizeControl, 'mouseenter', () => this.#openSize());
        this.listen(sizeControl, 'mouseleave', () => {
            if (!this.#sizePinned && !sizeControl.contains(document.activeElement)) this.#closeSize();
        });
        this.listen(sizeControl, 'focusin', () => this.#openSize());
        this.listen(sizeControl, 'focusout', e => {
            if (!this.#sizePinned && !sizeControl.contains(e.relatedTarget)) this.#closeSize();
        });
        this.listen(this.$('[data-sort]'), 'change', e => emit(EVT.SORT_CHANGED, { sort: e.target.value }));
        this.listen(this.$('[data-query]'), 'input', e => emit(EVT.SEARCH_CHANGED, { query: e.target.value }));
        this.listen(this.$('[data-grid-size]'), 'input', e => emit(EVT.GRID_SIZE_CHANGED, { size: Number(e.target.value) }));
        this.listen(this.$('[data-query]'), 'keydown', e => {
            if (e.key === 'Escape') this.#closeSearch();
        });
        this.$('[data-query]').tabIndex = -1;
        this.$('[data-query]').setAttribute('aria-hidden', 'true');
        this.listen(document, 'click', e => {
            if (!this.$('[data-search-box]').contains(e.target)) this.#closeSearch();
            if (!this.$('[data-zoom]').contains(e.target) && this.#sizePinned) {
                this.#sizePinned = false;
                this.#closeSize();
            }
        });
        if (this.#state) this.#paint();
    }

    get folderInput() { return this.$('[data-folder]'); }
    focusSearch() {
        this.#openSearch();
        this.$('[data-query]')?.select();
    }

    update(state) {
        this.#state = state;
        if (this.isReady) this.#paint();
    }

    #paint() {
        const s = this.#state;
        const privacyBtn = this.$('[data-privacy]');
        privacyBtn.classList.toggle('tone-danger', s.privacyMode === 'all');
        privacyBtn.classList.toggle('btn--tint', s.privacyMode === 'all');
        privacyBtn.classList.toggle('btn--primary', s.privacyMode === 'sensitive');
        privacyBtn.title = s.privacyTitle;
        privacyBtn.setAttribute('aria-label', s.privacyTitle);
        privacyBtn.setAttribute('aria-pressed', String(s.privacyMode !== 'off'));
        this.$('[data-privacy-label]').textContent = s.privacyMode === 'off' ? '' : '18+';
        privacyBtn.classList.toggle('privacy-toggle--active', s.privacyMode !== 'off');
        privacyBtn.disabled = s.loading;
        this.$('[data-folder]').disabled = s.loading;
        for (const btn of this.$$('.seg__btn[data-filter]')) {
            btn.classList.toggle('active', btn.dataset.filter === s.filter);
            btn.classList.toggle('tone-danger', btn.dataset.filter === 'nsfw');
            btn.setAttribute('aria-pressed', String(btn.dataset.filter === s.filter));
        }
        for (const btn of this.$$('.seg__btn[data-view]')) {
            btn.classList.toggle('active', btn.dataset.view === s.view);
            btn.setAttribute('aria-pressed', String(btn.dataset.view === s.view));
        }
        const sort = this.$('[data-sort]');
        if (sort.value !== s.sortBy) sort.value = s.sortBy;
        const slider = this.$('[data-grid-size]');
        if (Number(slider.value) !== s.gridSize) slider.value = String(s.gridSize);
        const query = this.$('[data-query]');
        if (query.value !== s.query && query !== document.activeElement) query.value = s.query;
        this.$('[data-search-indicator]').hidden = !s.query;
        this.$('[data-filter-seg]').hidden = !s.hasItems;
        this.$('[data-view-seg]').hidden = !s.hasItems;
        this.$('[data-zoom]').hidden = !(s.hasItems && s.view === 'grid');
        this.$('[data-sort]').hidden = !s.hasItems;
        this.$('[data-search-box]').hidden = !s.hasItems;
        this.$('[data-status]').textContent = s.count
            ? `${s.count} · ${s.totalLabel}`
            : 'No folder selected';
    }

    #toggleSearch() {
        if (this.$('[data-search-box]').classList.contains('is-open')) this.#closeSearch();
        else this.#openSearch();
    }

    #openSearch() {
        if (this.#state && !this.#state.hasItems) return;
        const box = this.$('[data-search-box]');
        box.classList.add('is-open');
        this.$('[data-search-toggle]').setAttribute('aria-expanded', 'true');
        this.$('[data-search-toggle]').setAttribute('aria-label', 'Close search');
        const input = this.$('[data-query]');
        input.tabIndex = 0;
        input.removeAttribute('aria-hidden');
        input.focus();
    }

    #closeSearch() {
        const box = this.$('[data-search-box]');
        if (!box?.classList.contains('is-open')) return;
        box.classList.remove('is-open');
        this.$('[data-search-toggle]').setAttribute('aria-expanded', 'false');
        this.$('[data-search-toggle]').setAttribute('aria-label', 'Open search');
        const input = this.$('[data-query]');
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');
    }

    #toggleSize() {
        this.#sizePinned = !this.#sizePinned;
        if (this.#sizePinned) this.#openSize();
        else this.#closeSize();
    }

    #openSize() {
        const control = this.$('[data-zoom]');
        if (!control || control.hidden) return;
        control.classList.add('is-open');
        this.$('[data-size-toggle]').setAttribute('aria-expanded', 'true');
        this.$('[data-grid-size]').tabIndex = 0;
    }

    #closeSize() {
        this.$('[data-zoom]')?.classList.remove('is-open');
        this.$('[data-size-toggle]')?.setAttribute('aria-expanded', 'false');
        this.$('[data-grid-size]').tabIndex = -1;
    }
}

define('gallery-header', GalleryHeader);

/* ==== domains/media/EmptyState.js ==== */

// Empty state shown before a folder is chosen. Static markup; the controller binds the
// file input (exposed via folderInput) and toggles visibility with `hidden`.

const EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const FOLDER_SVG_EMPTY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

class EmptyState extends UiElement {
    static styles = [cssUrl('./empty-state.css', "bundle")];

    render() {
        return html`
            <div class="empty">
                <div class="icon">${raw(EMPTY_SVG)}</div>
                <section data-empty-folder>
                    <h2>No media folder selected</h2>
                    <p>Choose a folder to browse images and videos. Your files stay on this device and are never uploaded.</p>
                    <label class="btn btn--primary">
                        ${raw(FOLDER_SVG_EMPTY)}
                        <span>Select Folder</span>
                        <input type="file" webkitdirectory directory multiple data-folder aria-label="Choose a media folder">
                    </label>
                </section>
                <section data-empty-results hidden>
                    <h2>No media matches</h2>
                    <p>Try another search or clear the current filters to see more of your library.</p>
                    <button type="button" class="btn" data-clear>Clear search &amp; filters</button>
                </section>
            </div>`;
    }

    setup() {
        this.$('[data-clear]').addEventListener('click', () => {
            emit(EVT.SEARCH_CHANGED, { query: '' });
            emit(EVT.FILTER_CHANGED, { filter: 'all' });
        });
    }

    update({ hasItems, filteredCount }) {
        this.$('[data-empty-folder]').hidden = hasItems;
        this.$('[data-empty-results]').hidden = !hasItems || filteredCount > 0;
    }

    get folderInput() { return this.$('[data-folder]'); }
}

define('empty-state', EmptyState);

/* ==== domains/media/BatchBar.js ==== */

// Batch selection bar: count + Select All / Download / Star / Tag 18+ / Clear. Hidden
// when nothing is selected. Emits bubbling DOM events; the controller sequences them.

class BatchBar extends UiElement {
    static styles = [cssUrl('./batch-bar.css', "bundle")];
    #count = 0;

    render() {
        this.innerHTML = html`
            <div class="batch-bar" data-bar hidden>
                <div class="batch-info"><b data-count>0</b>&nbsp;items selected</div>
                <div class="controls">
                    <button class="btn" data-act="all">Select All</button>
                    <button class="btn" data-act="download">Download Selected</button>
                    <button class="btn" data-act="star">Star Selected</button>
                    <button class="btn btn--tint tone-danger" data-act="tag">Tag 18+ Sensitive</button>
                    <button class="btn" data-act="clear">Clear</button>
                </div>
            </div>`.toString();
        return null;
    }

    setup() {
        const events = { all: 'batch-select-all', download: 'batch-download', star: 'batch-star', tag: 'batch-tag', clear: 'batch-clear' };
        delegate(this, 'click', '[data-act]', (e, btn) => this.emit(events[btn.dataset.act]));
        if (this.#count) this.#paint();
    }

    update({ count }) {
        this.#count = count;
        if (this.isReady) this.#paint();
    }

    #paint() {
        this.$('[data-bar]').hidden = this.#count === 0;
        this.$('[data-count]').textContent = String(this.#count);
    }
}

define('batch-bar', BatchBar);

/* ==== domains/media/media-preview.js ==== */


function mediaPreview(item, { className = '', blurred = false } = {}) {
    const classes = [className, blurred && 'blurred'].filter(Boolean).join(' ');
    return item.type === 'image'
        ? html`<img src="${item.url}" alt="" class="${classes}" loading="lazy">`
        : html`<video src="${item.url}" class="${classes}" muted preload="metadata"></video>`;
}

/* ==== domains/media/MediaActions.js ==== */


const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

class MediaActions extends UiElement {
    static styles = [cssUrl('./media-actions.css', "bundle")];
    #item = null;

    render() {
        return html`<div class="media-actions" data-actions></div>`;
    }

    setup() {
        delegate(this, 'click', '[data-action]', (event, button) => {
            event.stopPropagation();
            this.emit(`media-${button.dataset.action}`, { item: this.#item });
        });
    }

    setVM({ item, favorite, sensitive }) {
        this.#item = item;
        this.$('[data-actions]').innerHTML = html`
            <button type="button" class="media-action media-action--sensitive" data-action="sensitive"
                aria-label="${sensitive ? 'Remove 18+ tag' : 'Add 18+ tag'}: ${item.name}" aria-pressed="${sensitive}">18+</button>
            <button type="button" class="media-action media-action--favorite" data-action="favorite"
                aria-label="${favorite ? 'Remove favorite' : 'Add favorite'}: ${item.name}" aria-pressed="${favorite}">${raw(STAR)}</button>
        `.toString();
    }
}

define('media-actions', MediaActions);

/* ==== domains/media/MediaCard.js ==== */

// A single gallery card. Tilt math stays pure for direct testing; media actions and
// image/video previews are shared with the list view.

function tiltMath(rect, clientX, clientY) {
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { rx: (0.5 - py) * 14, ry: (px - 0.5) * 14, mx: px * 100, my: py * 100 };
}

function tiltStyle({ rx, ry, hovering }) {
    const t = hovering
        ? `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03) translateY(-4px)`
        : `perspective(900px) rotateX(0deg) rotateY(0deg) scale(1) translateY(0px)`;
    const shadow = hovering
        ? '0 16px 40px var(--shadow-ink-strong), 0 0 0 1px var(--line-teal)'
        : '0 1px 0 var(--surface-hover)';
    const trans = hovering
        ? 'box-shadow var(--dur-fast) var(--ease-out)'
        : 'transform var(--dur-slow) var(--ease-out), box-shadow var(--dur-med) var(--ease-out)';
    return `transform:${t}; box-shadow:${shadow}; transition:${trans};`;
}

function sheenStyle({ mx, my, hovering }) {
    return `background:radial-gradient(circle at ${mx}% ${my}%, var(--sheen-white), transparent 55%); opacity:${hovering ? 'var(--sheen-opacity, 0.12)' : 0}; transition:opacity var(--dur-med) var(--ease-out);`;
}

const REST_TILT = { rx: 0, ry: 0, mx: 50, my: 50, hovering: false };

const SHIELD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
class MediaCard extends UiElement {
    static styles = [cssUrl('./media-card.css', "bundle")];
    #vm = null;
    #mode = 'grid';
    #tilt = { ...REST_TILT };

    set mode(m) { this.#mode = m; }
    get mode() { return this.#mode; }

    setVM(vm) {
        this.#vm = vm;
        this.#tilt = { ...REST_TILT };
        if (this.isReady) this.#paint();
    }

    setup() {
        delegate(this, 'click', '[data-act]', (e, el) => this.emit('media-' + el.dataset.act, { item: this.#vm.item }));
        this.listen(this, 'mousemove', e => {
            if (this.#mode !== 'grid') return;
            const card = e.target.closest?.('.card');
            if (!card || !this.contains(card)) return;
            const r = card.getBoundingClientRect();
            this.#tilt = { ...tiltMath(r, e.clientX, e.clientY), hovering: true };
            this.#paintTilt();
        });
        this.listen(this, 'mouseleave', () => {
            if (this.#mode !== 'grid') return;
            this.#tilt = { ...REST_TILT };
            this.#paintTilt();
        });
        if (this.#vm) this.#paint();
    }

    #paintTilt() {
        const card = this.$('.card');
        if (card) card.setAttribute('style', tiltStyle(this.#tilt));
        const sheen = this.$('.sheen');
        if (sheen) sheen.setAttribute('style', sheenStyle(this.#tilt));
    }

    #paint() {
        this.innerHTML = String(this.#mode === 'masonry' ? this.#masonryTpl() : this.#gridTpl());
        this.$('media-actions')?.setVM(this.#vm);
    }

    #mediaTpl() {
        return mediaPreview(this.#vm.item);
    }

    #shieldTpl(text) {
        if (!this.#vm.blurred) return html``;
        return html`<div class="blur-shield-overlay" aria-hidden="true">${raw(SHIELD_SVG)}<span>${text}</span></div>`;
    }

    #gridTpl() {
        const v = this.#vm;
        const cls = 'card' + (v.selected ? ' selected' : '') + (v.blurred ? ' blurred' : '');
        return html`
            <div class="${cls}" style="${tiltStyle(this.#tilt)}">
                ${this.#mediaTpl()}
                <button type="button" class="card-open" data-act="open" aria-label="${v.blurred ? 'Open blurred media: ' : 'Open media: '}${v.item.name}"></button>
                ${this.#shieldTpl('BLURRED')}
                <div class="sheen" style="${sheenStyle(this.#tilt)}"></div>
                <div class="overlay">
                    <div class="card-top">
                        <button type="button" class="check-box" data-act="select" aria-label="${v.selected ? 'Deselect' : 'Select'} ${v.item.name}" aria-pressed="${v.selected}">${v.selected ? raw(CHECK_SVG) : ''}</button>
                        <div class="row gap-1">
                            ${v.sensitive ? html`<span class="badge tone-danger">18+</span>` : ''}
                            <span class="badge">${v.item.type === 'video' ? 'VID' : 'IMG'}</span>
                        </div>
                    </div>
                    <div class="card-bottom">
                        <div class="fname">${v.item.name}</div>
                        <div class="fmeta">
                            <span>${v.sizeLabel}</span>
                            <media-actions></media-actions>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    #masonryTpl() {
        const v = this.#vm;
        const cls = 'masonry-item' + (v.blurred ? ' blurred' : '');
        return html`
            <div class="${cls}">
                ${this.#mediaTpl()}
                <button type="button" class="masonry-open" data-act="open" aria-label="${v.blurred ? 'Open blurred media: ' : 'Open media: '}${v.item.name}"></button>
                ${this.#shieldTpl('SENSITIVE / BLURRED')}
            </div>`;
    }
}

define('media-card', MediaCard);

/* ==== domains/media/MediaCollection.js ==== */


class MediaCollection extends UiElement {
    #items = [];

    render() {
        return html`<div class="${this.constructor.layout}" data-items></div>`;
    }

    setup() {
        this.#paint();
    }

    setItems(items) {
        this.#items = items;
        if (this.isReady) this.#paint();
    }

    #paint() {
        const container = this.$('[data-items]');
        if (!container) return;

        const cards = this.#items.map(item => {
            const card = document.createElement('media-card');
            if (this.constructor.cardMode) card.mode = this.constructor.cardMode;
            card.setVM(item);
            return card;
        });
        container.replaceChildren(...cards);
    }
}

/* ==== domains/media/GalleryGrid.js ==== */


class GalleryGrid extends MediaCollection {
    static styles = [cssUrl('./gallery.css', "bundle")];

    #size = 220;

    render() {
        return html`<div class="media-grid" data-items style="--grid-size: ${this.#size}px"></div>`;
    }

    setGridSize(px) {
        this.#size = px;
        this.$('[data-items]')?.style.setProperty('--grid-size', `${px}px`);
    }
}

define('gallery-grid', GalleryGrid);

/* ==== domains/media/GalleryMasonry.js ==== */


class GalleryMasonry extends MediaCollection {
    static styles = [cssUrl('./gallery.css', "bundle")];
    static layout = 'media-masonry';
    static cardMode = 'masonry';
}

define('gallery-masonry', GalleryMasonry);

/* ==== domains/media/GalleryList.js ==== */

// List rows use the same preview, action, and media-event contracts as card views.

class GalleryList extends UiElement {
    static styles = [cssUrl('./gallery.css', "bundle")];
    #vms = [];

    render() {
        return html`
            <table class="list-table">
                <thead>
                    <tr>
                        <th scope="col" style="width:40px;">Select</th>
                        <th scope="col" style="width:50px;">Thumb</th>
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Tag</th>
                        <th scope="col">Size</th>
                        <th scope="col" style="width:100px;">Actions</th>
                    </tr>
                </thead>
                <tbody data-rows></tbody>
            </table>`;
    }

    setup() {
        delegate(this, 'click', '[data-act]', (e, el) => {
            if (e.target.closest('td[data-stop]')) return;
            const vm = this.#vms[Number(el.closest('[data-idx]').dataset.idx)];
            if (vm) this.emit('media-' + el.dataset.act, { item: vm.item });
        });
        delegate(this, 'change', '[data-select-box]', (e, el) => {
            const vm = this.#vms[Number(el.closest('[data-idx]').dataset.idx)];
            if (vm) this.emit('media-select', { item: vm.item });
        });
        this.#paint();
    }

    setItems(vms) {
        this.#vms = vms;
        if (this.isReady) this.#paint();
    }

    #paint() {
        const rows = this.$('[data-rows]');
        if (!rows) return;
        rows.innerHTML = this.#vms.map((v, idx) => String(html`
            <tr data-idx="${idx}" class="${v.selected ? 'selected' : ''}">
                <td data-stop><input type="checkbox" data-select-box aria-label="Select ${v.item.name}"${v.selected ? ' checked' : ''}></td>
                <td>${mediaPreview(v.item, { className: 'thumb-mini', blurred: v.blurred })}</td>
                <td><button type="button" class="list-open" data-act="open" aria-label="Open ${v.item.name}">${v.item.name}</button></td>
                <td><span class="badge">${v.item.type.toUpperCase()}</span></td>
                <td>${v.sensitive ? html`<span class="badge tone-danger">18+</span>` : ''}</td>
                <td>${v.sizeLabel}</td>
                <td data-stop><media-actions></media-actions></td>
            </tr>`)).join('');
        this.$$('media-actions').forEach((actions, index) => actions.setVM(this.#vms[index]));
    }
}

define('gallery-list', GalleryList);

/* ==== domains/viewer/MediaLightbox.js ==== */

// Fullscreen media viewer. State comes from ViewerState; actions bubble to the controller.

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

class MediaLightbox extends UiElement {
    static styles = [cssUrl('./media-lightbox.css', "bundle")];
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

/* ==== domains/media/MediaStore.js ==== */

// Media domain store: every piece of media state and pure logic ported from the legacy
// gallery() factory. DOM-free on purpose (localStorage + URL only) so the whole domain
// stays unit-testable under plain node. Name vs url split is deliberate and preserved:
// favorites + sensitive are keyed by name, reveal + selection by url.
const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|mp4|webm|mov|m4v|ogg)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)$/i;

function formatBytes(bytes) {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const FAVORITES_KEY = 'bm_gallery_favorites';
const NSFW_KEY = 'bm_gallery_nsfw';
const PRIVACY_KEY = 'bm_gallery_privacyMode';

class MediaStore {
    items = [];
    filter = 'all'; // 'all' | 'image' | 'video' | 'favorite' | 'nsfw'
    sortBy = 'name-asc';
    gridSize = 220;
    query = '';
    loading = false;
    favorites = new Set();
    sensitiveItems = new Set();
    revealedItems = new Set();
    privacyMode = 'sensitive'; // 'sensitive' | 'all' | 'off'
    selected = new Set();
    version = 0;
    #listeners = new Set();

    subscribe(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn);
    }

    #bump() {
        this.version++;
        for (const fn of [...this.#listeners]) fn(this.version);
    }

    hydrate() {
        try {
            const savedFavs = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
            this.favorites = new Set(savedFavs);
            const savedNsfw = JSON.parse(localStorage.getItem(NSFW_KEY) || '[]');
            this.sensitiveItems = new Set(savedNsfw);
            const mode = localStorage.getItem(PRIVACY_KEY);
            if (mode) this.privacyMode = mode;
        } catch (e) {}
        this.#bump();
    }

    setQuery(query) {
        this.query = query;
        this.#bump();
    }

    setFilter(filter) {
        this.filter = filter;
        this.#bump();
    }

    setSort(sortBy) {
        this.sortBy = sortBy;
        this.#bump();
    }

    setGridSize(gridSize) {
        this.gridSize = gridSize;
        this.#bump();
    }

    setFiles(fileList) {
        this.loading = true;
        this.items.forEach(i => URL.revokeObjectURL(i.url));
        this.selected.clear();
        const parsed = Array.from(fileList)
            .filter(f => MEDIA_EXT.test(f.name))
            .map(f => ({
                name: f.webkitRelativePath || f.name,
                type: VIDEO_EXT.test(f.name) ? 'video' : 'image',
                url: URL.createObjectURL(f),
                size: f.size
            }));
        this.items = parsed;
        this.loading = false;
        this.#bump();
    }

    dispose() {
        this.items.forEach(i => URL.revokeObjectURL(i.url));
    }

    get filtered() {
        let list = this.items;
        if (this.filter === 'image') list = list.filter(i => i.type === 'image');
        else if (this.filter === 'video') list = list.filter(i => i.type === 'video');
        else if (this.filter === 'favorite') list = list.filter(i => this.favorites.has(i.name));
        else if (this.filter === 'nsfw') list = list.filter(i => this.sensitiveItems.has(i.name));

        if (this.query.trim()) {
            const q = this.query.toLowerCase();
            list = list.filter(i => i.name.toLowerCase().includes(q));
        }

        return list.slice().sort((a, b) => {
            if (this.sortBy === 'name-asc') return a.name.localeCompare(b.name);
            if (this.sortBy === 'name-desc') return b.name.localeCompare(a.name);
            if (this.sortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
            if (this.sortBy === 'size-asc') return (a.size || 0) - (b.size || 0);
            if (this.sortBy === 'type') return a.type.localeCompare(b.type);
            return 0;
        });
    }

    isBlurred(item) {
        if (!item) return false;
        if (this.revealedItems.has(item.url)) return false;
        if (this.privacyMode === 'all') return true;
        if (this.privacyMode === 'sensitive' && this.sensitiveItems.has(item.name)) return true;
        return false;
    }

    isSensitive(item) {
        return item && this.sensitiveItems.has(item.name);
    }

    isRevealed(item) {
        return item && this.revealedItems.has(item.url);
    }

    isFavorite(item) {
        return item && this.favorites.has(item.name);
    }

    togglePrivacy() {
        if (this.privacyMode === 'sensitive') this.privacyMode = 'all';
        else if (this.privacyMode === 'all') this.privacyMode = 'off';
        else this.privacyMode = 'sensitive';
        localStorage.setItem(PRIVACY_KEY, this.privacyMode);
        this.#bump();
    }

    get privacyLabel() {
        if (this.privacyMode === 'all') return '🛡️ Blur: All';
        if (this.privacyMode === 'sensitive') return '🛡️ Blur: 18+';
        return '👁️ Blur: Off';
    }

    get privacyTitle() {
        if (this.privacyMode === 'all') return 'Privacy Shield: All media thumbnails are blurred (Click to cycle)';
        if (this.privacyMode === 'sensitive') return 'Blur 18+ Sensitive media only (Click to cycle)';
        return 'Blurring disabled (Click to cycle)';
    }

    toggleFavorite(item) {
        if (!item) return;
        if (this.favorites.has(item.name)) this.favorites.delete(item.name);
        else this.favorites.add(item.name);
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(this.favorites)));
        this.#bump();
    }

    toggleSensitive(item) {
        if (!item) return;
        if (this.sensitiveItems.has(item.name)) this.sensitiveItems.delete(item.name);
        else this.sensitiveItems.add(item.name);
        localStorage.setItem(NSFW_KEY, JSON.stringify(Array.from(this.sensitiveItems)));
        this.#bump();
    }

    tagSelectedSensitive() {
        this.filtered.filter(i => this.selected.has(i.url)).forEach(i => this.sensitiveItems.add(i.name));
        localStorage.setItem(NSFW_KEY, JSON.stringify(Array.from(this.sensitiveItems)));
        this.#bump();
    }

    reveal(item) {
        if (item) this.revealedItems.add(item.url);
        this.#bump();
    }

    unrevealAll() {
        this.revealedItems.clear();
        this.#bump();
    }

    toggleSelect(item, e) {
        if (e) e.stopPropagation();
        if (this.selected.has(item.url)) this.selected.delete(item.url);
        else this.selected.add(item.url);
        this.#bump();
    }

    selectAllFiltered() {
        this.filtered.forEach(i => this.selected.add(i.url));
        this.#bump();
    }

    clearSelection() {
        this.selected.clear();
        this.#bump();
    }

    starSelected() {
        this.filtered.filter(i => this.selected.has(i.url)).forEach(i => this.favorites.add(i.name));
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(this.favorites)));
        this.#bump();
    }

    formatBytes(bytes) {
        return formatBytes(bytes);
    }

    get totalSize() {
        return this.items.reduce((sum, i) => sum + (i.size || 0), 0);
    }

    get totalSizeFormatted() {
        return formatBytes(this.totalSize);
    }
}

/* ==== domains/viewer/viewerState.js ==== */

// Viewer (lightbox) domain state. DOM-free on purpose — no
// document, no window, no elements — so it stays unit-testable under plain node.
// Timer functions are injected (tests pass fakes); sensitive status arrives via an
// injected predicate so this file never touches the store either.

class ViewerState {
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

/* ==== domains/media/GalleryController.js ==== */

// GalleryController — the only module that sequences "event → store → URL → UI", so the
// components stay presentational and the store stays DOM-free. State it owns: the
// MediaStore, the current view, and the active item forwarded to the lightbox. Errors surface
// through a toast-style mechanism: a bubbling `gallery-error` CustomEvent (a shell toast
// can listen for it) with a console.error fallback.

const DOWNLOAD_STAGGER_MS = 250;
const downloadName = item => item.name.split('/').pop();
function downloadDelay(index) { return index * DOWNLOAD_STAGGER_MS; }

class GalleryController {
    #store = new MediaStore();
    #view = 'grid';
    #activeItem = null;

    constructor({ header, grid, masonry, list, batchBar, emptyState, lightbox = null, viewer = null }) {
        this.header = header;
        this.grid = grid;
        this.masonry = masonry;
        this.list = list;
        this.batchBar = batchBar;
        this.emptyState = emptyState;
        this.lightbox = lightbox;
        this.viewer = viewer ?? new ViewerState({ isSensitive: item => this.#store.isSensitive(item) });
        this.#store.subscribe(() => this.refresh());
        this.#bindInputs();
        this.#bindViews();
        this.#bindBatch();
        this.#bindLightbox();
        this.#bindBus();
        this.#store.hydrate();
        this.refresh();
    }

    get store() { return this.#store; }
    get filtered() { return this.#store.filtered; }
    get count() { return this.#store.items.length; }
    get totalSizeFormatted() { return this.#store.totalSizeFormatted; }

    refresh() {
        const store = this.#store;
        const filtered = store.filtered;
        const vms = filtered.map(item => ({
            item,
            selected: store.selected.has(item.url),
            favorite: !!store.isFavorite(item),
            sensitive: !!store.isSensitive(item),
            blurred: store.isBlurred(item),
            sizeLabel: formatBytes(item.size)
        }));
        const views = { grid: this.grid, masonry: this.masonry, list: this.list };
        for (const [name, el] of Object.entries(views)) {
            if (!el) continue;
            el.hidden = name !== this.#view;
            if (name === this.#view) el.setItems(vms);
        }
        if (this.grid) this.grid.setGridSize(store.gridSize);
        if (this.batchBar) this.batchBar.update({ count: store.selected.size });
        if (this.emptyState) {
            this.emptyState.update({ hasItems: store.items.length > 0, filteredCount: filtered.length });
            this.emptyState.hidden = store.items.length > 0 && filtered.length > 0;
        }
        if (this.lightbox) {
            this.lightbox.setViewer(this.viewer);
            this.lightbox.setContext({
                list: filtered,
                isBlurred: item => store.isBlurred(item),
                isRevealed: item => store.isRevealed(item),
                isSensitive: item => store.isSensitive(item),
                isFavorite: item => store.isFavorite(item)
            });
        }
        if (this.header) {
            this.header.update({
                loading: store.loading,
                privacyMode: store.privacyMode,
                privacyLabel: store.privacyLabel,
                privacyTitle: store.privacyTitle,
                filter: store.filter,
                view: this.#view,
                gridSize: store.gridSize,
                sortBy: store.sortBy,
                query: store.query,
                count: store.items.length,
                totalLabel: store.totalSizeFormatted,
                hasItems: store.items.length > 0
            });
        }
    }

    /* ───────── wiring ───────── */
    #bindInputs() {
        for (const el of [this.header, this.emptyState]) {
            const input = el?.folderInput;
            if (!input) continue;
            input.addEventListener('change', e => this.loadFolder(e.target.files));
        }
    }

    #bindViews() {
        for (const el of [this.grid, this.masonry, this.list]) {
            if (!el) continue;
            el.addEventListener('media-open', e => this.open(e.detail.item));
            el.addEventListener('media-select', e => this.toggleSelect(e.detail.item));
            el.addEventListener('media-favorite', e => this.toggleFavorite(e.detail.item));
            el.addEventListener('media-sensitive', e => this.toggleSensitive(e.detail.item));
        }
    }

    #bindBatch() {
        const b = this.batchBar;
        if (!b) return;
        b.addEventListener('batch-select-all', () => this.selectAll());
        b.addEventListener('batch-download', () => this.downloadSelected());
        b.addEventListener('batch-star', () => this.starSelected());
        b.addEventListener('batch-tag', () => this.tagSensitive());
        b.addEventListener('batch-clear', () => this.clearSelection());
    }

    #bindLightbox() {
        const lb = this.lightbox;
        if (!lb) return;
        lb.addEventListener('lightbox-close', () => this.closeLightbox());
        lb.addEventListener('lightbox-step', e => this.step(e.detail.dir));
        lb.addEventListener('lightbox-zoom-in', () => this.viewer.zoomIn());
        lb.addEventListener('lightbox-zoom-out', () => this.viewer.zoomOut());
        lb.addEventListener('lightbox-zoom', e => this.setZoom(e.detail.zoom));
        lb.addEventListener('lightbox-rotate', () => this.viewer.rotate());
        lb.addEventListener('lightbox-flip', () => this.viewer.toggleFlip());
        lb.addEventListener('lightbox-slideshow', () => this.viewer.toggleSlideshow(() => this.filtered));
        lb.addEventListener('lightbox-info', () => this.viewer.toggleInfo());
        lb.addEventListener('lightbox-download', () => this.downloadCurrent(this.viewer.active));
        lb.addEventListener('lightbox-sensitive', () => this.toggleSensitive(this.viewer.active));
        lb.addEventListener('lightbox-favorite', () => this.toggleFavorite(this.viewer.active));
        lb.addEventListener('lightbox-reveal', () => {
            if (this.viewer.active) this.#store.reveal(this.viewer.active);
        });
        lb.addEventListener('lightbox-nav', e => this.open(e.detail.item));
    }

    #bindBus() {
        on(EVT.FILTER_CHANGED, ({ filter }) => this.#store.setFilter(filter));
        on(EVT.VIEW_CHANGED, ({ view }) => {
            this.#view = view;
            this.refresh();
        });
        on(EVT.SEARCH_CHANGED, ({ query }) => this.#store.setQuery(query));
        on(EVT.SORT_CHANGED, ({ sort }) => this.#store.setSort(sort));
        on(EVT.GRID_SIZE_CHANGED, ({ size }) => this.#store.setGridSize(size));
        on(EVT.PRIVACY_TOGGLED, () => this.#store.togglePrivacy());
        on(EVT.SELECTION_CHANGED, () => this.refresh());
        on(EVT.FOLDER_LOADED, () => this.refresh());
    }

    /* ───────── actions ───────── */
    loadFolder(files) {
        try {
            this.#store.setFiles(files);
            emit(EVT.FOLDER_LOADED, { count: this.#store.items.length });
        } catch (error) {
            this.#fail(`Could not load folder: ${error?.message ?? error}`);
        }
    }

    toggleSelect(item) {
        this.#store.toggleSelect(item);
        emit(EVT.SELECTION_CHANGED, [...this.#store.selected]);
    }

    toggleFavorite(item) {
        this.#store.toggleFavorite(item);
    }

    togglePrivacy() {
        this.#store.togglePrivacy();
    }

    setZoom(z) {
        this.viewer.setZoom(z);
    }

    toggleSensitive(item) {
        this.#store.toggleSensitive(item);
    }

    selectAll() {
        this.#store.selectAllFiltered();
        emit(EVT.SELECTION_CHANGED, [...this.#store.selected]);
    }

    clearSelection() {
        this.#store.clearSelection();
        emit(EVT.SELECTION_CHANGED, []);
    }

    starSelected() {
        this.#store.starSelected();
    }

    tagSensitive() {
        this.#store.tagSelectedSensitive();
    }

    open(item) {
        this.#activeItem = item;
        this.viewer.open(item, this.filtered);
        emit(EVT.LIGHTBOX_OPEN, item);
    }

    closeLightbox() {
        this.#activeItem = null;
        this.viewer.close();
        emit(EVT.LIGHTBOX_CLOSE);
    }

    step(dir) {
        this.viewer.step(dir, this.filtered);
        this.#activeItem = this.viewer.active;
        emit(EVT.LIGHTBOX_STEP, { index: this.viewer.activeIndex });
    }

    downloadCurrent(item = this.viewer.active) {
        if (!item) return;
        this.#downloadViaAnchor(item);
    }

    downloadSelected() {
        this.#store.filtered
            .filter(i => this.#store.selected.has(i.url))
            .forEach((item, idx) => {
                setTimeout(() => this.#downloadViaAnchor(item), downloadDelay(idx));
            });
    }

    #downloadViaAnchor(item) {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = downloadName(item);
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    #fail(message) {
        console.error(message);
        this.header?.dispatchEvent(new CustomEvent('gallery-error', { detail: message, bubbles: true }));
    }
}

/* ==== core/shortcuts.js ==== */

// Global hotkey router: one keydown listener on window; ignored while typing in a
// field; an open help modal captures
// Escape and short-circuits; `b` is global and runs before the lightbox branch.
// Every action routes through controller/viewer public methods — never private fields.
// `lightbox` is accepted for signature symmetry (reserved for focus management).
// Returns an unsubscribe function.
function installShortcuts({ controller, viewer = controller.viewer, lightbox = null, help, header = null }) {
    void lightbox;
    const onKey = e => {
        const key = e.key.toLowerCase();
        if ((e.metaKey || e.ctrlKey) && key === 'k') {
            e.preventDefault();
            header?.focusSearch();
            return;
        }
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable) return;

        if (help.isOpen && e.key === 'Escape') {
            help.close();
            return;
        }

        if (key === 'b') {
            controller.togglePrivacy();
            return;
        }

        if (viewer.active) {
            if (e.key === 'Escape') controller.closeLightbox();
            else if (e.key === 'ArrowRight') controller.step(1);
            else if (e.key === 'ArrowLeft') controller.step(-1);
            else if (key === 'n') controller.toggleSensitive(viewer.active);
            else if (e.key === ' ' && viewer.active.type === 'image') { e.preventDefault(); viewer.toggleSlideshow(() => controller.filtered); }
            else if (key === 'z' && viewer.active.type === 'image') controller.setZoom(viewer.zoom === 1 ? 2 : 1);
            else if (key === 'r' && viewer.active.type === 'image') viewer.rotate();
            else if (key === 'f') controller.toggleFavorite(viewer.active);
            else if (key === 'i') viewer.toggleInfo();
            else if (key === 'd') controller.downloadCurrent(viewer.active);
        }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
}

/* ==== core/app.js ==== */

(async () => {
// Composition root. Importing a component registers it; this file only wires the few
// cross-domain connections (header ⇄ controller ⇄ lightbox ⇄ help) and reveals the
// page once styles are ready. Everything else talks over the event bus or DOM events.


const $ = id => document.getElementById(id);

function bootError(error) {
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.innerHTML = '<b>Gallery failed to start.</b> ' + esc(error?.message ?? error);
    document.body.prepend(p);
}

let controller;
try {
    controller = new GalleryController({
        header: $('site-header'),
        grid: $('grid'),
        masonry: $('masonry'),
        list: $('list'),
        batchBar: $('batch'),
        emptyState: $('empty'),
        lightbox: $('lightbox')
    });
} catch (error) {
    bootError(error?.message ?? error);
    throw error;
}

const help = $('help');
on(EVT.HELP_TOGGLED, () => help.open());
installShortcuts({ controller, viewer: controller.viewer, lightbox: $('lightbox'), help, header: $('site-header') });

await controller.refresh();
await stylesReady();
document.documentElement.dataset.ready = '';
})();
