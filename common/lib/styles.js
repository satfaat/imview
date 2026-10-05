// Lazy stylesheet loader. A component declares its CSS next to itself and the first
// instance injects the <link>; later instances are free. The app shell awaits
// stylesReady() so the first paint never shows unstyled components.
const links = new Map();

export const cssUrl = (relative, base) => new URL(relative, base).href;

export function useStyles(...urls) {
    if (typeof document === 'undefined') return;
    for (const url of urls) {
        if (links.has(url)) continue;
        if ([...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === url)) { links.set(url, Promise.resolve()); continue; }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        links.set(url, new Promise(resolve => { link.onload = link.onerror = () => resolve(); }));
        document.head.appendChild(link);
    }
}

// Resolves when every requested stylesheet settled (or after `timeoutMs`, whichever is first).
export const stylesReady = (timeoutMs = 1500) =>
    Promise.race([Promise.all(links.values()), new Promise(resolve => setTimeout(resolve, timeoutMs))]);
