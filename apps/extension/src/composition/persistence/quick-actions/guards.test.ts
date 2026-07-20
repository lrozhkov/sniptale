import { describe, expect, it } from 'vitest';

import { parseStoredQuickActions, parseStoredQuickActionsDisplayMode } from './guards';

describe('quick-action storage guards', () => {
  it('normalizes legacy after-capture values and counts invalid entries', () => {
    expect(
      parseStoredQuickActions([
        {
          id: 'action-1',
          status: true,
          name: 'Action',
          icon: 'Camera',
          screenshotMode: 'visible',
          exitAfterCapture: true,
          afterCapture: 'download',
        },
        { id: 'broken-entry' },
      ])
    ).toEqual({
      actions: [
        expect.objectContaining({
          afterCapture: 'download_default',
          id: 'action-1',
        }),
      ],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });

  it('accepts only supported display modes', () => {
    expect(parseStoredQuickActionsDisplayMode('row')).toBe('row');
    expect(parseStoredQuickActionsDisplayMode('broken')).toBeNull();
  });
});
