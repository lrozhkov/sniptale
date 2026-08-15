// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import { translate } from '../../../../platform/i18n';

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
  const label = translate('editor.scene.backgroundBlurAmount');
  const numericInput = host.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"][type="text"]`
  )!;
  const range = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"][type="range"]`)!;
  expect(numericInput.value).toBe('6');
  expect(range.min).toBe('0');
  expect(range.max).toBe('25');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, '14');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundBlurAmount: 14 });
  act(() => root.unmount());
  host.remove();
});
