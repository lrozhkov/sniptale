import { expect, it } from 'vitest';
import {
  getCompatibleVideoTransitionTemplateKinds,
  getVideoTransitionTemplateGroups,
  getVideoTransitionTemplateSelectionOrder,
  normalizeVideoProjectTransition,
} from './template';

it('normalizes transition template defaults and future-proof fields', () => {
  const transition = normalizeVideoProjectTransition({
    direction: 'bad' as never,
    duration: -1,
    easing: 'bad' as never,
    highlightColor: 12 as never,
    id: 'transition-1',
    intensity: 'bad' as never,
    kind: 'LIGHT_SWEEP' as never,
    leadingClipId: 'clip-a',
    renderKind: 'bad' as never,
    templateKind: 'LIGHT_SWEEP' as never,
    trailingClipId: 'clip-b',
  });

  expect(transition).toEqual(
    expect.objectContaining({
      direction: 'LEFT',
      duration: 0,
      easing: 'LINEAR',
      highlightColor: '#f97316',
      intensity: 'BALANCED',
      kind: 'LIGHT_SWEEP',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
    })
  );
});

it('drops unsupported highlight colors while keeping the template contract stable', () => {
  const transition = normalizeVideoProjectTransition({
    direction: 'RIGHT',
    duration: 240,
    easing: 'EASE_IN_OUT',
    highlightColor: '#ffffff',
    id: 'transition-2',
    intensity: 'BOLD',
    kind: 'CROSSFADE',
    leadingClipId: 'clip-a',
    renderKind: 'SHADER' as never,
    templateKind: 'CROSSFADE',
    trailingClipId: 'clip-b',
  });

  expect(transition).toEqual({
    direction: 'LEFT',
    duration: 240,
    easing: 'EASE_IN_OUT',
    id: 'transition-2',
    intensity: 'BOLD',
    kind: 'CROSSFADE',
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: 'CROSSFADE',
    trailingClipId: 'clip-b',
  });
});

it('re-exports grouped transition catalog helpers for sidebar consumers', () => {
  expect(getVideoTransitionTemplateSelectionOrder()).toEqual([
    'CROSSFADE',
    'FADE_THROUGH_LIGHT',
    'DIP_TO_COLOR',
    'PUSH',
    'SLIDE',
    'ZOOM_DISSOLVE',
    'BLUR_REVEAL',
    'LIGHT_SWEEP',
    'CARD_FLIP_REVEAL',
  ]);
  expect(getVideoTransitionTemplateGroups()).toHaveLength(3);
  expect(getCompatibleVideoTransitionTemplateKinds('LIGHT_SWEEP')).toEqual([
    'ZOOM_DISSOLVE',
    'BLUR_REVEAL',
    'CARD_FLIP_REVEAL',
  ]);
});

it('keeps direction support gated through the shared transition controls contract', () => {
  const crossfade = normalizeVideoProjectTransition({
    direction: 'RIGHT',
    duration: 0.4,
    easing: 'LINEAR',
    id: 'transition-3',
    intensity: 'BALANCED',
    kind: 'CROSSFADE',
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: 'CROSSFADE',
    trailingClipId: 'clip-b',
  });
  const push = normalizeVideoProjectTransition({
    direction: 'RIGHT',
    duration: 0.4,
    easing: 'LINEAR',
    id: 'transition-4',
    intensity: 'BALANCED',
    kind: 'PUSH',
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: 'PUSH',
    trailingClipId: 'clip-b',
  });

  expect(crossfade.direction).toBe('LEFT');
  expect(push.direction).toBe('RIGHT');
});
