import { describe, expect, it } from 'vitest';

import { highlighterMessages } from './index';
import { contentCalloutMessages } from '../content/callout';
import { contentInteractiveFrameMessages } from '../content/interactive-frame';
import { contentOverlayControlsMessages } from '../content/overlay-controls';
import { contentStepBadgeMessages } from '../content/step-badge';

function collectLocalizedValues(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node !== 'object' || node === null) return [];
  return Object.values(node).flatMap(collectLocalizedValues);
}

describe('highlighterMessages', () => {
  it('keeps the shared shadow label short across shipped locales', () => {
    expect(highlighterMessages.editor.shadowLabel).toEqual({
      ru: 'Тень',
      en: 'Shadow',
    });
  });

  it('uses template terminology across highlighter settings and content popovers', () => {
    const values = collectLocalizedValues({
      callout: contentCalloutMessages,
      frame: contentInteractiveFrameMessages,
      highlighter: highlighterMessages,
      overlay: contentOverlayControlsMessages,
      stepBadge: contentStepBadgeMessages,
    });

    expect(values.filter((value) => /пресет/i.test(value))).toEqual([]);
    expect(values.filter((value) => /\bpresets?\b/i.test(value))).toEqual([]);
  });

  it('keeps callout line controls separated into user-facing concepts', () => {
    expect(contentCalloutMessages.manualConnector).toEqual({ ru: 'Указатель', en: 'Pointer' });
    expect(contentCalloutMessages.connectorSection).toEqual({
      ru: 'Тип указателя',
      en: 'Pointer type',
    });
    expect(contentCalloutMessages.routingLabel).toEqual({ ru: 'Форма линии', en: 'Line shape' });
    expect(contentCalloutMessages.lineStyleLabel).toEqual({
      ru: 'Стиль линии',
      en: 'Line style',
    });
  });
});
