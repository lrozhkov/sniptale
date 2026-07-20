/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const childSpies = vi.hoisted(() => ({
  inspectorBridge: vi.fn(),
  layersInspector: vi.fn(),
  slideRail: vi.fn(),
}));

vi.mock('../../inspector/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/layers')>()),
  ScenarioLayersInspector: (props: { onSelectElement: (elementId: string) => void }) => {
    childSpies.layersInspector(props);
    return (
      <button
        type="button"
        aria-label="select layer"
        onClick={() => props.onSelectElement('e-1')}
      />
    );
  },
}));

vi.mock('../slide-rail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../slide-rail')>()),
  ScenarioSlideRail: (props: { onSelectSlide: (slideId: string) => void }) => {
    childSpies.slideRail(props);
    return (
      <button type="button" aria-label="select slide" onClick={() => props.onSelectSlide('s-1')} />
    );
  },
}));

vi.mock('../scenario-inspector-panel-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario-inspector-panel-bridge')>()),
  ScenarioEditorInspectorPanelBridge: (props: { inspectorTool: 'export' | null }) => {
    childSpies.inspectorBridge(props);
    return <div data-testid="inspector-bridge" data-tool={props.inspectorTool ?? 'none'} />;
  },
}));

import { translate } from '../../../platform/i18n';
import { ScenarioFloatingDocumentBar } from './document-bar';
import { ScenarioFloatingPanels } from './panels';
import { createFloatingProps } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function clickByLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"], button[title="${label}"]`
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function clickByUi(dataUi: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[data-ui="${dataUi}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function createPanelProps(
  overrides: Partial<React.ComponentProps<typeof ScenarioFloatingPanels>> = {}
): React.ComponentProps<typeof ScenarioFloatingPanels> {
  const props = createFloatingProps();
  return {
    assets: props.assets,
    canvasControls: props.canvasControls,
    editor: props.editor,
    inspectorTool: props.inspectorTool,
    templatePickerOpen: props.templatePickerOpen,
    templates: props.templates,
    onClearInspectorTool: props.onClearInspectorTool,
    onEditImageElement: props.onEditImageElement,
    onOpenExport: props.onOpenExport,
    onToggleTemplatePicker: props.onToggleTemplatePicker,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  childSpies.inspectorBridge.mockReset();
  childSpies.layersInspector.mockReset();
  childSpies.slideRail.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders every document save state and routes document actions', () => {
  const props = createFloatingProps();
  const retrySave = vi.fn(async () => undefined);

  renderNode(
    <ScenarioFloatingDocumentBar
      editor={props.editor}
      onOpenExport={props.onOpenExport}
      onToggleAi={props.onToggleAi}
    />
  );
  expect(container?.textContent).toContain(translate('common.states.draft'));
  expect(container?.querySelector('[data-state="idle"]')).not.toBeNull();

  for (const saveStatus of [
    { error: null, retrySave, state: 'saving' as const },
    { error: null, retrySave, state: 'saved' as const },
    { error: null, retrySave, state: 'idle' as const },
  ]) {
    renderNode(
      <ScenarioFloatingDocumentBar
        editor={props.editor}
        saveStatus={saveStatus}
        onOpenExport={props.onOpenExport}
        onToggleAi={props.onToggleAi}
      />
    );
  }

  renderNode(
    <ScenarioFloatingDocumentBar
      editor={props.editor}
      saveStatus={{ error: null, retrySave, state: 'error' }}
      onOpenExport={props.onOpenExport}
      onToggleAi={props.onToggleAi}
    />
  );
  expect(container?.textContent).toContain(translate('scenario.editor.v3SaveFailed'));

  renderNode(
    <ScenarioFloatingDocumentBar
      editor={props.editor}
      saveStatus={{ error: 'Save failed exactly', retrySave, state: 'error' }}
      onOpenExport={props.onOpenExport}
      onToggleAi={props.onToggleAi}
    />
  );
  clickByLabel(translate('scenario.editor.v3Retry'));
  clickByUi('scenario.floating.document-bar.export');
  clickByUi('scenario.floating.document-bar.ai');
  clickByUi('scenario.floating.document-bar.undo');
  clickByUi('scenario.floating.document-bar.redo');

  expect(container?.textContent).toContain('Save failed exactly');
  expect(retrySave).toHaveBeenCalled();
  expect(props.onOpenExport).toHaveBeenCalledOnce();
  expect(props.onToggleAi).toHaveBeenCalledOnce();
  expect(props.editor.history.undo).toHaveBeenCalledOnce();
  expect(props.editor.history.redo).toHaveBeenCalledOnce();
});

it('renders panel visibility, selection, collapse, and inspector title branches', () => {
  const hiddenProps = createPanelProps({ inspectorHidden: true });
  renderNode(<ScenarioFloatingPanels {...hiddenProps} />);
  expect(container?.querySelector('[data-ui="scenario.floating.right-stack"]')).toBeNull();

  const props = createPanelProps();
  renderNode(<ScenarioFloatingPanels {...props} />);
  expect(container?.textContent).toContain(translate('scenario.editor.slide'));
  clickByLabel('select slide');
  clickByLabel('select layer');
  clickByLabel(translate('editor.toolbar.collapseInspector'));
  expect(container?.querySelector('[data-ui="scenario.floating.inspector.expand"]')).not.toBeNull();
  clickByLabel(translate('scenario.editor.inspector'));

  expect(props.onClearInspectorTool).toHaveBeenCalledTimes(2);
  expect(props.editor.slideActions.selectSlide).toHaveBeenCalledWith('s-1');
  expect(props.editor.elementActions.selectElement).toHaveBeenCalledWith('e-1');
  expect(childSpies.inspectorBridge).toHaveBeenCalled();

  renderNode(<ScenarioFloatingPanels {...createPanelProps({ inspectorTool: 'export' })} />);
  expect(container?.textContent).toContain(translate('scenario.editor.export'));

  const elementProps = createPanelProps();
  elementProps.editor = { ...elementProps.editor, selectedElementId: 'e-1' };
  renderNode(<ScenarioFloatingPanels {...elementProps} />);
  expect(container?.textContent).toContain(translate('scenario.editor.element'));
});
