import { deleteScenarioAsset } from '../../composition/persistence/scenario/projects';
import { createScenarioImageElement } from '../../features/scenario/project/v3';
import { createScenarioV3ImageAsset } from '../../composition/persistence/scenario/store/v3';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  ScenarioElementFrame,
  ScenarioImageElement,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { readScenarioEditorFileAsDataUrl } from './file-reader';
import { insertSlideElementIntoSession } from './session-element-insert';
import type { ScenarioV3EditorSession } from './types';

type SetSession = (update: (session: ScenarioV3EditorSession) => ScenarioV3EditorSession) => void;
type GetSession = () => ScenarioV3EditorSession;

export async function insertImageFileIntoSelectedSlide(args: {
  file: File | undefined;
  getSession: GetSession | null;
  projectId: string | null;
  setSession: SetSession;
}): Promise<void> {
  if (!args.file || !args.projectId || !args.getSession) {
    return;
  }

  const initialSession = args.getSession();
  const slideId = initialSession.selectedSlideId ?? initialSession.project.slides[0]?.id;
  if (initialSession.project.id !== args.projectId || !slideId) {
    return;
  }

  const dataUrl = await readScenarioEditorFileAsDataUrl(args.file);
  const asset = await createScenarioV3ImageAsset({ dataUrl, projectId: args.projectId });
  const latestSession = args.getSession();
  const slide = latestSession.project.slides.find((candidate) => candidate.id === slideId);
  if (latestSession.project.id !== args.projectId || !slide) {
    await deleteScenarioAsset(asset.id);
    return;
  }

  const element = createImportedImageElement(args.file, asset, slide);
  try {
    args.setSession((session) =>
      insertImportedImageElement(session, args.projectId ?? '', slideId, element)
    );
  } catch (error: unknown) {
    await rollbackImportedImageAsset(asset.id, error);
  }
}

function createImportedImageElement(
  file: File,
  asset: ScenarioAssetEntry,
  slide: ScenarioSlide
): ScenarioImageElement {
  return createScenarioImageElement({
    assetRef: { assetId: asset.id, galleryAssetId: asset.galleryAssetId },
    contentTransform: { scale: 1, x: 0, y: 0 },
    editDocumentId: null,
    fit: 'contain',
    frame: createCenteredImageFrame(slide, asset),
    name: getImportedImageElementName(file),
  });
}

function insertImportedImageElement(
  session: ScenarioV3EditorSession,
  projectId: string,
  slideId: string,
  element: ScenarioImageElement
): ScenarioV3EditorSession {
  if (session.project.id !== projectId) {
    return session;
  }

  return insertSlideElementIntoSession({ element, session, slideId });
}

function createCenteredImageFrame(
  slide: ScenarioSlide,
  asset: Pick<ScenarioAssetEntry, 'height' | 'width'>
): ScenarioElementFrame {
  const naturalWidth = Math.max(1, asset.width);
  const naturalHeight = Math.max(1, asset.height);
  const maxWidth = Math.max(1, slide.canvas.width * 0.7);
  const maxHeight = Math.max(1, slide.canvas.height * 0.7);
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  return {
    height,
    width,
    x: Math.round((slide.canvas.width - width) / 2),
    y: Math.round((slide.canvas.height - height) / 2),
  };
}

async function rollbackImportedImageAsset(assetId: string, cause: unknown): Promise<never> {
  try {
    await deleteScenarioAsset(assetId);
  } catch (rollbackError: unknown) {
    throw new AggregateError(
      [cause, rollbackError],
      'Failed to insert scenario image layer and roll back image asset'
    );
  }

  throw cause;
}

function getImportedImageElementName(file: File): string {
  const name = file.name.trim().replace(/\.[a-z0-9]+$/i, '');
  return name || 'Image';
}
