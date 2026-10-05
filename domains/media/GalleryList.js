// List rows use the same preview, action, and media-event contracts as card views.
import { UiElement, define, delegate, html } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { mediaPreview } from './media-preview.js';
import './MediaActions.js';

export class GalleryList extends UiElement {
    static styles = [cssUrl('./gallery.css', import.meta.url)];
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
