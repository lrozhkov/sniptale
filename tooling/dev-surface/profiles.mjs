/** Closed development surfaces and the existing controls available to diagnostics. */
export const SURFACE_PROFILES = Object.freeze({
  'video-editor': {
    route: '/apps/extension/src/video-editor/index.html',
    readySelector: '#root > *',
    timeSelector: '[data-ui="video-editor.timeline.playhead-handle"]',
  },
  'image-editor': {
    route: '/apps/extension/src/editor/index.html',
    readySelector: '#root > *',
    toolSelector: '[data-ui="editor.floating.tool-rail"]',
    inspectorSelector: '[data-ui="editor.inspector.sidebar-panel"]',
  },
  'gallery-editor': {
    route: '/apps/extension/src/gallery/index.html',
    readySelector: '[data-ui="gallery.videoReview.timeline"]',
    timeSelector: '[data-ui="gallery.videoReview.timePlane"]',
    toolSelector: '[data-ui="gallery.videoReview.editingTools"]',
    inspectorSelector: '[data-ui="gallery.videoReview.inspector"]',
  },
  popup: { route: '/apps/extension/src/popup/index.html', readySelector: '#root > *' },
  settings: { route: '/apps/extension/src/settings/index.html', readySelector: '#root > *' },
  library: { route: '/apps/extension/src/gallery/index.html', readySelector: '#root > *' },
  'scenario-editor': {
    route: '/apps/extension/src/scenario-editor/index.html',
    readySelector: '#root > *',
  },
  components: {
    route: '/apps/extension/src/design-system/index.html',
    readySelector: '#root > *',
  },
  'image-inspector': {
    route: '/tooling/test/harness/editor.html',
    readySelector: '[data-ui="editor.canvas.wrapper"]',
    toolSelector: '[data-ui="editor.floating.tool-rail"]',
    inspectorSelector: '[data-ui="editor.inspector.sidebar-panel"]',
  },
  'audio-preview': {
    route: '/tooling/test/harness/preview-audio-diagnostic.html',
    readySelector: '#root > *',
  },
});

/** Refuse unknown names before any server or browser starts. */
export function getSurfaceProfile(name) {
  if (!Object.hasOwn(SURFACE_PROFILES, name))
    throw new Error(`Unknown surface: ${name}. Use npm run dev:surface -- list.`);
  return SURFACE_PROFILES[name];
}

/** Keep profile and selected identity explicit while preserving production route names. */
export function surfaceUrl(origin, options) {
  const profile = getSurfaceProfile(options.profile);
  const url = new URL(profile.route, origin);
  url.searchParams.set('profile', options.profile);
  for (const key of ['id', 'locale', 'theme'])
    if (options[key]) url.searchParams.set(key, options[key]);
  return url.href;
}
