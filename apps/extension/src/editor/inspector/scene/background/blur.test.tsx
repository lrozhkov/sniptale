// @vitest-environment jsdom

import { act, useState } from 'react';
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
  const range = host.querySelector<HTMLInputElement>(
    `input[aria-label="${label} range"][type="range"]`
  )!;
  expect(numericInput.value).toBe('6');
  expect(range.min).toBe('0');
  expect(range.max).toBe('25');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, '14');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(applyFramePatch).not.toHaveBeenCalled();
  expect(range.value).toBe('14');
  act(() => range.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' })));
  expect(applyFramePatch).toHaveBeenCalledTimes(1);
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundBlurAmount: 14 });
  act(() => root.unmount());
  host.remove();
});

it('previews blur before release and accepts it once after the preview prop catches up', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const applyFramePatch = vi.fn();
  const previewFramePatch = vi.fn();
  function Harness() {
    const [frame, setFrame] = useState(DEFAULT_EDITOR_FRAME_SETTINGS);
    return (
      <EditorInspectorBackgroundBlurControl
        frameDraft={frame}
        applyFramePatch={applyFramePatch}
        previewFramePatch={(patch) => {
          previewFramePatch(patch);
          setFrame((current) => ({ ...current, ...patch }));
        }}
      />
    );
  }
  act(() => root.render(<Harness />));
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(range, '14');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(previewFramePatch).toHaveBeenLastCalledWith({ backgroundBlurAmount: 14 });
  expect(applyFramePatch).not.toHaveBeenCalled();
  act(() => range.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' })));
  act(() => range.dispatchEvent(new Event('blur', { bubbles: true })));
  expect(applyFramePatch).toHaveBeenCalledTimes(1);
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundBlurAmount: 14 });
  act(() => root.unmount());
  host.remove();
});
