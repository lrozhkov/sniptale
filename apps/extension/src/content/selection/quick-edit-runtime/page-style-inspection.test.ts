import { describe, expect, it } from 'vitest';
import {
  isQuickEditStyleInspectorModeEnabled,
  setQuickEditStyleInspectorModeEnabled,
} from './page-style-inspection';

describe('quick-edit page-style inspection mode', () => {
  it('tracks the disposable style-inspector routing flag', () => {
    setQuickEditStyleInspectorModeEnabled(false);
    expect(isQuickEditStyleInspectorModeEnabled()).toBe(false);

    setQuickEditStyleInspectorModeEnabled(true);
    expect(isQuickEditStyleInspectorModeEnabled()).toBe(true);

    setQuickEditStyleInspectorModeEnabled(false);
    expect(isQuickEditStyleInspectorModeEnabled()).toBe(false);
  });
});
