import type { SetStateAction } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { createElementCommands, createHistoryCommands, createSlideCommands } from './commands';
import { createCommandsProject, createCommandsTwoSlideProject } from './commands.test-support';
import type { ScenarioV3EditorSession } from './types';

const imageImportMocks = vi.hoisted(() => ({
  createScenarioV3ImageAsset: vi.fn(),
  createScenarioAssetEntryFromBlob: vi.fn(),
  deleteScenarioAsset: vi.fn(),
  readScenarioEditorFileAsDataUrl: vi.fn(),
  saveScenarioAsset: vi.fn(),
}));

vi.mock('./file-reader', () => ({
  readScenarioEditorFileAsDataUrl: imageImportMocks.readScenarioEditorFileAsDataUrl,
}));

vi.mock('../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/v3')>()),
  createScenarioV3ImageAsset: imageImportMocks.createScenarioV3ImageAsset,
}));

vi.mock(
  '../../composition/persistence/scenario/store/capture-step/assets',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/capture-step/assets')
    >()),
    createScenarioAssetEntryFromBlob: imageImportMocks.createScenarioAssetEntryFromBlob,
  })
);

vi.mock('../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/projects')>()),
  deleteScenarioAsset: imageImportMocks.deleteScenarioAsset,
  saveScenarioAsset: imageImportMocks.saveScenarioAsset,
}));

beforeEach(() => {
  vi.clearAllMocks();
  imageImportMocks.readScenarioEditorFileAsDataUrl.mockResolvedValue('data:image/png;base64,aW1n');
  imageImportMocks.createScenarioV3ImageAsset.mockResolvedValue({
    createdAt: 10,
    galleryAssetId: null,
    height: 720,
    id: 'asset-imported',
    mimeType: 'image/png',
    projectId: 'project-1',
    size: 5,
    width: 1280,
  });
  imageImportMocks.createScenarioAssetEntryFromBlob.mockResolvedValue({
    assetEntry: {
      blob: new Blob(['image'], { type: 'image/png' }),
      createdAt: 10,
      galleryAssetId: null,
      height: 720,
      id: 'asset-imported',
      mimeType: 'image/png',
      projectId: 'project-1',
      size: 5,
      width: 1280,
    },
    now: 10,
  });
  imageImportMocks.deleteScenarioAsset.mockResolvedValue(undefined);
  imageImportMocks.saveScenarioAsset.mockResolvedValue(undefined);
});

function createSessionHarness(initialProject = createCommandsProject()) {
  let session: ScenarioV3EditorSession = {
    history: { future: [], past: [] },
    project: initialProject,
    selectedElementId: null,
    selectedSlideId: initialProject.slides[0]?.id ?? null,
  };
  const setSession = (action: SetStateAction<ScenarioV3EditorSession>) => {
    session = typeof action === 'function' ? action(session) : action;
  };

  return { getSession: () => session, setSession };
}

it('commits slide commands and keeps selection reachable', () => {
  const harness = createSessionHarness();
  const slides = createSlideCommands(harness.setSession);

  slides.addSlide();
  slides.duplicateSlide('slide-1');
  slides.moveSlide('slide-1', 'down');
  slides.updateSlide({ title: 'Updated slide' });
  slides.selectSlide('slide-1');
  slides.deleteSlide('slide-1');

  expect(harness.getSession().history.past.length).toBeGreaterThan(0);
  expect(harness.getSession().selectedElementId).toBeNull();
  expect(harness.getSession().project.slides.some((slide) => slide.id === 'slide-1')).toBe(false);
});

it('commits element commands and selects inserted elements', () => {
  const harness = createSessionHarness();
  const elements = createElementCommands(harness.setSession);

  elements.insertElement('shape');
  const insertedId = harness.getSession().selectedElementId;
  elements.insertElementAtPoint('arrow', { x: 64, y: 96 });
  const pointedId = harness.getSession().selectedElementId;
  elements.selectElement('text-1');
  elements.updateElement('text-1', { name: 'Renamed' });
  elements.moveElement('text-1', 'forward');
  elements.selectSlideSurface();
  elements.deleteElement('text-1');

  expect(insertedId).toMatch(/^shape-/);
  expect(pointedId).toMatch(/^arrow-/);
  expect(harness.getSession().selectedElementId).toBeNull();
  expect(
    harness.getSession().project.slides[0]?.elements.map((element) => element.id)
  ).not.toContain('text-1');
});

it('inserts elements into the selected non-first slide', () => {
  const project = createCommandsTwoSlideProject();
  const harness = createSessionHarness(project);
  const slides = createSlideCommands(harness.setSession);
  const elements = createElementCommands(harness.setSession);

  slides.selectSlide('slide-2');
  elements.insertElement('shape');

  const insertedId = harness.getSession().selectedElementId;
  const firstSlideElementIds = harness.getSession().project.slides[0]?.elements.map(({ id }) => id);
  const secondSlideElementIds = harness
    .getSession()
    .project.slides[1]?.elements.map(({ id }) => id);
  expect(insertedId).toMatch(/^shape-/);
  expect(firstSlideElementIds).not.toContain(insertedId);
  expect(secondSlideElementIds).toContain(insertedId);
  expect(harness.getSession().selectedSlideId).toBe('slide-2');
});

