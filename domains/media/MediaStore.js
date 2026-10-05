// Media domain store: every piece of media state and pure logic ported from the legacy
// gallery() factory. DOM-free on purpose (localStorage + URL only) so the whole domain
// stays unit-testable under plain node. Name vs url split is deliberate and preserved:
// favorites + sensitive are keyed by name, reveal + selection by url.
export const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|mp4|webm|mov|m4v|ogg)$/i;
export const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)$/i;

export function formatBytes(bytes) {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const FAVORITES_KEY = 'bm_gallery_favorites';
const NSFW_KEY = 'bm_gallery_nsfw';
const PRIVACY_KEY = 'bm_gallery_privacyMode';

export class MediaStore {
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
