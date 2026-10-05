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
import { UiElement, define, delegate, html, raw } from '../lib/dom.js';
import { cssUrl } from '../lib/styles.js';

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>';

export class UiDialog extends UiElement {
    static styles = [cssUrl('./ui-dialog.css', import.meta.url)];
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
