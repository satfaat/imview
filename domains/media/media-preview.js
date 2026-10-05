import { html } from '../../common/lib/dom.js';

export function mediaPreview(item, { className = '', blurred = false } = {}) {
    const classes = [className, blurred && 'blurred'].filter(Boolean).join(' ');
    return item.type === 'image'
        ? html`<img src="${item.url}" alt="" class="${classes}" loading="lazy">`
        : html`<video src="${item.url}" class="${classes}" muted preload="metadata"></video>`;
}
