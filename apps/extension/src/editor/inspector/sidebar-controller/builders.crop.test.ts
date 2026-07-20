import { expect, it } from 'vitest';
import { mergeEditorInspectorDerivedState } from './builders';

it('passes crop selection through derived sidebar controller props', () => {
  const cropSelection = { height: 120, left: 3, top: 4, width: 240 };

  expect(
    mergeEditorInspectorDerivedState({
      browserFrame: null as never,
      cropReady: true,
      cropSelection,
      defaultImagePresetId: null,
      derived: { id: 'derived' } as never,
      savePresets: [],
      selection: { hasSelection: false } as never,
      workspace: { id: 'workspace' } as never,
    })
  ).toEqual(
    expect.objectContaining({
      cropReady: true,
      cropSelection,
      id: 'derived',
    })
  );
});
