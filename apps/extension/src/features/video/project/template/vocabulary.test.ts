import { expect, it } from 'vitest';
import {
  getVideoOverlayAnimationDefinitions,
  getVideoOverlayAnimationLabelKey,
  getVideoTemplateDirectionLabelKey,
  getVideoTemplateDirectionDefinitions,
  getVideoTemplateIntensityLabelKey,
  getVideoTemplateIntensityDefinitions,
  getVideoTransitionEasingLabelKey,
  getVideoTransitionEasingDefinitions,
} from './vocabulary';

it('keeps template direction and intensity vocabulary shared across overlay and transition inspectors', () => {
  expect(getVideoTemplateDirectionDefinitions()).toEqual([
    { value: 'LEFT', labelKey: 'videoEditor.sidebar.annotationDirectionLeft' },
    { value: 'RIGHT', labelKey: 'videoEditor.sidebar.annotationDirectionRight' },
    { value: 'UP', labelKey: 'videoEditor.sidebar.annotationDirectionUp' },
    { value: 'DOWN', labelKey: 'videoEditor.sidebar.annotationDirectionDown' },
  ]);
  expect(getVideoTemplateIntensityDefinitions()).toEqual([
    { value: 'SOFT', labelKey: 'videoEditor.sidebar.annotationIntensitySoft' },
    { value: 'BALANCED', labelKey: 'videoEditor.sidebar.annotationIntensityBalanced' },
    { value: 'BOLD', labelKey: 'videoEditor.sidebar.annotationIntensityBold' },
  ]);
});

it('keeps overlay animation vocabulary and transition easing vocabulary stable', () => {
  expect(getVideoOverlayAnimationDefinitions().map((definition) => definition.value)).toEqual([
    'NONE',
    'SLIDE_UP_FADE',
    'SLIDE_LEFT_FADE',
    'CONNECTOR_DRAW',
    'ANCHOR_POP',
    'REVEAL_MASK',
    'SHIMMER_ENTRY',
    'SHIMMER_SWEEP',
    'SOFT_BLUR_REVEAL',
    'SCALE_FADE',
    'THREE_D_REVEAL',
  ]);
  expect(getVideoTransitionEasingDefinitions()).toEqual([
    { value: 'LINEAR', labelKey: 'videoEditor.sidebar.transitionEasingLinear' },
    { value: 'EASE_IN_OUT', labelKey: 'videoEditor.sidebar.transitionEasingEaseInOut' },
  ]);
});

it('resolves vocabulary label keys without inspector-local switch statements', () => {
  expect(getVideoTemplateDirectionLabelKey('DOWN')).toBe(
    'videoEditor.sidebar.annotationDirectionDown'
  );
  expect(getVideoTemplateIntensityLabelKey('BOLD')).toBe(
    'videoEditor.sidebar.annotationIntensityBold'
  );
  expect(getVideoOverlayAnimationLabelKey('CONNECTOR_DRAW')).toBe(
    'videoEditor.sidebar.annotationAnimationConnectorDraw'
  );
  expect(getVideoTransitionEasingLabelKey('EASE_IN_OUT')).toBe(
    'videoEditor.sidebar.transitionEasingEaseInOut'
  );
});
