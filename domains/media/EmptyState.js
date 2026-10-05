// Empty state shown before a folder is chosen. Static markup; the controller binds the
// file input (exposed via folderInput) and toggles visibility with `hidden`.
import { UiElement, define, html, raw } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { emit, EVT } from '../../common/lib/bus.js';

const EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const FOLDER_SVG_EMPTY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>';

export class EmptyState extends UiElement {
    static styles = [cssUrl('./empty-state.css', import.meta.url)];

    render() {
        return html`
            <div class="empty">
                <div class="icon">${raw(EMPTY_SVG)}</div>
                <section data-empty-folder>
                    <h2>No media folder selected</h2>
                    <p>Choose a folder to browse images and videos. Your files stay on this device and are never uploaded.</p>
                    <label class="btn btn--primary">
                        ${raw(FOLDER_SVG_EMPTY)}
                        <span>Select Folder</span>
                        <input type="file" webkitdirectory directory multiple data-folder aria-label="Choose a media folder">
                    </label>
                </section>
                <section data-empty-results hidden>
                    <h2>No media matches</h2>
                    <p>Try another search or clear the current filters to see more of your library.</p>
                    <button type="button" class="btn" data-clear>Clear search &amp; filters</button>
                </section>
            </div>`;
    }

    setup() {
        this.$('[data-clear]').addEventListener('click', () => {
            emit(EVT.SEARCH_CHANGED, { query: '' });
            emit(EVT.FILTER_CHANGED, { filter: 'all' });
        });
    }

    update({ hasItems, filteredCount }) {
        this.$('[data-empty-folder]').hidden = hasItems;
        this.$('[data-empty-results]').hidden = !hasItems || filteredCount > 0;
    }

    get folderInput() { return this.$('[data-folder]'); }
}

define('empty-state', EmptyState);
