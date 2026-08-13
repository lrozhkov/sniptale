// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  NumericRow: (props: {
    label: string;
    min: number;
    max: number;
    value: number;
    onPreviewValue: (value: number) => void;
    onCommitValue: (value: number) => void;
  }) => (
    <div>
      <button type="button" onClick={() => props.onPreviewValue(12)}>
        preview
      </button>
      <button
        type="button"
        data-min={props.min}
        data-max={props.max}
        onClick={() => props.onCommitValue(14)}
      >
        {props.label}:{props.value}
      </button>
    </div>
  ),
}));

import { EditorInspectorBackgroundBlurControl } from './blur';

it('shows the localized bounded blur control and applies its value', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const applyFramePatch = vi.fn();
  act(() =>
    root.render(
      <EditorInspectorBackgroundBlurControl
        frameDraft={{ ...DEFAULT_EDITOR_FRAME_SETTINGS, backgroundBlurAmount: 6 }}
        applyFramePatch={applyFramePatch}
      />
    )
  );
  const buttons = host.querySelectorAll('button');
  const button = buttons[1]!;
  expect(button.textContent).toContain('6');
  expect(button.dataset['min']).toBe('0');
  expect(button.dataset['max']).toBe('25');
  act(() => {
    buttons[0]?.click();
    button.click();
  });
  expect(applyFramePatch).toHaveBeenNthCalledWith(1, { backgroundBlurAmount: 12 });
  expect(applyFramePatch).toHaveBeenNthCalledWith(2, { backgroundBlurAmount: 14 });
  act(() => root.unmount());
  host.remove();
});
