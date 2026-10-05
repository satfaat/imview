// Side-effect browser shims for DOM-free gallery checks under node.
globalThis.HTMLElement ??= class {};
globalThis.CustomEvent ??= class extends Event {
    constructor(t, o = {}) {
        super(t, o);
        this.detail = o.detail;
    }
};
const __registry = new Map();
globalThis.customElements ??= {
    define: (n, c) => __registry.set(n, c),
    get: (n) => __registry.get(n)
};
globalThis.DOMParser ??= class {};
globalThis.KeyboardEvent ??= class extends Event {
    constructor(t, o = {}) {
        super(t, o);
        this.key = o.key ?? '';
    }
};

function __makeEl() {
    return {
        value: '',
        files: null,
        innerHTML: '',
        textContent: '',
        href: '',
        download: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        append() {},
        remove() {},
        click() {},
        setAttribute() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    };
}

const __createdAnchors = [];
globalThis.__createdAnchors = __createdAnchors;

if (!globalThis.document) {
    const __body = __makeEl();
    globalThis.document = {
        getElementById: () => __makeEl(),
        createElement: (tag) => {
            const el = __makeEl();
            el.tagName = String(tag).toUpperCase();
            __createdAnchors.push(el);
            return el;
        },
        body: __body,
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

{
    const store = new Map();
    const ls = {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { store.set(String(k), String(v)); },
        removeItem: (k) => { store.delete(String(k)); },
        clear: () => { store.clear(); },
        reset: () => { store.clear(); }
    };
    try {
        Object.defineProperty(globalThis, 'localStorage', {
            value: ls,
            writable: true,
            configurable: true
        });
    } catch {
        globalThis.localStorage = ls;
    }
}

{
    let n = 0;
    const created = [];
    const revoked = [];
    globalThis.__objectUrls = {
        created,
        revoked,
        reset: () => {
            n = 0;
            created.length = 0;
            revoked.length = 0;
        }
    };
    globalThis.URL.createObjectURL = () => {
        const u = 'blob:legacy/' + (n++);
        created.push(u);
        return u;
    };
    globalThis.URL.revokeObjectURL = (u) => { revoked.push(u); };
}

export function resetStorage() {
    globalThis.localStorage.reset();
}
