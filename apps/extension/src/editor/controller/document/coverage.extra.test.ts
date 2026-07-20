import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeTool: 'select',
  browserFrame: { title: 'Stored title', url: 'https://stored.example' },
  frame: {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#102030',
    backgroundGradientAngle: 22,
    backgroundGradientFrom: '#304050',
    backgroundGradientTo: '#607080',
    backgroundImageData: 'data:image/png;base64,background',
    backgroundImageFit: 'tile',
    backgroundMode: 'image',
    layoutMode: 'expand-canvas',
    padding: 12,
    paddingTop: 12,
    paddingRight: 24,
    paddingBottom: 36,
    paddingLeft: 48,
  },
  setBrowserFrame: vi.fn(),
  setCropReady: vi.fn(),
  setImageData: vi.fn(),
  setInspector: vi.fn(),
  setPageTitle: vi.fn(),
  toolSettings: {
    step: { alphabet: 'latin', color: '#ff671d', sizeLevel: 3, type: 'number', value: '9' },
  },
  updateStepSettings: vi.fn(),
  updateFrame: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  createBaseDocumentMock: vi.fn(async () => ({
    canvasHeight: 60,
    canvasWidth: 100,
    sourceHeight: 60,
    sourceImageData: 'data',
    sourceWidth: 100,
  })),
  logOpenTraceMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
}));

vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  createBaseDocument: mocks.createBaseDocumentMock,
}));

vi.mock('../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/debug')>()),
  logEditorOpenTrace: mocks.logOpenTraceMock,
}));

import { openEditorControllerImage } from './lifecycle/open/image/run';
import {
  applyPreparedEditorDocumentState,
  createBrowserFrameRebuildDonePayload,
} from './lifecycle-helpers';

function createStepObject(value: string, overrides: Record<string, unknown> = {}) {
  return {
    sniptaleStepAlphabet: 'latin',
    sniptaleStepType: 'number',
    sniptaleStepValue: value,
    sniptaleType: 'step',
    ...overrides,
  } as never;
}

function createPreparedDocument(): any {
  return {
    browserFrame: { title: 'Prepared browser frame' },
    canvasSize: { height: 60, width: 100 },
    frame: { padding: 4 },
    normalizedDocument: { canvasJson: '{"objects":[]}', canvasHeight: 60, canvasWidth: 100 },
  } as any;
}

function createPreparedStateOptions(overrides: Record<string, unknown> = {}): any {
  return {
    applyOptions: { resetHistory: false, updateOriginal: false },
    applyToolMode: vi.fn(),
    canvasObjects: [],
    hasHistory: true,
    prepared: createPreparedDocument(),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' } as any,
    ...overrides,
  };
}

function expectOpenedDocumentFrame() {
  expect(mocks.createBaseDocumentMock).toHaveBeenCalledWith(
    'data-url',
    'Source',
    {
      ...storeState.frame,
      backgroundColor: 'transparent',
      backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
      backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
      backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
      backgroundImageData: null,
      backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
      backgroundMode: 'color',
      layoutMode: 'fit-image',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      padding: 12,
    },
    expect.objectContaining({ url: 'https://stored.example' })
  );
}

function registerPreparedStateApplyTest() {
  it('applies prepared state, syncs store fields, and resets the step counter', () => {
    storeState.updateStepSettings.mockClear();
    const options = createPreparedStateOptions({
      applyOptions: { resetHistory: true, updateOriginal: true },
      applyToolMode: vi.fn(),
      setActiveTool: vi.fn(),
      setCanvasDocumentSize: vi.fn(),
      setCropState: vi.fn(),
      setHistory: vi.fn(),
      setOriginalDocument: vi.fn(),
      source: { id: 'source' } as never,
    });

    applyPreparedEditorDocumentState(options as never);

    expect(options.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 60, width: 100 });
    expect(storeState.updateFrame).toHaveBeenCalledWith(options.prepared.frame);
    expect(storeState.setBrowserFrame).toHaveBeenCalledWith(options.prepared.browserFrame);
    expect(storeState.updateStepSettings).toHaveBeenCalledWith({ value: '1' });
    expect(options.setOriginalDocument).toHaveBeenCalledWith(options.prepared.normalizedDocument);
    expect(options.setHistory).toHaveBeenCalledWith(options.prepared.normalizedDocument);
    expect(options.setCropState).toHaveBeenCalledWith(null, null);
    expect(options.setActiveTool).toHaveBeenCalledWith('select');
    expect(options.applyToolMode).toHaveBeenCalledOnce();
  });
}