it('imports image files as persisted image layers on the selected slide', async () => {
  const project = createCommandsTwoSlideProject();
  const harness = createSessionHarness(project);
  const slides = createSlideCommands(harness.setSession);
  const elements = createElementCommands(harness.setSession, project.id, harness.getSession);
  const file = new File(['image'], 'Diagram.png', { type: 'image/png' });

  slides.selectSlide('slide-2');
  await elements.insertImageFile(file);

  const inserted = harness.getSession().project.slides[1]?.elements.at(-1);
  expect(imageImportMocks.readScenarioEditorFileAsDataUrl).toHaveBeenCalledWith(file);
  expect(imageImportMocks.createScenarioV3ImageAsset).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,aW1n',
    projectId: 'project-1',
  });
  expect(imageImportMocks.saveScenarioAsset).not.toHaveBeenCalled();
  expect(inserted).toEqual(
    expect.objectContaining({
      assetRef: { assetId: 'asset-imported', galleryAssetId: null },
      contentTransform: { scale: 1, x: 0, y: 0 },
      editDocumentId: null,
      fit: 'contain',
      frame: { height: 504, width: 896, x: 192, y: 108 },
      kind: 'image',
      name: 'Diagram',
    })
  );
  expect(harness.getSession().selectedElementId).toBe(inserted?.id);
  expect(harness.getSession().selectedSlideId).toBe('slide-2');
});

it('rolls back imported image assets when the project changes before insertion', async () => {
  const project = createCommandsTwoSlideProject();
  const harness = createSessionHarness(project);
  const elements = createElementCommands(harness.setSession, project.id, harness.getSession);
  const file = new File(['image'], 'Stale.png', { type: 'image/png' });

  imageImportMocks.createScenarioV3ImageAsset.mockImplementationOnce(async () => {
    harness.setSession((session) => ({
      ...session,
      project: { ...session.project, id: 'project-2' },
    }));
    return {
      createdAt: 10,
      galleryAssetId: null,
      height: 720,
      id: 'asset-imported',
      mimeType: 'image/png',
      projectId: 'project-1',
      size: 5,
      width: 1280,
    };
  });
  await elements.insertImageFile(file);

  expect(imageImportMocks.deleteScenarioAsset).toHaveBeenCalledWith('asset-imported');
  expect(harness.getSession().project.slides[1]?.elements).toHaveLength(1);
  expect(harness.getSession().selectedElementId).toBeNull();
});

it('rolls back imported image assets when project mutation throws', async () => {
  const project = createCommandsTwoSlideProject();
  const harness = createSessionHarness(project);
  const onOperationError = vi.fn();
  const elements = createElementCommands(
    () => {
      throw new Error('mutation failed');
    },
    project.id,
    harness.getSession,
    onOperationError
  );
  const file = new File(['image'], 'Rollback.png', { type: 'image/png' });

  await expect(elements.insertImageFile(file)).resolves.toBeUndefined();

  expect(imageImportMocks.deleteScenarioAsset).toHaveBeenCalledWith('asset-imported');
  expect(onOperationError).toHaveBeenCalledWith(translate('scenario.editor.v3OperationFailed'));
});

it('preserves selected elements after update and move while they remain reachable', () => {
  const project = createCommandsTwoSlideProject();
  const harness = createSessionHarness(project);
  const slides = createSlideCommands(harness.setSession);
  const elements = createElementCommands(harness.setSession);

  slides.selectSlide('slide-2');
  elements.selectElement('text-2');
  elements.updateElement('text-2', { name: 'Renamed' });
  elements.moveElement('text-2', 'forward');

  expect(harness.getSession().selectedElementId).toBe('text-2');
  expect(harness.getSession().selectedSlideId).toBe('slide-2');
});

it('commits template slide replacement and add-template commands', () => {
  const harness = createSessionHarness();
  const replacement = { ...createScenarioSlide({ title: 'Template' }), id: 'template-slide' };
  const slides = createSlideCommands(harness.setSession);

  slides.replaceSelectedSlide(replacement);
  slides.addTemplateSlide(createScenarioSlide({ title: 'Appended template' }));

  expect(harness.getSession().project.slides[0]?.title).toBe('Template');
  expect(harness.getSession().project.slides.at(-1)?.title).toBe('Appended template');
});

it('applies undo and redo history commands without changing empty history', () => {
  const harness = createSessionHarness();
  const slides = createSlideCommands(harness.setSession);
  const history = createHistoryCommands(harness.setSession);

  history.undo();
  const beforeMutation = harness.getSession().project;
  slides.addSlide();
  history.undo();
  history.redo();

  expect(beforeMutation.slides).toHaveLength(1);
  expect(harness.getSession().project.slides).toHaveLength(2);
});
