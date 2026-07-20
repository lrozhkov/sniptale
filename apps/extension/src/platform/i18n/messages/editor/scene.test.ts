import { describe, expect, it } from 'vitest';

import { editorSceneMessages } from './scene';

describe('editorSceneMessages', () => {
  it('defines the visible gradient angle label and removes the exact-input message key', () => {
    expect(editorSceneMessages.gradientAngleLabel).toEqual({
      ru: 'Угол',
      en: 'Angle',
    });
    expect(editorSceneMessages).not.toHaveProperty('gradientAngleExactAria');
  });
});
