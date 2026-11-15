// @vitest-environment jsdom

import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  flushAsyncWork,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { useEditorStore } from '../../state/useEditorStore';

it('opens layer-effects from the hovered layer row actions even when file mode is active', async () => {
  const controller = {
    ...createControllerMock(),
    rasterizeLayer: vi.fn(async () => true),
  };
  const { EditorInspectorSidebar } = await import('.');

  resetEditorStore({ inspector: 'file' });
  renderWithController(<EditorInspectorSidebar hasImage />, controller);
  await flushAsyncWork();

  const layerRow = document.querySelector<HTMLDivElement>('[data-editor-layer-id="layer-1"]');
  expect(layerRow).not.toBeNull();

  expect(useEditorStore.getState().inspector).toBe('file');

  await act(async () => {
    layerRow!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await flushAsyncWork();

  const adjustmentsButton = layerRow!.querySelector<HTMLButtonElement>(
    '[data-ui="editor.layers.rasterize-and-adjust"]'
  );

  expect(adjustmentsButton).not.toBeNull();

  await act(async () => {
    adjustmentsButton!.click();
  });
  await flushAsyncWork();

  const adjustmentsSegment = Array.from(document.querySelectorAll('button')).find(
    (button) =>
      button.getAttribute('aria-label') === translate('editor.toolbar.layerEffectsAdjustments')
  );

  expect(controller.rasterizeLayer).toHaveBeenCalledWith('layer-1');
  expect(useEditorStore.getState().inspector).toBe('layer-effects');
  expect(useEditorStore.getState().layerEffectsCategory).toBe('adjustments');
  expect(controller.selectLayer).toHaveBeenCalledWith('layer-1', { focusViewport: false });
  expect(document.body.textContent).toContain('Layer 1');
  expect(document.body.textContent).toContain(translate('editor.layerEffects.brightness'));
  expect(document.body.textContent).toContain(translate('editor.toolbar.layerEffectsApply'));
  expect(adjustmentsSegment?.getAttribute('aria-pressed')).toBe('true');
}, 30000);
