// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   ownership test keeps preview pointer and keyboard flow assertions in single scenarios */
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  getEditorShellOwnershipMocks,
  renderWithController,
  resetEditorStore,
  setInputFiles,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

describe('canvas wrapper ownership seam', () => {
  it('mounts and disposes the provider-owned controller and forwards open-image requests', async () => {
    const { openEditorImageFromFileMock } = getEditorShellOwnershipMocks();
    const controller = createControllerMock();
    const { CanvasWrapper } = await import('.');

    resetEditorStore({ imageData: null, viewportPreviewOpen: false });
    renderWithController(<CanvasWrapper hasImage={false} />, controller);

    expect(controller.mount).toHaveBeenCalledOnce();

    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    expect(input).not.toBeNull();
    setInputFiles(input!, [new File(['image'], 'canvas.png', { type: 'image/png' })]);

    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(openEditorImageFromFileMock).toHaveBeenCalledWith(
      controller,
      expect.objectContaining({ name: 'canvas.png' }),
      expect.any(Function)
    );

    cleanupDom();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });

  it('renders the live canvas path with grid styling when an image is already loaded', async () => {
    const controller = createControllerMock();
    const { CanvasWrapper } = await import('.');

    resetEditorStore({
      viewportPreviewOpen: false,
      workspace: {
        ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
        backgroundColor: '#101010',
        gridColor: '#ff0000',
        gridEnabled: true,
        gridSize: 20,
      },
    });
    renderWithController(<CanvasWrapper hasImage />, controller);

    expect(controller.mount).toHaveBeenCalledOnce();
    expect(document.querySelector('canvas')).not.toBeNull();
    expect(document.querySelector('[role="button"]')).toBeNull();
    expect(document.querySelector('canvas')?.parentElement?.style.backgroundImage).toContain(
      'linear-gradient(45deg'
    );
  });

  it('renders a checkerboard surface when the workspace background is transparent', async () => {
    const controller = createControllerMock();
    const { CanvasWrapper } = await import('.');

    resetEditorStore({
      viewportPreviewOpen: false,
      workspace: {
        ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
        backgroundColor: 'transparent',
        gridEnabled: false,
      },
    });
    renderWithController(<CanvasWrapper hasImage />, controller);

    const canvasSurface = document.querySelector('canvas')?.parentElement;
    const style = canvasSurface?.getAttribute('style') ?? '';

    expect(style).toContain('background-image');
    expect(style).toContain('linear-gradient(45deg');
    expect(style).toContain('background-size: 20px 20px;');
  });
});

