export const CONTEXT_MENU_ROOT_ID = 'sniptale.root';
export const CONTEXT_MENU_SCREENSHOTS_ID = 'sniptale.screenshots';
export const CONTEXT_MENU_SCREENSHOTS_PREPARE_ID = 'sniptale.screenshots.prepare';
export const CONTEXT_MENU_SCREENSHOTS_SEPARATOR_ID = 'sniptale.screenshots.separator';
export const CONTEXT_MENU_VIDEO_ID = 'sniptale.video';
export const CONTEXT_MENU_VIDEO_TAB_ID = 'sniptale.video.tab';
export const CONTEXT_MENU_VIDEO_AREA_ID = 'sniptale.video.area';
export const CONTEXT_MENU_VIDEO_PRESET_ID = 'sniptale.video.preset';
export const CONTEXT_MENU_VIDEO_WINDOW_ID = 'sniptale.video.window';
export const CONTEXT_MENU_EXPORT_ID = 'sniptale.export';
export const CONTEXT_MENU_EXPORT_START_ID = 'sniptale.export.start';
export const CONTEXT_MENU_EXPORT_SEPARATOR_ID = 'sniptale.export.separator';
export const CONTEXT_MENU_EXPORT_COPY_JSON_ID = 'sniptale.export.copy-json';
export const CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID = 'sniptale.export.copy-markdown';
export const CONTEXT_MENU_IMAGE_EDITOR_ID = 'sniptale.image-editor';
export const CONTEXT_MENU_VIDEO_EDITOR_ID = 'sniptale.video-editor';
export const CONTEXT_MENU_GALLERY_ID = 'sniptale.gallery';
export const CONTEXT_MENU_SETTINGS_SEPARATOR_ID = 'sniptale.settings.separator';
export const CONTEXT_MENU_SETTINGS_ID = 'sniptale.settings';

const CONTEXT_MENU_QUICK_ACTION_PREFIX = 'sniptale.screenshots.quick-action.';

export function buildContextMenuQuickActionId(actionId: string): string {
  return `${CONTEXT_MENU_QUICK_ACTION_PREFIX}${actionId}`;
}

export function parseContextMenuQuickActionId(menuId: string): string | null {
  if (!menuId.startsWith(CONTEXT_MENU_QUICK_ACTION_PREFIX)) {
    return null;
  }

  return menuId.slice(CONTEXT_MENU_QUICK_ACTION_PREFIX.length) || null;
}
