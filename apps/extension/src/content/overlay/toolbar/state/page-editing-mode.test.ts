import { describe, expect, it, vi } from 'vitest';
import { createPageEditingModeSelector } from './page-editing-mode';

function createSelector(overrides?: {
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  toggleResult?: boolean;
}) {
  const actions = {
    onAiPickContentStart: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    toggleQuickEditMode: vi.fn(async () => overrides?.toggleResult ?? true),
  };
  return {
    actions,
    select: createPageEditingModeSelector({
      quickEditDocumentMode: overrides?.quickEditDocumentMode ?? false,
      quickEditMode: overrides?.quickEditMode ?? false,
      ...actions,
    }),
  };
}

describe('createPageEditingModeSelector', () => {
  it('waits for Content Editing activation before enabling direct text editing', async () => {
    const { actions, select } = createSelector();

    await select('direct-text');

    expect(actions.toggleQuickEditMode).toHaveBeenCalledOnce();
    expect(actions.onToggleQuickEditDocumentMode).toHaveBeenCalledWith(true);
    expect(actions.toggleQuickEditMode.mock.invocationCallOrder[0]).toBeLessThan(
      actions.onToggleQuickEditDocumentMode.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('does not enable direct text editing when Content Editing activation fails', async () => {
    const { actions, select } = createSelector({ toggleResult: false });

    await select('direct-text');

    expect(actions.onToggleQuickEditDocumentMode).not.toHaveBeenCalled();
  });

  it('switches active Content Editing submodes without retoggling the parent mode', async () => {
    const directText = createSelector({ quickEditDocumentMode: true, quickEditMode: true });
    await directText.select('block-selection');
    expect(directText.actions.onToggleQuickEditDocumentMode).toHaveBeenCalledWith(false);
    expect(directText.actions.toggleQuickEditMode).not.toHaveBeenCalled();

    const blockSelection = createSelector({ quickEditMode: true });
    await blockSelection.select('ai');
    expect(blockSelection.actions.onAiPickContentStart).toHaveBeenCalledOnce();
    expect(blockSelection.actions.toggleQuickEditMode).not.toHaveBeenCalled();
  });

  it('requests the table on each click without retoggling Content Editing', async () => {
    const { actions, select } = createSelector();
    await select('ai');
    await select('ai');
    expect(actions.onAiPickContentStart).toHaveBeenCalledTimes(2);
    expect(actions.toggleQuickEditMode).not.toHaveBeenCalled();
  });
});
