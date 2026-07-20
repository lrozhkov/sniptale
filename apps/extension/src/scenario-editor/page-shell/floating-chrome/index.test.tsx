// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import { ScenarioV3FloatingChrome } from '.';
import { createFloatingProps } from './test-support';
import type { ScenarioV3FloatingChromeProps } from './types';

vi.mock('../../inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector')>()),
  ScenarioInspectorPanel: (props: {
    activeTool?: 'export' | 'grid' | null;
    embedded?: boolean;
    exportCommand?: { onOpenExport: () => void };
    hideLayers?: boolean;
  }) => (
    <div
      data-embedded={String(props.embedded)}
      data-hide-layers={String(props.hideLayers)}
      data-testid="floating-inspector"
    >
      {props.activeTool === 'export' ? (
        <button
          type="button"
          data-testid="floating-inspector-export"
          onClick={props.exportCommand?.onOpenExport}
        />
      ) : null}
    </div>
  ),
}));

vi.mock('../../inspector/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/layers')>()),
  ScenarioLayersInspector: (props: { layersCollapsible?: boolean }) => (
    <div data-collapsible={String(props.layersCollapsible)} data-testid="floating-layers-panel" />
  ),
}));

vi.mock('../slide-rail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../slide-rail')>()),
  ScenarioSlideRail: (props: { embedded?: boolean; onToggleTemplatePicker: () => void }) => (
    <div data-embedded={String(props.embedded)} data-testid="floating-slide-rail">
      <button
        type="button"
        aria-label={translate('scenario.editor.layouts')}
        onClick={props.onToggleTemplatePicker}
      />
    </div>
  ),
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

describe('scenario v3 floating chrome', () => {
  registerDocumentInsertActionTests();
  registerInspectorCommandTests();
  registerInspectorVisibilityTests();
  registerInsertIntentTests();
  registerDocumentBarTests();
  registerViewControlTests();
  registerModeControlTests();
});

function registerDocumentInsertActionTests() {
  it('routes document, insert, and workspace actions through the editor controller', () => {
    const props = createFloatingProps();
    renderChrome(props);

    expect(queryUi('scenario.floating.insert-panel.text')).not.toBeNull();
    expect(queryUi('scenario.floating.insert-panel.callout')).not.toBeNull();
    expect(queryUi('scenario.floating.insert-panel.image')).not.toBeNull();
    expect(queryUi('scenario.floating.insert-panel.layouts')).not.toBeNull();
    expect(queryUi('scenario.floating.insert-panel.add-slide')).not.toBeNull();
    clickByLabel(translate('scenario.editor.export'));
    clickByLabel(translate('scenario.editor.aiEditorTool'));
    clickByLabel(translate('scenario.editor.undo'));
    clickByLabel(translate('scenario.editor.redo'));
    clickByLabel(translate('scenario.editor.modePlay'));
    clickByLabel(translate('scenario.editor.insertText'));
    clickByLabel(translate('scenario.editor.insertCallout'));
    importFile(translate('scenario.editor.insertImage'));
    clickByLabel(translate('scenario.editor.addSlide'));
    clickByLabel(translate('scenario.editor.toggleGrid'));

    expect(buttonsByLabel(translate('scenario.editor.toggleGrid'))).toHaveLength(1);
    expect(queryUi('scenario.floating.workspace-panel.grid')).not.toBeNull();
    expect(queryUi('scenario.floating.workspace-panel.mode-overview')).not.toBeNull();
    expect(props.onOpenExport).toHaveBeenCalled();
    expect(props.onToggleAi).toHaveBeenCalled();
    expect(props.editor.history.undo).toHaveBeenCalled();
    expect(props.editor.history.redo).toHaveBeenCalled();
    expect(props.onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.play);
    expect(props.onActiveInsertKindChange).toHaveBeenCalledWith('text');
    expect(props.onActiveInsertKindChange).toHaveBeenCalledWith('callout');
    expect(props.editor.elementActions.insertImageFile).toHaveBeenCalledWith(expect.any(File));
    expect(props.editor.slideActions.addSlide).toHaveBeenCalled();
    expect(props.canvasControls.onSetGridVisible).toHaveBeenCalledWith(false);
    expect(container?.querySelector<HTMLInputElement>('input[accept="image/*"]')).not.toBeNull();
  });
}

function registerInspectorCommandTests() {
  it('routes the floating inspector export command through page-shell ownership', () => {
    const props = createFloatingProps({ inspectorTool: 'export' });
    renderChrome(props);

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('[data-testid="floating-inspector-export"]')
        ?.click();
    });

    expect(props.onOpenExport).toHaveBeenCalledTimes(1);
  });
}

