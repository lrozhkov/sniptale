// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { useSelectionSettingsHistoryPreview } from './history-preview';

const state = vi.hoisted(() => ({ selectionToolSettings: { pencil: { width: 10 } } }));
vi.mock('../../state/useEditorStore', () => ({ useEditorStore: { getState: () => state } }));

it('records a new object edit to the old origin after canceling a numeric preview', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const commitHistory = vi.fn();
  const controller = {
    commitHistory,
    applyActiveSettingsToSelection: vi.fn(),
    previewActiveSettingsOnSelection: vi.fn(),
    refreshActiveToolSettingsPreview: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Surface() {
    const [value, setValue] = useState(10);
    const history = useSelectionSettingsHistoryPreview({
      controller,
      selectionSettingsEnabled: true,
    });
    const update = (width: number) => {
      state.selectionToolSettings = { pencil: { width } };
      setValue(width);
    };
    const preview = (width: number) => history.previewSelectionSettings(() => update(width));
    return (
      <>
        <button onClick={() => update(20)}>Select another object</button>
        <NumericRow
          label="Width"
          value={value}
          min={1}
          max={100}
          onPreviewValue={preview}
          onCommitValue={(next) => {
            preview(next);
            history.commitPendingSelectionSettings();
          }}
        />
      </>
    );
  }
  try {
    act(() => root.render(<Surface />));
    const field = host.querySelector<HTMLInputElement>('input')!;
    act(() => {
      field.focus();
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Width increase"]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(field.value).toBe('11');
    act(() =>
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
    act(() => window.dispatchEvent(new MouseEvent('pointerup')));
    expect(state.selectionToolSettings.pencil.width).toBe(10);
    expect(commitHistory).not.toHaveBeenCalled();
    act(() => host.querySelector('button')!.click());
    expect(field.value).toBe('20');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '10');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(state.selectionToolSettings.pencil.width).toBe(10);
    expect(commitHistory).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
