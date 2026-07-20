import { beforeEach, expect, it, vi } from 'vitest';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  emptyCanvasJsonMock: vi.fn(() => '{"empty":true}'),
  fitSourceMock: vi.fn(() => true),
  fromUrlMock: vi.fn(),
  getFabricImageIntrinsicSizeMock: vi.fn(() => ({ width: 320, height: 180 })),
  preserveCanvasMock: vi.fn(() => true),
  resolveEditorSceneLayoutMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fromUrlMock,
  },
}));

vi.mock('../../browser-frame/layout', () => ({
  resolveEditorSceneLayout: mocks.resolveEditorSceneLayoutMock,
  shouldFitSourceToContent: mocks.fitSourceMock,
  shouldPreserveCanvasForBrowserFrame: mocks.preserveCanvasMock,
}));

vi.mock('../core/helpers', () => ({
  emptyCanvasJson: mocks.emptyCanvasJsonMock,
}));

vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
  };
});

import { createBaseDocument } from './';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveEditorSceneLayoutMock.mockReturnValue({
    canvas: { height: 180, width: 320 },
    source: { height: 180, left: 0, top: 0, width: 320 },
  });
});

it('creates fresh image documents without scene padding on open', async () => {
  const frame: EditorFrameSettings = {
    backgroundColor: 'transparent',
    backgroundGradientAngle: 145,
    backgroundGradientFrom: '#7c2d12',
    backgroundGradientTo: '#f59e0b',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'fit-image' as const,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  };
  const browserFrame: BrowserFrameState = {
    appearance: 'window' as const,
    canvasMode: 'resize' as const,
    contentMode: 'push-down' as const,
    enabled: false,
    title: '',
    url: '',
  };

  mocks.fromUrlMock.mockResolvedValue({ id: 'image' });

  await createBaseDocument('data:image/png;base64,base', 'capture.png', frame, browserFrame);

  expect(mocks.resolveEditorSceneLayoutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas: { width: 320, height: 180 },
      fitSourceToContent: true,
      frame,
      preserveCanvasSize: true,
    })
  );
});
