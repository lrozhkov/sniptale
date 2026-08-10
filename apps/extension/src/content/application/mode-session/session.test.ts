import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deactivateOtherContentModes,
  isContentModeEnabled,
  registerContentMode,
  setContentModeEnabled,
} from './session';

beforeEach(() => {
  setContentModeEnabled('highlighter', false);
  setContentModeEnabled('quick-edit', false);
  setContentModeEnabled('ai-pick', false);
  setContentModeEnabled('selection-mode', false);
  setContentModeEnabled('design-review', false);
  setContentModeEnabled('drawing', false);
});

describe('mode-session', () => {
  it('tracks enabled state per content mode', () => {
    expect(isContentModeEnabled('highlighter')).toBe(false);

    setContentModeEnabled('highlighter', true);
    setContentModeEnabled('selection-mode', true);

    expect(isContentModeEnabled('highlighter')).toBe(true);
    expect(isContentModeEnabled('selection-mode')).toBe(true);
    expect(isContentModeEnabled('quick-edit')).toBe(false);
  });

  it('disables only other enabled content modes', () => {
    const disableHighlighter = vi.fn();
    const disableQuickEdit = vi.fn();
    const disableAiPick = vi.fn();
    const disableDrawing = vi.fn();

    registerContentMode('highlighter', disableHighlighter);
    registerContentMode('quick-edit', disableQuickEdit);
    registerContentMode('ai-pick', disableAiPick);
    registerContentMode('drawing', disableDrawing);

    setContentModeEnabled('highlighter', true);
    setContentModeEnabled('quick-edit', true);
    setContentModeEnabled('ai-pick', false);
    setContentModeEnabled('drawing', true);

    deactivateOtherContentModes('quick-edit');

    expect(disableHighlighter).toHaveBeenCalledTimes(1);
    expect(disableQuickEdit).not.toHaveBeenCalled();
    expect(disableAiPick).not.toHaveBeenCalled();
    expect(disableDrawing).toHaveBeenCalledTimes(1);
  });
});
