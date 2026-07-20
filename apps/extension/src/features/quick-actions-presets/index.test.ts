import { describe, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../contracts/settings';
import { getBundledQuickActions, getQuickActionDisplayName, isBundledQuickAction } from './catalog';
import { sanitizeQuickActionsDisplayMode } from './display-mode';
import { mergeStoredQuickActions, normalizeQuickAction } from './normalization';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `translated:${key}`,
}));

function createUserAction(
  overrides: Omit<Partial<QuickAction>, 'afterCapture'> & {
    afterCapture?: Exclude<QuickAction['afterCapture'], undefined>;
  } = {}
): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    emulation: 'native',
    exitAfterCapture: true,
    hotkey: null,
    icon: 'UserIcon',
    id: 'user-action',
    imageFormat: 'png',
    imageQuality: null,
    name: 'Custom action',
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
    ...overrides,
  };
}

describe('quick-actions-presets bundled defaults', () => {
  it('builds the bundled presets with translated names and canonical defaults', () => {
    const bundledActions = getBundledQuickActions();

    expect(bundledActions).toHaveLength(6);
    expect(bundledActions[0]).toEqual(
      expect.objectContaining({
        afterCapture: 'download_default',
        bundledId: 'default-fullscreen',
        icon: 'MonitorDown',
        imageFormat: 'png',
        name: 'translated:shared.defaults.quickActionVisibleDownload',
        origin: 'bundled',
        screenshotMode: 'visible',
      })
    );
    expect(bundledActions[3]).toEqual(
      expect.objectContaining({
        bundledId: 'default-delayed-visible',
        delay: 5,
      })
    );
    expect(bundledActions[5]).toEqual(
      expect.objectContaining({
        afterCapture: 'copy',
        bundledId: 'default-copy-selection',
        screenshotMode: 'selection',
      })
    );
  });
});

describe('quick-actions-presets display names', () => {
  it('resolves bundled display names and keeps user-defined names intact', () => {
    expect(
      getQuickActionDisplayName(
        createUserAction({
          bundledId: 'default-edit-visible',
          id: 'renamed-action',
          name: 'Local override',
        })
      )
    ).toBe('translated:shared.defaults.quickActionVisibleEdit');

    expect(
      getQuickActionDisplayName(
        createUserAction({
          bundledId: null,
          id: 'external-action',
          name: 'External action',
        })
      )
    ).toBe('External action');
  });
});

describe('quick-actions-presets bundled detection', () => {
  it('detects bundled actions through bundled ids and bundled fallback ids', () => {
    expect(isBundledQuickAction(null)).toBe(false);
    expect(
      isBundledQuickAction(
        createUserAction({
          bundledId: 'default-selection',
          id: 'custom-user-id',
        })
      )
    ).toBe(true);
    expect(
      isBundledQuickAction(
        createUserAction({
          bundledId: null,
          id: 'default-copy-visible',
          origin: 'bundled',
        })
      )
    ).toBe(true);
    expect(
      isBundledQuickAction(
        createUserAction({
          bundledId: null,
          id: 'external-action',
        })
      )
    ).toBe(false);
  });
});

describe('quick-actions-presets bundled normalization', () => {
  it('normalizes bundled actions to canonical defaults and preserves explicit status', () => {
    const normalized = normalizeQuickAction(
      createUserAction({
        afterCapture: 'edit',
        bundledId: 'default-copy-visible',
        delay: 10,
        icon: 'UnexpectedIcon',
        id: 'renamed-id',
        name: 'Unexpected name',
        origin: 'bundled',
        screenshotMode: 'full',
        status: false,
      })
    );

    expect(normalized).toEqual(
      expect.objectContaining({
        afterCapture: 'copy',
        bundledId: 'default-copy-visible',
        delay: null,
        icon: 'ClipboardCopy',
        id: 'default-copy-visible',
        name: 'translated:shared.defaults.quickActionVisibleCopy',
        origin: 'bundled',
        screenshotMode: 'visible',
        status: false,
      })
    );
  });
});

describe('quick-actions-presets user normalization', () => {
  it('converts legacy user actions to normalized user actions', () => {
    const normalized = normalizeQuickAction(
      createUserAction({
        afterCapture: 'download' as Exclude<QuickAction['afterCapture'], undefined>,
        bundledId: null,
        id: 'custom-user-id',
        origin: 'user',
      })
    );

    expect(normalized).toEqual(
      expect.objectContaining({
        afterCapture: 'download_default',
        bundledId: null,
        id: 'custom-user-id',
        origin: 'user',
      })
    );
  });
});

describe('quick-actions-presets merge and display mode', () => {
  it('merges stored actions with bundled defaults and reports normalization changes', () => {
    const legacyUserAction = createUserAction({
      afterCapture: 'download' as Exclude<QuickAction['afterCapture'], undefined>,
    });
    const storedActions = [
      createUserAction({
        bundledId: 'default-selection',
        id: 'custom-selection-id',
        origin: 'bundled',
        status: false,
      }),
      legacyUserAction,
    ];

    const result = mergeStoredQuickActions(storedActions);

    expect(result.changed).toBe(true);
    expect(result.actions).toHaveLength(7);
    expect(result.actions[0]).toEqual(
      expect.objectContaining({
        bundledId: 'default-selection',
        id: 'default-selection',
        origin: 'bundled',
        status: false,
      })
    );
    expect(result.actions[1]).toEqual(
      expect.objectContaining({
        afterCapture: 'download_default',
        bundledId: null,
        id: 'user-action',
        origin: 'user',
      })
    );
  });

  it('keeps already normalized bundled sets unchanged and sanitizes display modes', () => {
    const bundledActions = getBundledQuickActions();
    const result = mergeStoredQuickActions(bundledActions);

    expect(result.changed).toBe(false);
    expect(result.actions).toEqual(bundledActions);

    expect(sanitizeQuickActionsDisplayMode('hidden')).toBe('hidden');
    expect(sanitizeQuickActionsDisplayMode('list')).toBe('list');
    expect(sanitizeQuickActionsDisplayMode('row')).toBe('list');
    expect(sanitizeQuickActionsDisplayMode(null)).toBe('list');
  });
});
