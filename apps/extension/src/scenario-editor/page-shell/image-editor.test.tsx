// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../features/editor/document/types';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioImageElementEditorMount } from './image-editor';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

const editedAssetMock = vi.hoisted(() => ({
  createScenarioEditedCaptureAsset: vi.fn(),
  deleteScenarioEditedCaptureAsset: vi.fn(),
  saveScenarioStepEditorDocumentRecord: vi.fn(),
}));
const hostMock = vi.hoisted(() => ({
  lastApply: null as
    | null
    | ((payload: { dataUrl: string; document: EditorDocument }) => Promise<void>),
}));

vi.mock('../../workflows/scenario-capture-edit/edits', () => ({
  createScenarioEditedCaptureAsset: editedAssetMock.createScenarioEditedCaptureAsset,
  deleteScenarioEditedCaptureAsset: editedAssetMock.deleteScenarioEditedCaptureAsset,
}));
vi.mock(
  '../../composition/persistence/scenario/store/step-editor-documents',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/step-editor-documents')
    >()),
    saveScenarioStepEditorDocumentRecord: editedAssetMock.saveScenarioStepEditorDocumentRecord,
  })
);
vi.mock('../workspace/embedded-editor-host/ScenarioImageElementEditorHost', () => ({
  ScenarioImageElementEditorHost: (props: {
    onApply: (payload: { dataUrl: string; document: EditorDocument }) => Promise<void>;
    onClose: () => void;
  }) => {
    hostMock.lastApply = props.onApply;
    return <button onClick={props.onClose}>image host</button>;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createEditor(): ScenarioV3EditorState {
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: 'gallery-1' },
      editDocumentId: 'doc-1',
    }),
    id: 'image-1',
  };
  const project: ScenarioProjectV3 = {
    ...createScenarioProjectV3('Image deck'),
    id: 'project-1',
    slides: [{ ...createScenarioProjectV3('Image deck').slides[0]!, elements: [image] }],
  };

  return {
    elementActions: { updateElement: vi.fn() },
    elements: [image],
    project,
  } as unknown as ScenarioV3EditorState;
}

function renderMount(editor = createEditor(), elementId: string | null = 'image-1') {
  const onClose = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioImageElementEditorMount editor={editor} elementId={elementId} onClose={onClose} />
    );
  });

  return { editor, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  hostMock.lastApply = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  editedAssetMock.createScenarioEditedCaptureAsset.mockResolvedValue({
    galleryAssetId: 'gallery-edited',
    id: 'asset-edited',
  });
  editedAssetMock.deleteScenarioEditedCaptureAsset.mockResolvedValue(undefined);
  editedAssetMock.saveScenarioStepEditorDocumentRecord.mockResolvedValue(undefined);
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

it('applies embedded image edits atomically to the selected image element', async () => {
  const { editor } = renderMount();

  await act(async () => {
    await hostMock.lastApply?.({
      dataUrl: 'data:image/png;base64,edited',
      document: createEditorDocument(),
    });
  });

  expect(editedAssetMock.createScenarioEditedCaptureAsset).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,edited',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });
  expect(editedAssetMock.saveScenarioStepEditorDocumentRecord).toHaveBeenCalledWith({
    document: createEditorDocument(),
    projectId: 'project-1',
    stepId: 'doc-1',
  });
  expect(editor.elementActions.updateElement).toHaveBeenCalledWith('image-1', {
    assetRef: { assetId: 'asset-edited', galleryAssetId: 'gallery-edited' },
    contentTransform: { scale: 1, x: 0, y: 0 },
    editDocumentId: 'doc-1',
  });
});

it('does not mount the host when no selected image element exists', () => {
  renderMount(createEditor(), null);

  expect(container?.textContent).toBe('');
  expect(hostMock.lastApply).toBeNull();
});

it('rolls back a created edited asset when editor document persistence fails', async () => {
  const editor = createEditor();
  const error = new Error('document failed');
  renderMount(editor);
  editedAssetMock.saveScenarioStepEditorDocumentRecord.mockRejectedValue(error);

  await expect(
    act(async () => {
      await hostMock.lastApply?.({
        dataUrl: 'data:image/png;base64,edited',
        document: createEditorDocument(),
      });
    })
  ).rejects.toThrow('document failed');

  expect(editedAssetMock.deleteScenarioEditedCaptureAsset).toHaveBeenCalledWith('asset-edited');
  expect(editor.elementActions.updateElement).not.toHaveBeenCalled();
});

function createEditorDocument(): EditorDocument {
  return {
    browserFrame: { canvasMode: 'resize', contentMode: 'fit-content', title: '', url: '' },
    canvasHeight: 1,
    canvasJson: '{}',
    canvasWidth: 1,
    frame: {
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      browserMode: false,
      browserTitle: '',
      browserUrl: '',
      layoutMode: 'fit-image',
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
    },
    sourceDisplayHeight: 1,
    sourceDisplayWidth: 1,
    sourceHeight: 1,
    sourceImageData: 'data:image/png;base64,source',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 1,
    version: 1,
  };
}