describe('viewport preview ownership seam', () => {
  it('renders the preview surface and routes keyboard navigation through the provider controller', async () => {
    const { startEditorViewportPreviewLoopMock } = getEditorShellOwnershipMocks();
    const controller = createControllerMock();
    const { EditorViewportPreview } = await import('../viewport-preview');
    const canvasRef = { current: document.createElement('canvas') };

    renderWithController(<EditorViewportPreview canvasRef={canvasRef} hasImage />, controller);

    const surface = document.querySelector<HTMLDivElement>('[role="button"]');
    expect(surface?.getAttribute('aria-label')).toBe(translate('editor.toolbar.previewNavigation'));
    expect(startEditorViewportPreviewLoopMock).toHaveBeenCalled();

    await act(async () => {
      surface?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Home',
        })
      );
    });

    expect(controller.navigateViewportTo).toHaveBeenCalledWith(0.5, 0.5);
  });

  it('exposes pure navigation helpers for pointer and keyboard preview controls', async () => {
    const { createEditorViewportPreviewKeyHandler, createEditorViewportPreviewPointerHandlers } =
      await import('../viewport-preview/events');
    const { navigateEditorViewportFromClientPoint } =
      await import('../viewport-preview/navigation');

    const dragPointerIdRef = { current: null as number | null };
    const navigateFromClientPoint = vi.fn();
    const handlers = createEditorViewportPreviewPointerHandlers({
      dragPointerIdRef,
      navigateFromClientPoint,
    });
    const captureState = { value: false };
    const pointerTarget = {
      hasPointerCapture: () => captureState.value,
      releasePointerCapture: vi.fn(() => {
        captureState.value = false;
      }),
      setPointerCapture: vi.fn(() => {
        captureState.value = true;
      }),
    };

    handlers.handlePointerDown({
      clientX: 10,
      clientY: 20,
      currentTarget: pointerTarget,
      pointerId: 7,
    } as never);
    handlers.handlePointerMove({
      clientX: 25,
      clientY: 35,
      currentTarget: pointerTarget,
      pointerId: 7,
    } as never);
    handlers.handlePointerRelease({ currentTarget: pointerTarget, pointerId: 7 } as never);
    handlers.handlePointerMove({
      clientX: 99,
      clientY: 99,
      currentTarget: pointerTarget,
      pointerId: 8,
    } as never);
    handlers.handlePointerRelease({ currentTarget: pointerTarget, pointerId: 8 } as never);

    expect(navigateFromClientPoint).toHaveBeenNthCalledWith(1, 10, 20);
    expect(navigateFromClientPoint).toHaveBeenNthCalledWith(2, 25, 35);
    expect(pointerTarget.releasePointerCapture).toHaveBeenCalledWith(7);

    const keyController = { navigateViewportTo: vi.fn() };
    const keyHandler = createEditorViewportPreviewKeyHandler({
      controller: keyController,
      viewportCenter: { x: 0.5, y: 0.5 },
    });

    keyHandler({ key: 'ArrowLeft', preventDefault: vi.fn(), shiftKey: true } as never);
    keyHandler({ key: 'ArrowRight', preventDefault: vi.fn(), shiftKey: false } as never);
    keyHandler({ key: 'Escape', preventDefault: vi.fn(), shiftKey: false } as never);

    expect(keyController.navigateViewportTo).toHaveBeenCalledWith(0.36, 0.5);
    expect(keyController.navigateViewportTo).toHaveBeenCalledWith(0.56, 0.5);

    const previewSurfaceRef = {
      current: {
        getBoundingClientRect: () => ({
          bottom: 260,
          height: 200,
          left: 50,
          right: 250,
          top: 60,
          width: 200,
          x: 50,
          y: 60,
          toJSON: () => ({}),
        }),
      } as HTMLDivElement,
    };

    navigateEditorViewportFromClientPoint({
      clientX: 150,
      clientY: 110,
      controller: keyController,
      previewSurfaceRef,
    });
    navigateEditorViewportFromClientPoint({
      clientX: 150,
      clientY: 110,
      controller: keyController,
      previewSurfaceRef: { current: null },
    });

    expect(keyController.navigateViewportTo).toHaveBeenCalledWith(0.5, 0.25);
  });
});

describe('toolbar action builders', () => {
  it('keeps tool activation and inspector toggles guarded by has-image state', async () => {
    const { createEditorToolbarActions } = await import('../toolbar/actions');

    const enabledController = {
      cancelCropMode: vi.fn(),
      clearSelection: vi.fn(),
      setActiveTool: vi.fn(),
      suspendToolMode: vi.fn(),
    };
    const enabledActions = createEditorToolbarActions({
      controller: enabledController,
      hasImage: true,
      inspector: 'frame',
      setActiveTool: vi.fn(),
      setInspector: vi.fn(),
    });

    enabledActions.activateTool('crop');
    enabledActions.toggleInspector('frame');

    expect(enabledController.setActiveTool).toHaveBeenNthCalledWith(1, 'crop');
    expect(enabledController.setActiveTool).toHaveBeenNthCalledWith(2, 'select');

    const disabledController = {
      cancelCropMode: vi.fn(),
      clearSelection: vi.fn(),
      setActiveTool: vi.fn(),
      suspendToolMode: vi.fn(),
    };
    const disabledActions = createEditorToolbarActions({
      controller: disabledController,
      hasImage: false,
      inspector: 'tool',
      setActiveTool: vi.fn(),
      setInspector: vi.fn(),
    });

    disabledActions.activateTool('text');
    disabledActions.toggleInspector('meta');

    expect(disabledController.setActiveTool).not.toHaveBeenCalled();
  });
});
