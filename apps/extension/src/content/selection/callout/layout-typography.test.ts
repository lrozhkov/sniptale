// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getCalloutLayoutState } from './layout';
import { createDefaultCalloutSettings } from './model';

describe('callout layout typography', () => {
  it('keeps underline on the body so it cannot propagate into the title or badge', () => {
    const settings = createDefaultCalloutSettings();
    settings.style.typography.fontStyle = 'italic';
    settings.style.typography.textAlign = 'center';
    settings.style.typography.textDecoration = 'underline';

    const layout = getCalloutLayoutState({
      dimensions: { width: 160, height: 48 },
      frameRect: { x: 200, y: 200, width: 120, height: 80 },
      isEditing: false,
      settings,
      zIndex: 20,
    });

    expect(layout.cloudStyle.fontStyle).toBe('italic');
    expect(layout.cloudStyle.textAlign).toBe('center');
    expect(layout.cloudStyle.textDecoration).toBe('none');
    expect(layout.editableStyle.textDecoration).toBe('underline');
  });
});
