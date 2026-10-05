import { UiElement, html } from '../../common/lib/dom.js';

export class MediaCollection extends UiElement {
    #items = [];

    render() {
        return html`<div class="${this.constructor.layout}" data-items></div>`;
    }

    setup() {
        this.#paint();
    }

    setItems(items) {
        this.#items = items;
        if (this.isReady) this.#paint();
    }

    #paint() {
        const container = this.$('[data-items]');
        if (!container) return;

        const cards = this.#items.map(item => {
            const card = document.createElement('media-card');
            if (this.constructor.cardMode) card.mode = this.constructor.cardMode;
            card.setVM(item);
            return card;
        });
        container.replaceChildren(...cards);
    }
}