function registerInspectorVisibilityTests() {
  it('hides the floating inspector panel when the right panel is suppressed', () => {
    renderChrome(createFloatingProps({ rightPanelHidden: true }));

    expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  });

  it('collapses the floating inspector panel into its restore button', () => {
    renderChrome(createFloatingProps());

    clickByLabel(translate('editor.toolbar.collapseInspector'));

    expect(queryUi('scenario.floating.inspector.expand')).not.toBeNull();
    expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  });
}

function registerInsertIntentTests() {
  it('marks active insert tools and toggles the selected insert intent', () => {
    const props = createFloatingProps({ activeInsertKind: 'shape' });
    renderChrome(props);

    const shapeButton = queryUi('scenario.floating.insert-panel.shape');
    expect(shapeButton?.getAttribute('data-active')).toBe('true');
    clickByLabel(translate('scenario.editor.insertShape'));

    expect(props.onActiveInsertKindChange).toHaveBeenCalledWith(null);
  });
}

function registerDocumentBarTests() {
  it('surfaces save errors in the document bar with retry ownership', () => {
    const props = createFloatingProps({
      saveStatus: {
        error: 'Quota exceeded',
        retrySave: vi.fn(async () => undefined),
        state: 'error',
      },
    });
    renderChrome(props);

    expect(container?.textContent).toContain('Quota exceeded');
    clickByLabel(translate('scenario.editor.v3Retry'));

    expect(props.saveStatus?.retrySave).toHaveBeenCalled();
  });
}

function registerViewControlTests() {
  it('routes view controls and supports fit toggle state', () => {
    const props = createFloatingProps();
    renderChrome(props);

    clickByLabel(translate('scenario.editor.zoomOut'));
    clickByLabel(
      `${translate('scenario.editor.zoomToActualSize')} · ${translate(
        'scenario.editor.zoomCurrentPrefix'
      )} 80%`
    );
    clickByLabel(translate('scenario.editor.zoomIn'));
    clickByLabel(translate('scenario.editor.toggleMagnet'));
    clickByLabel(translate('scenario.editor.toggleSnapToGrid'));
    clickByLabel(translate('scenario.editor.toggleNavigator'));

    expect(props.canvasControls.onZoomOut).toHaveBeenCalled();
    expect(props.canvasControls.onZoomOne).toHaveBeenCalled();
    expect(props.canvasControls.onZoomIn).toHaveBeenCalled();
    expect(props.canvasControls.onSetMagnetEnabled).toHaveBeenCalledWith(true);
    expect(props.canvasControls.onSetSnapToGrid).toHaveBeenCalledWith(true);
    expect(props.canvasControls.onSetNavigatorVisible).toHaveBeenCalledWith(true);

    const fitProps = createFloatingProps({
      canvasControls: { scale: 1, zoomMode: 'custom' },
    });
    renderChrome(fitProps);
    clickByLabel(
      `${translate('scenario.editor.fitToView')} · ${translate(
        'scenario.editor.zoomCurrentPrefix'
      )} 100%`
    );
    expect(fitProps.canvasControls.onFit).toHaveBeenCalled();
  });
}

function registerModeControlTests() {
  it('keeps mode controls available outside edit mode', () => {
    const props = createFloatingProps({ mode: SCENARIO_EDITOR_MODES.play });
    renderChrome(props);

    clickByLabel(translate('scenario.editor.modeEdit'));

    expect(props.onModeChange).toHaveBeenCalledWith(SCENARIO_EDITOR_MODES.edit);
    expect(container?.querySelector('[data-ui="scenario.floating.insert-panel"]')).toBeNull();
    expect(
      container?.querySelector('[data-ui="scenario.floating.workspace-panel"]')
    ).not.toBeNull();
  });
}

function renderChrome(props: ScenarioV3FloatingChromeProps) {
  act(() => {
    root?.render(<ScenarioV3FloatingChrome {...props} />);
  });
}

function clickByLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"], [title="${label}"]`
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function buttonsByLabel(label: string) {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>(
      `button[aria-label="${label}"], button[title="${label}"]`
    ) ?? []
  );
}

function importFile(label: string) {
  clickByLabel(label);
  const input = container?.querySelector<HTMLInputElement>('input[accept="image/*"]');
  expect(input).not.toBeNull();
  const file = new File(['image'], 'scenario.png', { type: 'image/png' });
  act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}
