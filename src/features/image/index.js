// features/image — everything about the backdrop image: the mvu-helper seam that writes it
// into galgame's background DB (GCP capability 4b), the lightbox viewer, the regen button, and the
// Background Manager patch that makes the library the seam fills actually browsable.
export { startImageSeam } from './image-seam.js';
export { startImageViewer } from './image-viewer.js';
export { startImageRegen } from './image-regen.js';
export { startBackgroundManager } from './background-manager.js';
