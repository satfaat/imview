// DOM toolkit: escape-by-default templates and a base class for light-DOM components.
//
//   html`<b>${userText}</b>`   interpolations are HTML-escaped unless they are themselves
//                              html`` results (or raw()), arrays are joined. File names come
//                              from the user's disk and are untrusted, so markup is never
//                              built with raw string concatenation of user-controlled values.
import { useStyles } from './styles.js';

class Safe {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

// Mark a string as trusted markup (use only for strings you built yourself).
export const raw = value => new Safe(String(value ?? ''));

const render = v => (v == null || v === false ? '' : v instanceof Safe ? v.value : Array.isArray(v) ? v.map(render).join('') : esc(v));
export const html = (strings, ...values) => new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));

// Delegated listener: handler(event, matchedElement). Returns an unsubscribe function.
export function delegate(root, type, selector, handler, options) {
    const listener = event => {
        const match = event.target.closest?.(selector);
        if (match && root.contains(match)) handler(event, match);
    };
    root.addEventListener(type, listener, options);
    return () => root.removeEventListener(type, listener, options);
}

export const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

// Base class for light-DOM components (global tokens/utilities keep applying).
//
//   static styles = [cssUrl('./x.css', import.meta.url)]   lazy-loaded once, ever
//   render()      → template (string | html``) painted ONCE on first connect
//   setup()       → once, after render: wire listeners on your own subtree
//   connected()   → every connect: wire document/window listeners with this.listen()
//   disconnected()
//
// this.listen() listeners are removed automatically on disconnect, so components never leak.
export class UiElement extends HTMLElement {
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
export function define(tag, ctor) {
    if (!customElements.get(tag)) customElements.define(tag, ctor);
}
