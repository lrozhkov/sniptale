import { describe, expect, it, vi } from 'vitest';

const { crudActionsSpy, dragActionsSpy, settingsActionsSpy } = vi.hoisted(() => ({
  crudActionsSpy: vi.fn(),
  dragActionsSpy: vi.fn(),
  settingsActionsSpy: vi.fn(),
}));

vi.mock('./crud-actions', () => ({
  createHighlighterCrudActions: (state: unknown) => crudActionsSpy(state),
}));

vi.mock('./drag-actions', () => ({
  createHighlighterDragActions: (state: unknown) => dragActionsSpy(state),
}));

vi.mock('./persistence-actions', () => ({
  createHighlighterSettingsActions: (state: unknown) => settingsActionsSpy(state),
}));

import { createHighlighterSectionActions } from './actions';

describe('createHighlighterSectionActions', () => {
  it('merges crud, settings, and drag action owners into one action bag', () => {
    const state = { settings: { enabled: true } };
    const crudActions = { handleAddPreset: vi.fn() };
    const settingsActions = { handleUpdateBlurSettings: vi.fn() };
    const dragActions = { handleDragStart: vi.fn() };

    crudActionsSpy.mockReturnValue(crudActions);
    settingsActionsSpy.mockReturnValue(settingsActions);
    dragActionsSpy.mockReturnValue(dragActions);

    expect(createHighlighterSectionActions(state as never)).toEqual({
      ...crudActions,
      ...settingsActions,
      ...dragActions,
    });
    expect(crudActionsSpy).toHaveBeenCalledWith(state);
    expect(settingsActionsSpy).toHaveBeenCalledWith(state);
    expect(dragActionsSpy).toHaveBeenCalledWith(state);
  });
});
