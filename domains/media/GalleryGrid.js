import { define, html } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { MediaCollection } from './MediaCollection.js';
import './MediaCard.js';

export class GalleryGrid extends MediaCollection {
    static styles = [cssUrl('./gallery.css', import.meta.url)];

    #size = 220;

    render() {
        return html`<div class="media-grid" data-items style="--grid-size: ${this.#size}px"></div>`;
    }

    setGridSize(px) {
        this.#size = px;
        this.$('[data-items]')?.style.setProperty('--grid-size', `${px}px`);
    }
}

define('gallery-grid', GalleryGrid);
