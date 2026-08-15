import { beforeEach, expect, it, vi } from 'vitest';
import { closeLayerEffectsBeforeToolbarAction, createEditorToolbarActions } from './actions';

function args(inspector: 'tool' | 'file' | 'canvas-size' | 'image-size' | 'frame' = 'tool') {
  return {
    controller: {
      cancelCropMode: vi.fn(),
      clearSelection: vi.fn(),
      setActiveTool: vi.fn(),
      suspendToolMode: vi.fn(),
    },
    hasImage: true,
    inspector,
    setActiveTool: vi.fn(),
    setInspector: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

it('activates current tools after clearing selection and closing layer effects', () => {
  const options = args();
  const actions = createEditorToolbarActions(options);
  actions.activateTool('marker');
  expect(options.controller.clearSelection).toHaveBeenCalledOnce();
  expect(options.setInspector).toHaveBeenCalledWith('tool');
  expect(options.setActiveTool).toHaveBeenCalledWith('marker');
  expect(options.controller.setActiveTool).toHaveBeenCalledWith('marker');

  closeLayerEffectsBeforeToolbarAction({
    inspector: 'layer-effects',
    setActiveTool: options.setActiveTool,
  });
  expect(options.setActiveTool).toHaveBeenCalledWith('select');
});

it('does nothing without an image', () => {
  const options = { ...args(), hasImage: false };
  const actions = createEditorToolbarActions(options);
  actions.activateTool('pencil');
  actions.toggleInspector('frame');
  expect(options.controller.clearSelection).not.toHaveBeenCalled();
  expect(options.setInspector).not.toHaveBeenCalled();
});

it('opens and closes file and resize inspectors through their dedicated modes', () => {
  const fileOpen = args('tool');
  createEditorToolbarActions(fileOpen).toggleInspector('file');
  expect(fileOpen.controller.suspendToolMode).toHaveBeenCalledOnce();
  expect(fileOpen.setInspector).toHaveBeenCalledWith('file');

  const fileClose = args('file');
  createEditorToolbarActions(fileClose).toggleInspector('file');
  expect(fileClose.controller.setActiveTool).toHaveBeenCalledWith('select');
  expect(fileClose.setInspector).toHaveBeenCalledWith('tool');

  const resizeOpen = args('tool');
  createEditorToolbarActions(resizeOpen).toggleInspector('canvas-size');
  expect(resizeOpen.controller.setActiveTool).toHaveBeenCalledWith('crop');
  expect(resizeOpen.setInspector).toHaveBeenCalledWith('canvas-size');

  const imageSizeOpen = args('tool');
  createEditorToolbarActions(imageSizeOpen).toggleInspector('image-size');
  expect(imageSizeOpen.controller.setActiveTool).toHaveBeenCalledWith('select');
  expect(imageSizeOpen.setInspector).toHaveBeenCalledWith('image-size');

  const resizeClose = args('canvas-size');
  createEditorToolbarActions(resizeClose).toggleInspector('canvas-size');
  expect(resizeClose.controller.cancelCropMode).toHaveBeenCalledOnce();
  expect(resizeClose.setInspector).toHaveBeenCalledWith('tool');

  const resizeSwitch = args('canvas-size');
  createEditorToolbarActions(resizeSwitch).toggleInspector('image-size');
  expect(resizeSwitch.controller.cancelCropMode).toHaveBeenCalledOnce();
  expect(resizeSwitch.controller.setActiveTool).toHaveBeenCalledWith('select');
  expect(resizeSwitch.setInspector).toHaveBeenCalledWith('image-size');
});

it('toggles ordinary inspectors while keeping select mode active', () => {
  const open = args('tool');
  createEditorToolbarActions(open).toggleInspector('frame');
  expect(open.setInspector).toHaveBeenCalledWith('frame');

  const close = args('frame');
  createEditorToolbarActions(close).toggleInspector('frame');
  expect(close.setInspector).toHaveBeenCalledWith('tool');
  expect(close.controller.setActiveTool).toHaveBeenCalledWith('select');

  const leaveCropForFrame = args('canvas-size');
  createEditorToolbarActions(leaveCropForFrame).toggleInspector('frame');
  expect(leaveCropForFrame.controller.cancelCropMode).toHaveBeenCalledOnce();
  expect(leaveCropForFrame.setInspector).toHaveBeenCalledWith('frame');

  const leaveCropForLayers = args('canvas-size');
  createEditorToolbarActions(leaveCropForLayers).activateTool('select');
  expect(leaveCropForLayers.controller.cancelCropMode).toHaveBeenCalledOnce();
  expect(leaveCropForLayers.setInspector).toHaveBeenCalledWith('tool');
});
