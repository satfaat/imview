// Gallery header: brand, folder picker, privacy toggle, filter/view segmented controls,
// zoom slider, sort select, search box, help button. Presentational only — it emits bus
// events and never mutates the store; the controller binds the file input itself.
import { UiElement, define, delegate, html, raw } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { emit, EVT } from '../../common/lib/bus.js';

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

export class GalleryHeader extends UiElement {
    static styles = [cssUrl('./gallery-header.css', import.meta.url)];
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
