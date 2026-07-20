import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextCalloutRenderingMock: vi.fn(),
  getArrowInteractionAppearanceMock: vi.fn(() => ({
    cornerSize: 17,
    cornerStyle: 'circle',
    hasBorders: false,
    hoverCursor: 'pointer',
    lockRotation: true,
    lockScaling: true,
    moveCursor: 'move',
  })),
  getArrowSettingsMock: vi.fn(() => ({ color: '#222222', width: 6 })),
  getLineSettingsMock: vi.fn(() => ({ color: '#123456', width: 4 })),
  isArrowObjectMock: vi.fn((object: { sniptaleType?: string }) => object.sniptaleType === 'arrow'),
  isBlurObjectMock: vi.fn((object: { sniptaleType?: string }) => object.sniptaleType === 'blur'),
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  isLineObjectMock: vi.fn(() => true),
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateLineObjectMock: vi.fn(),
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
vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  getLineSettings: mocks.getLineSettingsMock,
  isLineObject: mocks.isLineObjectMock,
  updateLineObject: mocks.updateLineObjectMock,
}));

import { prepareEditorObject } from './objects/prepare';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLineObjectMock.mockReturnValue(true);
});

it('refreshes line objects through the line owner seam when loaded', () => {
  const object = {
    cornerSize: 8,
    cornerStyle: 'rect',
    sniptaleLocked: false,
    sniptaleType: 'line',
    set: vi.fn(),
  };

  prepareEditorObject(object as never, {
    onTextboxExitCommit: vi.fn(),
    onTextboxExitEmpty: vi.fn(),
  });

  expect(mocks.updateLineObjectMock).toHaveBeenCalledWith(object, {
    settings: { color: '#123456', width: 4 },
  });
});

it('applies arrow interaction state when loaded', () => {
  const object = {
    cornerSize: 8,
    cornerStyle: 'rect',
    sniptaleLocked: false,
    sniptaleType: 'arrow',
    set: vi.fn(),
  };
  mocks.isLineObjectMock.mockReturnValue(false);

  prepareEditorObject(object as never, {
    onTextboxExitCommit: vi.fn(),
    onTextboxExitEmpty: vi.fn(),
  });

  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      hasBorders: false,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
    })
  );
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(object, {
    settings: { color: '#222222', width: 6 },
  });
});

it('prepares grouped children, blur objects, and textbox edit lifecycles', () => {
  const child = { set: vi.fn() };
  const group = {
    cornerSize: 8,
    cornerStyle: 'rect',
    getObjects: vi.fn(() => [child]),
    kind: 'group',
    sniptaleLocked: false,
    set: vi.fn(),
  };
  const blur = {
    cornerSize: 8,
    cornerStyle: 'rect',
    sniptaleLocked: true,
    sniptaleType: 'blur',
    set: vi.fn(),
  };
  const textbox = {
    cornerSize: 8,
    cornerStyle: 'rect',
    kind: 'textbox',
    sniptaleLocked: false,
    sniptaleType: 'text',
    on: vi.fn(),
    set: vi.fn(),
    text: '',
  };
  const onTextboxExitCommit = vi.fn();
  const onTextboxExitEmpty = vi.fn();
  mocks.isLineObjectMock.mockReturnValue(false);

  prepareEditorObject(group as never, { onTextboxExitCommit, onTextboxExitEmpty });
  prepareEditorObject(blur as never, { onTextboxExitCommit, onTextboxExitEmpty });
  prepareEditorObject(textbox as never, { onTextboxExitCommit, onTextboxExitEmpty });

  expect(child.set).toHaveBeenCalledWith({ evented: false, selectable: false });
  expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blur);
  expect(mocks.applyTextCalloutRenderingMock).toHaveBeenCalledWith(textbox);

  const handler = textbox.on.mock.calls[0]?.[1] as () => void;
  handler();
  textbox.text = 'Saved text';
  handler();

  expect(onTextboxExitEmpty).toHaveBeenCalledWith(textbox);
  expect(onTextboxExitCommit).toHaveBeenCalledWith(textbox);
});
