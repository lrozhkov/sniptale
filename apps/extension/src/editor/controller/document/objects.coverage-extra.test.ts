import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextCalloutRenderingMock: vi.fn(),
  getArrowInteractionAppearanceMock: vi.fn(() => ({
    hasBorders: false,
    lockRotation: true,
    lockScaling: true,
  })),
  getArrowSettingsMock: vi.fn(() => ({ mode: 'straight', width: 4 })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isEditableObjectMock: vi.fn(() => true),
  isGroupMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isEditableObject: mocks.isEditableObjectMock,
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../../objects/annotation/text/callout/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/lifecycle')>()),
  applyTextCalloutRendering: mocks.applyTextCalloutRenderingMock,
}));
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObjectMock,
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowInteractionAppearance: mocks.getArrowInteractionAppearanceMock,
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));

import { prepareEditorObject } from './objects/prepare';

function createEditorObject(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, () => void>();
  const child = { set: vi.fn() };
  return {
    child,
    handlers,
    object: {
      getObjects: vi.fn(() => [child]),
      sniptaleLocked: false,
      on: vi.fn((eventName: string, handler: () => void) => handlers.set(eventName, handler)),
      set: vi.fn(),
      setControlsVisibility: vi.fn(),
      text: 'Hello',
      ...overrides,
    },
  };
}

it('prepares object interaction controls, grouped children, geometry, and textbox lifecycle', () => {
  const onTextboxExitCommit = vi.fn();
  const onTextboxExitEmpty = vi.fn();
  const arrow = createEditorObject({ sniptaleType: 'arrow' });
  mocks.isArrowObjectMock.mockReturnValueOnce(true).mockReturnValueOnce(true);
  prepareEditorObject(arrow.object as never, { onTextboxExitCommit, onTextboxExitEmpty });

  expect(arrow.object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      hasBorders: false,
      lockRotation: true,
      lockScalingX: true,
      selectable: true,
    })
  );
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow.object, {
    settings: { mode: 'straight', width: 4 },
  });

  const group = createEditorObject({ sniptaleType: 'step' });
  mocks.isGroupMock.mockReturnValueOnce(true);
  prepareEditorObject(group.object as never, { onTextboxExitCommit, onTextboxExitEmpty });
  expect(group.object.set).toHaveBeenCalledWith(
    expect.objectContaining({ hasControls: false, lockScalingX: true })
  );
  expect(group.child.set).toHaveBeenCalledWith({ evented: false, selectable: false });

  const richLine = createEditorObject({
    sniptaleRichShape: { shapeFamily: 'connector' },
    sniptaleType: 'rich-shape',
  });
  prepareEditorObject(richLine.object as never, { onTextboxExitCommit, onTextboxExitEmpty });
  expect(richLine.object.setControlsVisibility).toHaveBeenCalledWith(
    expect.objectContaining({ bl: true, tr: true })
  );

  const blur = createEditorObject({ sniptaleType: 'blur' });
  mocks.isBlurObjectMock.mockReturnValueOnce(true).mockReturnValueOnce(true);
  prepareEditorObject(blur.object as never, { onTextboxExitCommit, onTextboxExitEmpty });
  expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur.object);

  const textbox = createEditorObject({ sniptaleType: 'text', text: 'Real text' });
  mocks.isTextboxMock.mockReturnValueOnce(true);
  prepareEditorObject(textbox.object as never, { onTextboxExitCommit, onTextboxExitEmpty });
  textbox.handlers.get('editing:exited')?.();
  expect(mocks.applyTextCalloutRenderingMock).toHaveBeenCalledWith(textbox.object);
  expect(onTextboxExitCommit).toHaveBeenCalledWith(textbox.object);
});
