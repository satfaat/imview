# Aurora Gallery

A lightweight, browser-local image and video gallery. Files are read from a selected
folder and are not uploaded.

## Project layout

- `index.html` — readable page entry with local stylesheet and classic-script links
- `core/app.bundle.js` — generated classic-script bundle; works from `file://`
- `core/` — app composition, page shell, and global keyboard shortcuts
- `common/` — shared DOM/event/style utilities, design tokens, primitives, and UI elements
- `domains/media/` — media store, gallery controls, cards, and grid/masonry/list views
- `domains/viewer/` — lightbox and viewer state
- `__checks__/` — dependency-free behavior, bundle, import, and stylesheet checks
- `common/elements/bm-player.js` — shared vendored media-player custom element

UI is composed from lightweight custom elements. Shared styling lives in `common/`;
domain styles stay beside their owning components. App source lives in `core/`,
`common/`, and `domains/`; the builder combines it into the local classic script
referenced by `index.html`.
Shared CSS tones (`tone-danger`, `tone-warning`, and friends) derive their color,
background, and border from one semantic token. Small layout helpers such as `.row`,
`.stack`, and `.grow` keep component markup consistent. Media grid and masonry views
share one collection renderer, and grid/list actions reuse the same `<media-actions>`
component.

## Commands

Run from the project root:

- `npm run check` — run the project checks
- `npm run build` — regenerate `core/app.bundle.js` from modular source

Open `index.html` directly from disk or serve the project root over HTTP. It uses
only local styles and classic scripts, so it does not require module loading,
a web server, or network access.
