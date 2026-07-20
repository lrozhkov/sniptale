// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  resetZoom: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomToFit: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/editor-chrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/editor-chrome')>()),
  EDITOR_TOOLBAR_SECTION_CLASS_NAME:
    'flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 px-0.5 sm:flex-nowrap sm:px-1.5',
}));
vi.mock('@sniptale/ui/product-menus/dropdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-menus/dropdown')>()),
  ProductDropdownItem: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}>
      {props.children}
    </button>
  ),
  ProductDropdownMenu: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <div>{props.children}</div>
  ),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => controllerMocks,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  EditorIconButton: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <button
      type="button"
      title={String(props['title'])}
      aria-label={String(props['title'])}
      onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}
      disabled={Boolean(props['disabled'])}
    >
      {props.children}
    </button>
  ),
}));

import {
  EditorToolbarCanvasSection,
  EditorToolbarPrimarySection,
  EditorToolbarRasterSection,
  EditorToolbarWorkspaceSection,
  EditorToolbarZoomSection,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function clickButton(selector: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(selector)?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

function registerPrimarySectionTest() {
  it('routes the single text button through the normal tool activation flow', () => {
    const onActivateTool = vi.fn();
    const onToggleInspector = vi.fn();

    render(
      <EditorToolbarPrimarySection
        activeInspector="tool"
        activeTool="text"
        hasImage={true}
        isToolButtonActive={(tool) => tool === 'text'}
        onActivateTool={onActivateTool}
        onToggleInspector={onToggleInspector}
      />
    );

    clickButton('[title="editor.tools.text"]');

    expect(onActivateTool).toHaveBeenCalledWith('text');
    expect(onToggleInspector).not.toHaveBeenCalled();
  });
}

function registerSurfaceRoutingTest() {
  it('routes canvas, workspace, and zoom sections through their dedicated actions', () => {
    const actions = createWorkspaceSectionActions();
    const onActivateTool = vi.fn();

    render(renderToolbarSectionSurface(actions, true, onActivateTool));
    expectWorkspaceButtonOrder();

    clickButton('[title="editor.tools.selection"]');
    clickButton('[title="editor.tools.eraser"]');
    clickButton('[title="editor.tools.fill"]');
    clickButton('[title="editor.toolbar.crop"]');
    clickButton('[title="editor.toolbar.workspace"]');
    clickButton('[title="editor.toolbar.gridMode"]');
    clickButton('[title="editor.toolbar.magnetMode"]');
    clickButton('[title="editor.toolbar.viewportNavigation"]');
    clickButton('[title="editor.toolbar.zoomOut"]');
    clickButton('[title="editor.toolbar.zoomIn"]');
    clickButton('[aria-label*="editor.toolbar.fitToWindow"]');

    expect(actions.onActivateCrop).toHaveBeenCalledOnce();
    expect(onActivateTool).toHaveBeenNthCalledWith(1, 'selection');
    expect(onActivateTool).toHaveBeenNthCalledWith(2, 'eraser');
    expect(onActivateTool).toHaveBeenNthCalledWith(3, 'fill');
    expect(actions.onToggleInspector).not.toHaveBeenCalledWith('canvas-size');
    expect(actions.onToggleWorkspace).toHaveBeenCalledOnce();
    expect(actions.onToggleGrid).toHaveBeenCalledOnce();
    expect(actions.onToggleMagnet).toHaveBeenCalledOnce();
    expect(actions.onToggleViewportPreview).toHaveBeenCalledOnce();
    expect(controllerMocks.zoomOut).toHaveBeenCalledOnce();
    expect(controllerMocks.zoomIn).toHaveBeenCalledOnce();
    expect(controllerMocks.zoomToFit).toHaveBeenCalledOnce();
  });
}

function registerZoomResetTest() {
  it('resets zoom instead of fitting when the current zoom differs from 100%', () => {
    render(<EditorToolbarZoomSection hasImage={true} zoomPercent={140} />);

    clickButton('[aria-label*="editor.toolbar.resetZoomPrefix"]');

    expect(controllerMocks.resetZoom).toHaveBeenCalledOnce();
    expect(controllerMocks.zoomToFit).not.toHaveBeenCalled();
  });
}

function registerNoImageGuardTest() {
  it('keeps toolbar sections inert when no image is loaded', () => {
    const actions = createWorkspaceSectionActions();

    render(
      <>
        <EditorToolbarPrimarySection
          activeInspector="tool"
          activeTool="text"
          hasImage={false}
          isToolButtonActive={() => false}
          onActivateTool={vi.fn()}
          onToggleInspector={() => undefined}
        />
        {renderToolbarSectionSurface(actions, false, vi.fn())}
      </>
    );

    clickButton('[title="editor.toolbar.file · editor.toolbar.documentRequiredReason"]');
    clickButton('[title="editor.tools.selection · editor.toolbar.documentRequiredReason"]');
    clickButton('[title="editor.toolbar.crop · editor.toolbar.documentRequiredReason"]');
    clickButton('[title="editor.toolbar.workspace · editor.toolbar.documentRequiredReason"]');
    clickButton('[aria-label*="editor.toolbar.documentRequiredReason"]');

    expect(actions.onActivateCrop).not.toHaveBeenCalled();
    expect(actions.onToggleInspector).not.toHaveBeenCalled();
    expect(actions.onToggleGrid).not.toHaveBeenCalled();
    expect(actions.onToggleMagnet).not.toHaveBeenCalled();
    expect(actions.onToggleViewportPreview).not.toHaveBeenCalled();
    expect(actions.onToggleWorkspace).not.toHaveBeenCalled();
    expect(controllerMocks.resetZoom).not.toHaveBeenCalled();
    expect(controllerMocks.zoomToFit).not.toHaveBeenCalled();
  });
}

function createWorkspaceSectionActions() {
  return {
    onActivateCrop: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleInspector: vi.fn(),
    onToggleMagnet: vi.fn(),
    onToggleViewportPreview: vi.fn(),
    onToggleWorkspace: vi.fn(),
  };
}

function expectWorkspaceButtonOrder() {
  const buttonTitles = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).map((button) => button.title);

  expect(buttonTitles.indexOf('editor.toolbar.workspace')).toBeLessThan(
    buttonTitles.indexOf('editor.toolbar.magnetMode')
  );
  expect(buttonTitles.indexOf('editor.toolbar.magnetMode')).toBeLessThan(
    buttonTitles.indexOf('editor.toolbar.gridMode')
  );
}

function renderToolbarSectionSurface(
  actions: ReturnType<typeof createWorkspaceSectionActions>,
  hasImage = true,
  onActivateTool = vi.fn()
) {
  return (
    <>
      <EditorToolbarRasterSection
        hasImage={hasImage}
        isToolButtonActive={() => false}
        onActivateTool={onActivateTool}
      />
      <EditorToolbarCanvasSection
        hasImage={hasImage}
        isCropActive={false}
        onActivateCrop={actions.onActivateCrop}
      />
      <EditorToolbarWorkspaceSection
        gridEnabled={hasImage}
        hasImage={hasImage}
        inspector={hasImage ? 'workspace' : 'tool'}
        magnetEnabled={false}
        viewportPreviewOpen={false}
        onToggleGrid={actions.onToggleGrid}
        onToggleMagnet={actions.onToggleMagnet}
        onToggleViewportPreview={actions.onToggleViewportPreview}
        onToggleWorkspace={actions.onToggleWorkspace}
      />
      <EditorToolbarZoomSection hasImage={hasImage} zoomPercent={100} />
    </>
  );
}

describe('editor-toolbar sections', () => {
  registerPrimarySectionTest();
  registerSurfaceRoutingTest();
  registerZoomResetTest();
  registerNoImageGuardTest();
});
