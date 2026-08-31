// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import { ScenarioV3FloatingChrome } from '.';
import { createFloatingProps } from './test-support';

vi.mock('../../inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector')>()),
  ScenarioInspectorPanel: () => <div data-testid="floating-inspector" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('routes the compact guide actions and omits presentation authoring tools', () => {
  const props = createFloatingProps();
  renderChrome(props);

  click(translate('scenario.editor.export'));
  click(translate('scenario.editor.aiEditorTool'));
  click(translate('scenario.editor.undo'));
  click(translate('scenario.editor.redo'));
  click(translate('scenario.editor.addStep'));
  importScreenshot();

  expect(props.onOpenExport).toHaveBeenCalledOnce();
  expect(props.onToggleAi).toHaveBeenCalledOnce();
  expect(props.editor.history.undo).toHaveBeenCalledOnce();
  expect(props.editor.history.redo).toHaveBeenCalledOnce();
  expect(props.editor.slideActions.addSlide).toHaveBeenCalledOnce();
  expect(props.editor.elementActions.insertImageFile).toHaveBeenCalledWith(expect.any(File));
  for (const removedUi of [
    'scenario.floating.insert-panel.shape',
    'scenario.floating.insert-panel.arrow',
    'scenario.floating.insert-panel.callout',
    'scenario.floating.insert-panel.code',
    'scenario.floating.insert-panel.layouts',
    'scenario.floating.build-timeline',
  ]) {
    expect(queryUi(removedUi)).toBeNull();
  }
});

it('keeps only edit, guide preview, and zoom workspace controls', () => {
  const props = createFloatingProps();
  renderChrome(props);

  click(translate('scenario.editor.modePlay'));
  click(translate('scenario.editor.zoomOut'));
  click(translate('scenario.editor.zoomIn'));

  expect(props.onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.play);
  expect(props.canvasControls.onZoomOut).toHaveBeenCalledOnce();
  expect(props.canvasControls.onZoomIn).toHaveBeenCalledOnce();
  expect(queryUi('scenario.floating.workspace-panel.mode-presenter')).toBeNull();
  expect(queryUi('scenario.floating.workspace-panel.mode-overview')).toBeNull();
  expect(queryUi('scenario.floating.workspace-panel.grid')).toBeNull();

  const fitProps = createFloatingProps({
    canvasControls: { scale: 1, zoomMode: 'custom' },
  });
  renderChrome(fitProps);
  click(
    `${translate('scenario.editor.fitToView')} · ${translate(
      'scenario.editor.zoomCurrentPrefix'
    )} 100%`
  );
  expect(fitProps.canvasControls.onFit).toHaveBeenCalledOnce();
});

it('keeps save failure and retry visible in the document bar', () => {
  const retrySave = vi.fn(async () => null);
  renderChrome(
    createFloatingProps({ saveStatus: { error: 'Quota exceeded', retrySave, state: 'error' } })
  );

  expect(container?.textContent).toContain('Quota exceeded');
  click(translate('scenario.editor.v3Retry'));
  expect(retrySave).toHaveBeenCalledOnce();
});

it('keeps the edit route available while previewing the guide', () => {
  const props = createFloatingProps({ mode: SCENARIO_EDITOR_MODES.play });
  renderChrome(props);
  click(translate('scenario.editor.modeEdit'));

  expect(props.onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.edit);
  expect(queryUi('scenario.floating.insert-panel')).toBeNull();
});

function renderChrome(props: React.ComponentProps<typeof ScenarioV3FloatingChrome>) {
  act(() => root?.render(<ScenarioV3FloatingChrome {...props} />));
}

function click(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"], [title="${label}"]`
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function importScreenshot() {
  const input = container?.querySelector<HTMLInputElement>('input[accept="image/*"]');
  expect(input).not.toBeNull();
  const file = new File(['image'], 'step.png', { type: 'image/png' });
  act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}
