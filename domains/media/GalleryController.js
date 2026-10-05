// GalleryController — the only module that sequences "event → store → URL → UI", so the
// components stay presentational and the store stays DOM-free. State it owns: the
// MediaStore, the current view, and the active item forwarded to the lightbox. Errors surface
// through a toast-style mechanism: a bubbling `gallery-error` CustomEvent (a shell toast
// can listen for it) with a console.error fallback.
import { on, emit, EVT } from '../../common/lib/bus.js';
import { MediaStore, formatBytes } from './MediaStore.js';
import { ViewerState } from '../viewer/viewerState.js';

export const DOWNLOAD_STAGGER_MS = 250;
export const downloadName = item => item.name.split('/').pop();
export function downloadDelay(index) { return index * DOWNLOAD_STAGGER_MS; }

export class GalleryController {
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
