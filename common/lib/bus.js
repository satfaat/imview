// App event bus: a module-level Map of handler Sets. Domains announce intent and the
// owning domain reacts — nothing reaches into another domain's internals. Unlike a
// document-CustomEvent bus this works dependency-free (no document needed), so node
// checks can import it too. Each EVT entry notes who emits it and who listens.
export const EVT = Object.freeze({
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
export function on(name, handler) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(handler);
    return () => off(name, handler);
}

export function off(name, handler) {
    const set = handlers.get(name);
    if (!set) return;
    if (handler) set.delete(handler);
    else set.clear();
}

export function emit(name, detail) {
    for (const fn of [...(handlers.get(name) ?? [])]) fn(detail);
}
