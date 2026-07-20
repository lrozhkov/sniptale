import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  applyTextCalloutRenderingMock: vi.fn(),
  getArrowInteractionAppearanceMock: vi.fn(() => ({
    cornerSize: 14,
    cornerStyle: 'circle',
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
  translateMock: vi.fn(() => 'Default textbox text'),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translateMock,
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

function createObject(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, () => void>();
  const object = {
    cornerSize: 8,
    cornerStyle: 'rect',
    getObjects: vi.fn(() => []),
    sniptaleLocked: false,
    on: vi.fn((eventName: string, handler: () => void) => handlers.set(eventName, handler)),
    set: vi.fn(),
    text: 'Hello',
    ...overrides,
  };
  return {
    handlers,
    object,
  };
}

function setupObjectMocks() {
  vi.clearAllMocks();
  mocks.applyTextCalloutRenderingMock.mockReset();
  mocks.getArrowInteractionAppearanceMock.mockReturnValue({
    cornerSize: 14,
    cornerStyle: 'circle',
    hasBorders: false,
    lockRotation: true,
    lockScaling: true,
  });
  mocks.getArrowSettingsMock.mockReturnValue({ mode: 'straight', width: 4 });
  mocks.isArrowObjectMock.mockReturnValue(false);
  mocks.isBlurObjectMock.mockReturnValue(false);
  mocks.isEditableObjectMock.mockReturnValue(true);
  mocks.isGroupMock.mockReturnValue(false);
  mocks.isTextboxMock.mockReturnValue(false);
  mocks.translateMock.mockReturnValue('Default textbox text');
}

function runGroupedArrowSuite() {
  it('applies editable state and child locks for grouped arrow objects', () => {
    const child = { set: vi.fn() };
    const { object } = createObject({
      getObjects: vi.fn(() => [child]),
    });

    mocks.isArrowObjectMock.mockReturnValue(true);
    mocks.isGroupMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({
        borderColor: '#f97316',
        cornerColor: '#f8fafc',
        evented: true,
        hasBorders: false,
        lockRotation: true,
        objectCaching: false,
        selectable: true,
      })
    );
    expect(child.set).toHaveBeenCalledWith({ evented: false, selectable: false });
    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(object, {
      settings: { mode: 'straight', width: 4 },
    });
  });

  it('keeps locked editor objects selectable while disabling transforms', () => {
    const { object } = createObject({ sniptaleLocked: true });

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({ evented: true, hasControls: false, selectable: true })
    );
  });
}

function runStepPreparationSuite() {
  it('keeps step annotations movable while disabling canvas resize controls', () => {
    const child = { set: vi.fn() };
    const { object } = createObject({
      getObjects: vi.fn(() => [child]),
      sniptaleType: 'step',
    });

    mocks.isGroupMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({
        evented: true,
        hasControls: false,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        selectable: true,
      })
    );
    expect(child.set).toHaveBeenCalledWith({ evented: false, selectable: false });
  });
}

function runRichShapePreparationSuite() {
  it('uses length-only controls for imported line-like rich shapes', () => {
    const { object } = createObject({
      sniptaleRichShape: { shapeFamily: 'arrow' },
      sniptaleType: 'rich-shape',
      setControlsVisibility: vi.fn(),
    });

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({
        hasBorders: false,
        lockRotation: true,
      })
    );
    const richShape = object as unknown as { setControlsVisibility: ReturnType<typeof vi.fn> };
    expect(richShape.setControlsVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ bl: true, br: false, tr: true })
    );
  });
}

function runTextboxEditingLifecycleSuites() {
  it('removes empty textboxes when editing exits without user content', () => {
    const onTextboxExitEmpty = vi.fn();
    const { handlers, object } = createObject({
      text: '   ',
    });

    mocks.isTextboxMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty,
    });

    handlers.get('editing:exited')?.();

    expect(onTextboxExitEmpty).toHaveBeenCalledWith(object);
  });

  it('commits textbox edits when the value differs from the default placeholder', () => {
    const onTextboxExitCommit = vi.fn();
    const { handlers, object } = createObject({
      sniptaleTextInitialInsertPending: true,
      text: 'Real note',
    });

    mocks.isTextboxMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit,
      onTextboxExitEmpty: vi.fn(),
    });

    handlers.get('editing:exited')?.();

    expect(onTextboxExitCommit).toHaveBeenCalledOnce();
    expect(onTextboxExitCommit).toHaveBeenCalledWith(object);
  });
}

function runTextboxPreparationSuites() {
  it('prepares editor-owned text callout rendering when textbox objects are loaded', () => {
    const { object } = createObject({
      sniptaleType: 'text',
      text: 'Callout',
    });

    mocks.isTextboxMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(mocks.applyTextCalloutRenderingMock).toHaveBeenCalledWith(object);
  });

  it('prepares meta-stamps through the same text callout owner seam', () => {
    const { object } = createObject({
      sniptaleType: 'meta-stamp',
      text: 'Browser\nChrome',
    });

    mocks.isTextboxMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(mocks.applyTextCalloutRenderingMock).toHaveBeenCalledWith(object);
  });
}

function runBlurPreparationSuite() {
  it('refreshes blur objects through the blur owner seam when loaded', () => {
    const { object } = createObject({
      sniptaleType: 'blur',
    });
    mocks.isBlurObjectMock.mockReturnValue(true);

    prepareEditorObject(object as never, {
      onTextboxExitCommit: vi.fn(),
      onTextboxExitEmpty: vi.fn(),
    });

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({
        hasControls: true,
        lockScalingX: false,
        lockScalingY: false,
      })
    );
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(object);
  });
}
describe('editor-controller-objects', () => {
  beforeEach(setupObjectMocks);
  runGroupedArrowSuite();
  runStepPreparationSuite();
  runRichShapePreparationSuite();
  runTextboxEditingLifecycleSuites();
  runTextboxPreparationSuites();
  runBlurPreparationSuite();
});
