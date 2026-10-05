// A single gallery card. Tilt math stays pure for direct testing; media actions and
// image/video previews are shared with the list view.
import { UiElement, define, delegate, html, raw } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { mediaPreview } from './media-preview.js';
import './MediaActions.js';

export function tiltMath(rect, clientX, clientY) {
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { rx: (0.5 - py) * 14, ry: (px - 0.5) * 14, mx: px * 100, my: py * 100 };
}

export function tiltStyle({ rx, ry, hovering }) {
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

export function sheenStyle({ mx, my, hovering }) {
    return `background:radial-gradient(circle at ${mx}% ${my}%, var(--sheen-white), transparent 55%); opacity:${hovering ? 'var(--sheen-opacity, 0.12)' : 0}; transition:opacity var(--dur-med) var(--ease-out);`;
}

const REST_TILT = { rx: 0, ry: 0, mx: 50, my: 50, hovering: false };

const SHIELD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
export class MediaCard extends UiElement {
    static styles = [cssUrl('./media-card.css', import.meta.url)];
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
