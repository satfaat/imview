// Global hotkey router: one keydown listener on window; ignored while typing in a
// field; an open help modal captures
// Escape and short-circuits; `b` is global and runs before the lightbox branch.
// Every action routes through controller/viewer public methods — never private fields.
// `lightbox` is accepted for signature symmetry (reserved for focus management).
// Returns an unsubscribe function.
export function installShortcuts({ controller, viewer = controller.viewer, lightbox = null, help, header = null }) {
    void lightbox;
    const onKey = e => {
        const key = e.key.toLowerCase();
        if ((e.metaKey || e.ctrlKey) && key === 'k') {
            e.preventDefault();
            header?.focusSearch();
            return;
        }
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable) return;

        if (help.isOpen && e.key === 'Escape') {
            help.close();
            return;
        }

        if (key === 'b') {
            controller.togglePrivacy();
            return;
        }

        if (viewer.active) {
            if (e.key === 'Escape') controller.closeLightbox();
            else if (e.key === 'ArrowRight') controller.step(1);
            else if (e.key === 'ArrowLeft') controller.step(-1);
            else if (key === 'n') controller.toggleSensitive(viewer.active);
            else if (e.key === ' ' && viewer.active.type === 'image') { e.preventDefault(); viewer.toggleSlideshow(() => controller.filtered); }
            else if (key === 'z' && viewer.active.type === 'image') controller.setZoom(viewer.zoom === 1 ? 2 : 1);
            else if (key === 'r' && viewer.active.type === 'image') viewer.rotate();
            else if (key === 'f') controller.toggleFavorite(viewer.active);
            else if (key === 'i') viewer.toggleInfo();
            else if (key === 'd') controller.downloadCurrent(viewer.active);
        }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
}
