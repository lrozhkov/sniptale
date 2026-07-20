import { describe, expect, it } from 'vitest';

import { editorCompactShapeMessages } from './shape';

describe('editorCompactShapeMessages', () => {
  it('defines the expanded arrow head labels', () => {
    expect(editorCompactShapeMessages.arrowHeadOpen).toEqual({
      ru: 'Открытый',
      en: 'Open',
    });
    expect(editorCompactShapeMessages.arrowHeadBlock).toEqual({
      ru: 'Скругленный',
      en: 'Rounded',
    });
    expect(editorCompactShapeMessages.arrowStartHeadSize.en).toBe('Start size');
    expect(editorCompactShapeMessages.arrowEndHeadSize.en).toBe('End size');
    expect(editorCompactShapeMessages).not.toHaveProperty('arrowStyleStandard');
    expect(editorCompactShapeMessages).not.toHaveProperty('arrowStyleCurved');
    expect(editorCompactShapeMessages).not.toHaveProperty('arrowStyleOpen');
    expect(editorCompactShapeMessages).not.toHaveProperty('arrowStyleBlock');
  });
});
