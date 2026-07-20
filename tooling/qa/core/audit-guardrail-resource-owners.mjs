export const HOT_LOOP_PREFIXES = [
  'apps/extension/src/offscreen/project-export/',
  'apps/extension/src/features/video/composition/timeline/',
  'apps/extension/src/scenario-editor/canvas/',
  'apps/extension/src/scenario-editor/page-shell/project-echo',
  'apps/extension/src/video-editor/preview/stage/',
  'apps/extension/src/video-editor/runtime/session/',
  'apps/extension/src/video-editor/runtime/cursor-detection/model/',
];

export const HOT_LOOP_MESSAGE = [
  'Hot render/frame/echo loops should use indexed or budgeted work',
  'instead of repeated full scans/stringification/package generation.',
].join(' ');
