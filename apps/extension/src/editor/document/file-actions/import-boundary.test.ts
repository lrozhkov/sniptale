// @vitest-environment jsdom

import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { translate } from '../../../platform/i18n';
import type {
  EditorDocumentExportPort,
  EditorDocumentInsertImagePort,
  EditorDocumentOpenPort,
} from './ports';

type ImportEditorSessionController = EditorDocumentOpenPort &
  EditorDocumentInsertImagePort &
  EditorDocumentExportPort;

const controller: ImportEditorSessionController = {
  canvas: null,
  exportDocument: vi.fn(),
  insertImage: vi.fn(),
  loadDocument: vi.fn(),
  openImage: vi.fn(),
};

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function createSessionFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], 'session.sniptale.json', {
    type: 'application/json',
  });
}

async function expectImportRejected(payload: unknown) {
  const setImageData = vi.fn();
  await expect(
    editorFileActions.importEditorSessionFromFile(
      controller,
      createSessionFile(payload),
      setImageData
    )
  ).rejects.toThrow(translate('editor.runtime.sessionImportInvalid'));
  expect(controller.loadDocument).not.toHaveBeenCalled();
  expect(setImageData).not.toHaveBeenCalled();
}

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: vi.fn(),
}));

vi.mock('./canvas-ready', () => ({
  waitForEditorDocumentCanvas: vi.fn(),
}));

vi.mock('./open-trace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./open-trace')>()),
  logEditorDocumentOpenTrace: vi.fn(),
}));

let editorFileActions: typeof import('./');

beforeAll(async () => {
  editorFileActions = await import('./');
});

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects remote or svg background image data before document load', async () => {
  await expectImportRejected({
    ...createEditorDocument(),
    frame: {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundImageData: 'https://attacker.example/pixel.png',
    },
  });
  await expectImportRejected({
    ...createEditorDocument(),
    frame: {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundImageData: 'data:image/svg+xml;base64,PHN2Zy8+',
    },
  });
});

it('rejects unsafe Fabric image sources before document load', async () => {
  await expectImportRejected({
    ...createEditorDocument(),
    canvasJson: JSON.stringify({
      objects: [{ src: 'https://attacker.example/pixel.png', type: 'image' }],
      version: '7.2.0',
    }),
  });
  await expectImportRejected({
    ...createEditorDocument(),
    canvasJson: JSON.stringify({
      objects: [{ src: 'data:image/svg+xml;base64,PHN2Zy8+', type: 'image' }],
      version: '7.2.0',
    }),
  });
});

it('rejects unsafe Fabric numeric geometry before document load', async () => {
  await expectImportRejected({
    ...createEditorDocument(),
    canvasJson: JSON.stringify({
      objects: [{ left: 1_000_000, type: 'rect', width: 100 }],
      version: '7.2.0',
    }),
  });
  await expectImportRejected({
    ...createEditorDocument(),
    canvasJson: '{"version":"7.2.0","objects":[{"type":"rect","width":1e309}]}',
  });
});

it('rejects unbounded editor session geometry before document load', async () => {
  await expectImportRejected({
    ...createEditorDocument(),
    canvasHeight: 400,
    canvasWidth: 40_000,
  });
});

it('rejects unbounded rich shape count and geometry before document load', async () => {
  const shape = createDefaultRichShapeObject();
  await expectImportRejected({
    ...createEditorDocument(),
    richShapes: Array.from({ length: 501 }, (_unused, index) => ({
      ...shape,
      id: `rich-${index}`,
    })),
  });
  await expectImportRejected({
    ...createEditorDocument(),
    richShapes: [{ ...shape, frame: { ...shape.frame, width: 40_000 } }],
  });
  await expectImportRejected({
    ...createEditorDocument(),
    richShapes: [{ ...shape, frame: { ...shape.frame, width: 0 } }],
  });
  await expectImportRejected({
    ...createEditorDocument(),
    richShapes: [
      {
        ...shape,
        geometry: {
          closed: false,
          points: Array.from({ length: 5_001 }, () => [0, 0]),
          type: 'polyline',
          viewBox: { height: 100, minX: 0, minY: 0, width: 100 },
        },
      },
    ],
  });
});

it('rejects malformed editor session json with a normalized parse error', async () => {
  const setImageData = vi.fn();
  const file = new File(['{invalid'], 'session.json', {
    type: 'application/json',
  });

  await expect(
    editorFileActions.importEditorSessionFromFile(controller, file, setImageData)
  ).rejects.toThrow(translate('editor.runtime.sessionImportParseFailed'));
  expect(controller.loadDocument).not.toHaveBeenCalled();
});

it('rejects invalid editor session payloads with a normalized validation error', async () => {
  const setImageData = vi.fn();
  const file = new File(
    [JSON.stringify({ version: 1, sourceImageData: 'broken' })],
    'session.json',
    {
      type: 'application/json',
    }
  );

  await expect(
    editorFileActions.importEditorSessionFromFile(controller, file, setImageData)
  ).rejects.toThrow(translate('editor.runtime.sessionImportInvalid'));
  expect(controller.loadDocument).not.toHaveBeenCalled();
});
