// @vitest-environment jsdom

import { act } from 'react';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  flushAsyncWork,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { useEditorStore } from '../../state/useEditorStore';

it('opens layer-effects from the hovered layer row actions even when file mode is active', async () => {
  const controller = createControllerMock();
  const { EditorInspectorSidebar } = await import('.');

  resetEditorStore({ inspector: 'file' });
  renderWithController(<EditorInspectorSidebar hasImage />, controller);
  await flushAsyncWork();

  const layerRow = Array.from(document.querySelectorAll<HTMLDivElement>('button[title="Layer 1"]'))
    .at(0)
    ?.closest('[class*="grid-cols-[auto_minmax(0,1fr)_auto]"]') as HTMLDivElement | undefined;

  expect(useEditorStore.getState().inspector).toBe('file');

  await act(async () => {
    layerRow?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await flushAsyncWork();

  const adjustmentsButton = layerRow?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.layers.effects-adjustments"]'
  );

  expect(adjustmentsButton).toBeDefined();

  await act(async () => {
    adjustmentsButton?.click();
  });
  await flushAsyncWork();

  expect(useEditorStore.getState().inspector).toBe('layer-effects');
  expect(useEditorStore.getState().layerEffectsCategory).toBe('adjustments');
  expect(controller.selectLayer).toHaveBeenCalledWith('layer-1', { focusViewport: false });
  expect(document.body.textContent).toContain('Layer 1');
  expect(document.body.textContent).toContain(translate('editor.layerEffects.brightness'));
  expect(document.body.textContent).toContain(translate('editor.toolbar.layerEffectsApply'));
  expect(document.body.textContent).not.toContain(
    translate('editor.toolbar.layerEffectsAdjustments')
  );
}, 30000);
