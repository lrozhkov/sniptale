import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LAUNCH_PREFERENCES,
  normalizePageLaunchPreferences,
  parsePageLaunchPreferences,
  PAGE_CORNERS,
} from './page-launch';
describe('page launcher preferences', () => {
  it('keeps all new surfaces off and the popup list on until explicitly configured', () => {
    expect(normalizePageLaunchPreferences(undefined)).toEqual({
      enabled: false,
      hoverOnly: false,
      corner: 'bottom-right',
      quickActionsPopup: true,
      quickActionsCorner: false,
      quickActionsToolbar: false,
    });
    expect(parsePageLaunchPreferences({ enabled: true, quickActionsToolbar: true })).toEqual({
      ...DEFAULT_PAGE_LAUNCH_PREFERENCES,
      enabled: true,
      quickActionsToolbar: true,
    });
    for (const corner of PAGE_CORNERS)
      expect(parsePageLaunchPreferences({ corner })?.corner).toBe(corner);
  });
  it('refuses malformed values and never mutates the shared defaults', () => {
    for (const value of [
      null,
      [],
      3,
      { enabled: 'yes' },
      { corner: 'center' },
      { hoverOnly: 1 },
      { quickActionsPopup: null },
    ]) {
      expect(parsePageLaunchPreferences(value)).toBeNull();
      expect(normalizePageLaunchPreferences(value)).toEqual(DEFAULT_PAGE_LAUNCH_PREFERENCES);
    }
    const first = normalizePageLaunchPreferences({});
    first.enabled = true;
    expect(normalizePageLaunchPreferences({}).enabled).toBe(false);
  });
});
