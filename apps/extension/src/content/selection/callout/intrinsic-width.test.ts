// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createDefaultCalloutSettings } from '../../../features/highlighter/frame-annotation/callout/model';
import { getCalloutLayoutState } from '../../../features/highlighter/frame-annotation/callout/layout';

describe('callout intrinsic text width', () => {
  it('keeps the card at least as wide as an unbreakable word at large font sizes', () => {
    const settings = createDefaultCalloutSettings();
    settings.content.bodyHtml = 'tadadam';
    settings.style.typography = {
      ...settings.style.typography,
      fontSize: 32,
      maxWidth: 100,
      wordBreak: 'normal',
    };

    const layout = getCalloutLayoutState({
      dimensions: { width: 100, height: 180 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      zIndex: 20,
    });

    expect(layout.cloudStyle).toMatchObject({
      maxWidth: 100,
      minWidth: 'min-content',
      width: 'max-content',
    });
    expect(layout.editableStyle).toMatchObject({
      minWidth: '1ch',
      overflowWrap: 'normal',
      wordBreak: 'normal',
    });
  });
});
