import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => ({
  translate: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('../../../../../../platform/i18n', () => ({
  translate: translateMock.translate,
}));

import { getClipActionLabel, getClipActionTitle } from './labels';

describe('clip actions labels', () => {
  it('returns stable action labels and selection-required titles', () => {
    expect(getClipActionLabel('split')).toBe('translated:videoEditor.timeline.split');
    expect(getClipActionLabel('duplicate')).toBe('translated:videoEditor.timeline.duplicate');
    expect(getClipActionLabel('delete')).toBe('translated:videoEditor.timeline.delete');
    expect(getClipActionTitle('split', true)).toContain('translated:videoEditor.timeline.split');
  });
});
