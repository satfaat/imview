import { UiElement, define, delegate, html, raw } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';

const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

export class MediaActions extends UiElement {
    static styles = [cssUrl('./media-actions.css', import.meta.url)];
    #item = null;

    render() {
        return html`<div class="media-actions" data-actions></div>`;
    }

    setup() {
        delegate(this, 'click', '[data-action]', (event, button) => {
            event.stopPropagation();
            this.emit(`media-${button.dataset.action}`, { item: this.#item });
        });
    }

    setVM({ item, favorite, sensitive }) {
        this.#item = item;
        this.$('[data-actions]').innerHTML = html`
            <button type="button" class="media-action media-action--sensitive" data-action="sensitive"
                aria-label="${sensitive ? 'Remove 18+ tag' : 'Add 18+ tag'}: ${item.name}" aria-pressed="${sensitive}">18+</button>
            <button type="button" class="media-action media-action--favorite" data-action="favorite"
                aria-label="${favorite ? 'Remove favorite' : 'Add favorite'}: ${item.name}" aria-pressed="${favorite}">${raw(STAR)}</button>
        `.toString();
    }
}

define('media-actions', MediaActions);
