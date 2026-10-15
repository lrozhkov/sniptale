import { describe, expect, it } from 'vitest';
import { resolveQuickEditShadow } from './shadow';
import { updateQuickEditBackground } from './background';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { reviewAdvancedContentBaseline } from '../document';
import { resolveQuickEditEffectiveState } from './effective';

const background = {
  enabled: true,
  type: 'solid',
  color: '#ffffffff',
  layout: { padding: 40, cornerRadius: 24, shadow: { intensity: 60, color: '#47556980' } },
} as const;
describe('quick edit outer shadow', () => {
  it('round trips content while legacy documents remain undecorated', () => {
    const state = { ...createQuickEditAdvancedState(), background };
    expect(loadQuickEditAdvancedState(state)?.background).toEqual(background);
    const content = reviewAdvancedContentBaseline(state);
    expect(loadQuickEditAdvancedContentState(content)).toEqual(content);
    expect(resolveQuickEditShadow(createQuickEditAdvancedState().background)).toBeNull();
    expect(resolveQuickEditShadow(resolveQuickEditEffectiveState(state).background)).toBeNull();
  });
  it.each([
    null,
    { intensity: -1, color: '#000000' },
    { intensity: 101, color: '#000000' },
    { intensity: NaN, color: '#000000' },
    { intensity: 1, color: 'url(https://invalid.test)' },
  ])('rejects malformed shadow %j', (shadow) => {
    expect(
      loadQuickEditAdvancedState({
        ...createQuickEditAdvancedState(),
        background: { ...background, layout: { ...background.layout, shadow } },
      })
    ).toBeNull();
  });
  it('preserves color and intensity through paint changes; zero removes the visual', () => {
    const gradient = updateQuickEditBackground(background, { type: 'gradient' });
    const image = updateQuickEditBackground(gradient, { type: 'image', assetId: 'asset' });
    expect(image.enabled && image.layout.shadow).toEqual(background.layout.shadow);
    expect(resolveQuickEditShadow(updateQuickEditBackground(image, { enabled: false }))).toBeNull();
    expect(
      resolveQuickEditShadow(
        updateQuickEditBackground(image, {
          layout: { ...background.layout, shadow: { ...background.layout.shadow, intensity: 0 } },
        })
      )
    ).toBeNull();
  });
  it('keeps intensity independent of resolution, scales spread once', () => {
    expect(resolveQuickEditShadow(background, 0.5)).toEqual({
      color: '#47556980',
      opacity: 0.6,
      blur: 22.5,
    });
    expect(resolveQuickEditShadow(background, 2)?.blur).toBe(90);
  });
});
