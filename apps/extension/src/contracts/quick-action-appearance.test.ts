import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  createQuickActionAppearance,
  parseQuickActionAppearance,
  projectQuickActionAppearanceForTransfer,
} from './quick-action-appearance';

describe('quick-action appearance admission', () => {
  it('admits canonical defaults without an enabled decoration', () => {
    const value = createQuickActionAppearance();
    expect(parseQuickActionAppearance(value)).toEqual(
      expect.objectContaining({ header: null, information: value.information })
    );
  });
  it.each([null, {}, { background: {}, information: {} }])(
    'refuses incomplete appearance %j',
    (value) => {
      expect(parseQuickActionAppearance(value)).toBeNull();
    }
  );
  it('refuses remote artwork, oversized inputs and invalid numeric controls', () => {
    const value = createQuickActionAppearance();
    for (const patch of [
      { kind: 'image', imageDataUrl: 'https://example.com/a.png' },
      { padding: Infinity },
      { radius: -1 },
      { shadow: 129 },
      { imageDataUrl: 'a'.repeat(2_796_261) },
    ]) {
      expect(
        parseQuickActionAppearance({ ...value, background: { ...value.background, ...patch } })
      ).toBeNull();
    }
    expect(
      parseQuickActionAppearance({
        ...value,
        header: { ...DEFAULT_WINDOW_HEADER, title: 'a'.repeat(513) },
      })
    ).toBeNull();
    expect(
      parseQuickActionAppearance({
        ...value,
        information: { ...value.information, text: 'a'.repeat(2049) },
      })
    ).toBeNull();
  });
  it('exports a valid media-free appearance while retaining its controls', () => {
    const value = createQuickActionAppearance();
    value.background = {
      ...value.background,
      kind: 'image',
      imageDataUrl: 'data:image/png;base64,YQ==',
    };
    const exported = projectQuickActionAppearanceForTransfer(value);
    expect(exported.background).not.toHaveProperty('imageDataUrl');
    expect(exported.background.kind).toBe('none');
    expect(exported.background.padding).toBe(32);
    expect(parseQuickActionAppearance(exported)).not.toBeNull();
    expect(value.background.kind).toBe('image');
  });
});
