// Composition root. Importing a component registers it; this file only wires the few
// cross-domain connections (header ⇄ controller ⇄ lightbox ⇄ help) and reveals the
// page once styles are ready. Everything else talks over the event bus or DOM events.
import { on, EVT } from '../common/lib/bus.js';
import { stylesReady } from '../common/lib/styles.js';
import { esc } from '../common/lib/dom.js';

import '../common/elements/ui-dialog.js';
import '../domains/media/GalleryHeader.js';
import '../domains/media/EmptyState.js';
import '../domains/media/BatchBar.js';
import '../domains/media/MediaCard.js';
import '../domains/media/GalleryGrid.js';
import '../domains/media/GalleryMasonry.js';
import '../domains/media/GalleryList.js';
import '../domains/viewer/MediaLightbox.js';
import { GalleryController } from '../domains/media/GalleryController.js';
import { installShortcuts } from './shortcuts.js';

const $ = id => document.getElementById(id);

function bootError(error) {
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.innerHTML = '<b>Gallery failed to start.</b> ' + esc(error?.message ?? error);
    document.body.prepend(p);
}

let controller;
try {
    controller = new GalleryController({
        header: $('site-header'),
        grid: $('grid'),
        masonry: $('masonry'),
        list: $('list'),
        batchBar: $('batch'),
        emptyState: $('empty'),
        lightbox: $('lightbox')
    });
} catch (error) {
    bootError(error?.message ?? error);
    throw error;
}

const help = $('help');
on(EVT.HELP_TOGGLED, () => help.open());
installShortcuts({ controller, viewer: controller.viewer, lightbox: $('lightbox'), help, header: $('site-header') });

await controller.refresh();
await stylesReady();
document.documentElement.dataset.ready = '';
