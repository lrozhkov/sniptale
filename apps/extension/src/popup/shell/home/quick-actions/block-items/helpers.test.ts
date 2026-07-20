import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../navigation/actions', (_importOriginal) => ({
  formatHotkeyShort: () => 'Ctrl+Shift+S',
  getQuickActionMeta: () => '',
}));

import {
  getQuickActionItemState,
  getQuickActionListButtonClassName,
  getQuickActionListIconClassName,
  shouldShowQuickActionMeta,
} from './helpers';

describe('popup quick action block helper styling', () => {
  it('maps every density to explicit button, icon, and meta visibility states', () => {
    expect(getQuickActionListButtonClassName('regular')).toContain('min-h-[58px]');
    expect(getQuickActionListButtonClassName('compact')).toContain('min-h-[48px]');
    expect(getQuickActionListButtonClassName('dense')).toContain('min-h-[40px]');
    expect(getQuickActionListButtonClassName('tight')).toContain('min-h-[28px]');

    expect(getQuickActionListIconClassName('regular')).toContain('h-9');
    expect(getQuickActionListIconClassName('compact')).toContain('h-9');
    expect(getQuickActionListIconClassName('dense')).toContain('h-7');
    expect(getQuickActionListIconClassName('tight')).toContain('h-6');

    expect(shouldShowQuickActionMeta('regular')).toBe(true);
    expect(shouldShowQuickActionMeta('compact')).toBe(true);
    expect(shouldShowQuickActionMeta('dense')).toBe(false);
    expect(shouldShowQuickActionMeta('tight')).toBe(false);
  });

  it('builds disabled quick action item state metadata and title fragments', () => {
    const state = getQuickActionItemState({
      action: {
        id: 'capture-visible',
        status: true,
        name: 'Capture visible',
        icon: 'camera',
        hotkey: {
          key: 'S',
          ctrlKey: true,
          shiftKey: true,
          altKey: false,
          metaKey: false,
        },
        screenshotMode: 'visible',
        emulation: null,
        delay: null,
        afterCapture: null,
        imageFormat: null,
        imageQuality: null,
        exitAfterCapture: false,
      },
      presets: [],
      disabledTitle: 'Unavailable',
    });

    expect(state.disabled).toBe(true);
    expect(state.meta).toBe('');
    expect(state.title).toContain('Unavailable');
  });
});
