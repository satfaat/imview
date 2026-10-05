// Batch selection bar: count + Select All / Download / Star / Tag 18+ / Clear. Hidden
// when nothing is selected. Emits bubbling DOM events; the controller sequences them.
import { UiElement, define, delegate, html } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';

export class BatchBar extends UiElement {
    static styles = [cssUrl('./batch-bar.css', import.meta.url)];
    #count = 0;

    render() {
        this.innerHTML = html`
            <div class="batch-bar" data-bar hidden>
                <div class="batch-info"><b data-count>0</b>&nbsp;items selected</div>
                <div class="controls">
                    <button class="btn" data-act="all">Select All</button>
                    <button class="btn" data-act="download">Download Selected</button>
                    <button class="btn" data-act="star">Star Selected</button>
                    <button class="btn btn--tint tone-danger" data-act="tag">Tag 18+ Sensitive</button>
                    <button class="btn" data-act="clear">Clear</button>
                </div>
            </div>`.toString();
        return null;
    }

    setup() {
        const events = { all: 'batch-select-all', download: 'batch-download', star: 'batch-star', tag: 'batch-tag', clear: 'batch-clear' };
        delegate(this, 'click', '[data-act]', (e, btn) => this.emit(events[btn.dataset.act]));
        if (this.#count) this.#paint();
    }

    update({ count }) {
        this.#count = count;
        if (this.isReady) this.#paint();
    }

    #paint() {
        this.$('[data-bar]').hidden = this.#count === 0;
        this.$('[data-count]').textContent = String(this.#count);
    }
}

define('batch-bar', BatchBar);
