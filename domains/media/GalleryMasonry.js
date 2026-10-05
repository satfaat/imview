import { define } from '../../common/lib/dom.js';
import { cssUrl } from '../../common/lib/styles.js';
import { MediaCollection } from './MediaCollection.js';
import './MediaCard.js';

export class GalleryMasonry extends MediaCollection {
    static styles = [cssUrl('./gallery.css', import.meta.url)];
    static layout = 'media-masonry';
    static cardMode = 'masonry';
}

define('gallery-masonry', GalleryMasonry);