function registerPreparedStateGuardTest() {
  it('skips original and history writes when apply options preserve existing state', () => {
    const options = createPreparedStateOptions({
      setHistory: vi.fn(),
      setOriginalDocument: vi.fn(),
    });

    applyPreparedEditorDocumentState(options as never);

    expect(options.setOriginalDocument).not.toHaveBeenCalled();
    expect(options.setHistory).not.toHaveBeenCalled();
  });
}

function registerNumericStepResyncTest() {
  it('resyncs the next step value from restored canvas objects', () => {
    storeState.updateStepSettings.mockClear();
    storeState.toolSettings.step = {
      alphabet: 'latin',
      color: '#ff671d',
      sizeLevel: 3,
      type: 'number',
      value: '9',
    };
    const options = createPreparedStateOptions({
      canvasObjects: [createStepObject('1'), createStepObject('2')],
      source: null,
    });

    applyPreparedEditorDocumentState(options as never);

    expect(storeState.updateStepSettings).toHaveBeenCalledWith({ value: '3' });
  });
}

function registerNoopStepResyncTest() {
  it('skips the step store write when restore keeps the same next value', () => {
    storeState.updateStepSettings.mockClear();
    storeState.toolSettings.step = {
      alphabet: 'latin',
      color: '#ff671d',
      sizeLevel: 3,
      type: 'number',
      value: '3',
    };
    const options = createPreparedStateOptions({
      canvasObjects: [createStepObject('1'), createStepObject('2')],
      source: null,
    });

    applyPreparedEditorDocumentState(options as never);

    expect(storeState.updateStepSettings).not.toHaveBeenCalled();
  });
}

function registerStepResetTest() {
  it('resets the next step value when the restored canvas has no matching steps', () => {
    storeState.updateStepSettings.mockClear();
    storeState.toolSettings.step = {
      alphabet: 'latin',
      color: '#ff671d',
      sizeLevel: 3,
      type: 'letter',
      value: 'Z',
    };
    const options = createPreparedStateOptions({
      canvasObjects: [createStepObject('7')],
      source: null,
    });

    applyPreparedEditorDocumentState(options as never);

    expect(storeState.updateStepSettings).toHaveBeenCalledWith({ value: 'A' });
  });
}

function registerHeaderPayloadGuardTest() {
  it('creates rebuild payloads for missing headers', () => {
    expect(
      createBrowserFrameRebuildDonePayload({
        frameObjectsCount: 0,
        header: null,
        renderToken: 5,
      })
    ).toEqual({
      backgroundObjects: 0,
      headerHeight: undefined,
      headerLeft: undefined,
      headerTop: undefined,
      headerVisible: true,
      headerWidth: undefined,
      renderToken: 5,
    });
  });
}

function registerStoredBrowserFrameGuardTest() {
  it('uses the stored browser-frame url when open options omit it', async () => {
    const applyDocument = vi.fn(async () => undefined);
    const scheduleZoomToFit = vi.fn();

    await openEditorControllerImage({
      applyDocument,
      dataUrl: 'data-url',
      openOptions: {},
      scheduleZoomToFit,
      sourceName: 'Source',
    });

    expectOpenedDocumentFrame();
    expect(storeState.setBrowserFrame).toHaveBeenCalledWith({
      faviconDataUrl: null,
      title: '',
      url: 'https://stored.example',
    });
  });
}

function runDocumentCoverageGuardSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  registerPreparedStateApplyTest();
  registerPreparedStateGuardTest();
  registerNumericStepResyncTest();
  registerNoopStepResyncTest();
  registerStepResetTest();
  registerHeaderPayloadGuardTest();
  registerStoredBrowserFrameGuardTest();
}

describe('editor document coverage guard branches', runDocumentCoverageGuardSuite);
