import { describe, expect, it } from 'vitest';

import {
  isPageStyleInspectorTab,
  isPageStyleProperty,
  PAGE_STYLE_ALLOWED_PROPERTIES,
  PAGE_STYLE_INSPECTOR_TABS,
} from '.';

describe('page style vocabulary', () => {
  it('accepts every declared property and rejects lookalikes', () => {
    for (const property of PAGE_STYLE_ALLOWED_PROPERTIES) {
      expect(isPageStyleProperty(property)).toBe(true);
    }
    expect(isPageStyleProperty('backgroundColor')).toBe(false);
    expect(isPageStyleProperty('--custom-property')).toBe(false);
    expect(isPageStyleProperty(null)).toBe(false);
  });

  it('accepts only canonical inspector tabs', () => {
    for (const tab of Object.values(PAGE_STYLE_INSPECTOR_TABS)) {
      expect(isPageStyleInspectorTab(tab)).toBe(true);
    }
    expect(isPageStyleInspectorTab('property')).toBe(false);
    expect(isPageStyleInspectorTab(undefined)).toBe(false);
  });
});
