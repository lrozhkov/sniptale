// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorControllerProvider } from '../../application/controller-context';
import { EditorEmbedProvider } from '../../application/embed-context/context';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorToolbarTrailingControls } from './trailing-controls';

const { workspaceSectionMock, zoomSectionMock } = vi.hoisted(() => ({
  workspaceSectionMock: vi.fn(() => <div data-testid="workspace-section" />),
  zoomSectionMock: vi.fn(() => <div data-testid="zoom-section" />),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const storeMock = vi.hoisted(() => {
  const state = {
    activeTool: 'select',
    inspector: 'file',
    setActiveTool: vi.fn((activeTool: string) => {
      state.activeTool = activeTool;
      state.inspector = 'tool';
    }),
    updateWorkspace: vi.fn(),
    workspace: {
      magnetEnabled: false,
    },
  };

  return {
    state,
    useEditorStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
      setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
    }),
  };
});

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: storeMock.useEditorStore,
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  EditorToolbarDivider: () => <div data-testid="divider" />,
}));

vi.mock('./sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sections')>()),
  EditorToolbarWorkspaceSection: workspaceSectionMock,
  EditorToolbarZoomSection: zoomSectionMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  storeMock.state.activeTool = 'select';
  storeMock.state.inspector = 'file';
  storeMock.state.workspace.magnetEnabled = false;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createBeforeSelectionAwareAction() {
  return vi.fn(() => {
    useEditorStore.getState().setActiveTool('select');
  });
}

function renderTrailingControlsRoot(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function renderTrailingControls(args: {
  hasImage?: boolean;
  mode?: 'scenario' | null;
  onBeforeSelectionAwareAction?: () => void;
  onApply?: (() => Promise<void>) | null;
}) {
  const onApply = args.onApply ?? vi.fn().mockResolvedValue(undefined);
  const onBeforeSelectionAwareAction =
    args.onBeforeSelectionAwareAction ?? createBeforeSelectionAwareAction();
  const controller = {
    clearSelection: vi.fn(),
  };
  renderTrailingControlsRoot(
    <EditorControllerProvider controller={controller as never}>
      <EditorEmbedProvider mode={args.mode ?? null} onApply={onApply} onClose={null}>
        <EditorToolbarTrailingControls
          gridEnabled={false}
          hasImage={args.hasImage ?? true}
          inspector="file"
          onBeforeSelectionAwareAction={onBeforeSelectionAwareAction}
          viewportPreviewOpen={false}
          zoomPercent={125}
          onSetViewportPreviewOpenManually={vi.fn()}
          onToggleInspector={vi.fn()}
        />
      </EditorEmbedProvider>
    </EditorControllerProvider>
  );

  return { controller, onApply, onBeforeSelectionAwareAction };
}

describe('EditorToolbarTrailingControls', () => {
  it('renders the scenario apply action only for image-backed embedded sessions', async () => {
    useEditorStore.setState({ activeTool: 'crop', inspector: 'layer-effects' });
    const { controller, onApply, onBeforeSelectionAwareAction } = renderTrailingControls({
      mode: 'scenario',
      hasImage: true,
    });

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('editor.documentActions.applyToScenario');
    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(onBeforeSelectionAwareAction).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().activeTool).toBe('select');
    expect(useEditorStore.getState().inspector).toBe('tool');
  });

  it('omits the scenario apply action when there is no embedded image session', () => {
    renderTrailingControls({ mode: null, hasImage: true });
    expect(container?.textContent).not.toContain('editor.documentActions.applyToScenario');

    renderTrailingControls({ mode: 'scenario', hasImage: false });
    expect(container?.textContent).not.toContain('editor.documentActions.applyToScenario');
  });

  it('keeps only workspace and zoom controls in the trailing chrome', () => {
    renderTrailingControls({ hasImage: true });

    expect(container?.textContent).not.toContain('common.states.saved');
    expect(container?.textContent).not.toContain('common.states.saving');
    expect((container?.firstElementChild as HTMLElement | null)?.className).toContain('flex-wrap');
    expect((container?.firstElementChild as HTMLElement | null)?.className).toContain(
      'justify-end'
    );
    expect(workspaceSectionMock).toHaveBeenCalledOnce();
    expect(zoomSectionMock).toHaveBeenCalledOnce();
  });
});
