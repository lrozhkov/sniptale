import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => ({
  translate: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: translateMock.translate,
}));

import { getClipActionLabel, getClipActionTitle, getSplitActionTitle } from './labels';

describe('clip actions labels', () => {
  it('returns stable action labels and selection-required titles', () => {
    expect(getClipActionLabel('split')).toBe('translated:videoEditor.timeline.split');
    expect(getClipActionLabel('duplicate')).toBe('translated:videoEditor.timeline.duplicate');
    expect(getClipActionLabel('delete')).toBe('translated:videoEditor.timeline.delete');
    expect(getClipActionTitle('split', true)).toContain('translated:videoEditor.timeline.split');
    expect(getSplitActionTitle(false)).toBe(
      'translated:videoEditor.timeline.splitUnavailableTitle'
    );
    expect(getSplitActionTitle(true)).toBe(
      'translated:videoEditor.timeline.split (translated:videoEditor.timeline.splitShortcut)'
    );
    expect(getClipActionTitle('duplicate', false)).toBe(
      'translated:videoEditor.timeline.duplicate (translated:videoEditor.timeline.duplicateShortcut)'
    );
    expect(getClipActionTitle('delete', false)).toBe(
      'translated:videoEditor.timeline.delete (translated:videoEditor.timeline.deleteShortcut)'
    );
    expect(getClipActionTitle('duplicate', true, false)).toBe(
      'translated:videoEditor.timeline.clipLockedTitle'
    );
    expect(getSplitActionTitle(false, false)).toBe(
      'translated:videoEditor.timeline.clipLockedTitle'
    );
  });
});
