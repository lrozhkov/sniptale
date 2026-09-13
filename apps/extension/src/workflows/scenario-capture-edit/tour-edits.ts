import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isEditorDocument } from '../../features/editor/document/guards';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  hasSameEditorImageGeometry,
  type EditorDocument,
} from '../../features/editor/document/public';
import { remapTourImageGeometry } from '../../features/scenario/project/public';
import { commitScenarioAggregateMutation } from '../../composition/persistence/scenario/aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../../composition/persistence/scenario/asset-staging';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { loadScenarioImageEditorSource } from './source';
import { discardPreparedScenarioAsset } from '../../composition/persistence/scenario/projects';
import { prepareScenarioEditedCaptureAsset } from './edits';
import type { TourImageEditTarget } from './tour-source';

function rasterDocument(dataUrl: string, width: number, height: number): EditorDocument {
  return {
    version: 2,
    sourceImageData: dataUrl,
    sourceName: null,
    sourceWidth: width,
    sourceHeight: height,
    canvasWidth: width,
    canvasHeight: height,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: width,
    sourceDisplayHeight: height,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"objects":[]}',
  };
}

/** One resource transaction, preserving both guide content and previous immutable image versions. */
export async function applyTourImageEdit(args: {
  project: GuideProject;
  baseUpdatedAt: number;
  target: TourImageEditTarget;
  dataUrl: string;
  document: EditorDocument;
  allowTargetReview?: boolean;
}): Promise<{ status: 'applied'; project: GuideProject } | { status: 'requires-target-review' }> {
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok' || !isImageDataUrl(args.dataUrl) || !isEditorDocument(args.document))
    throw new Error('Invalid tour image edit.');
  const project = parsed.project;
  const slide = project.tour?.slides.find((entry) => entry.id === args.target.slideId);
  const image = slide?.kind === 'image' ? slide.image : slide?.background.image;
  if (
    !slide ||
    !image ||
    project.id !== args.target.projectId ||
    image.assetId !== args.target.assetId ||
    image.editDocumentId !== args.target.editDocumentId ||
    (slide.kind === 'image' ? 'image' : 'background') !== args.target.role
  )
    throw new Error('The edited tour image target has changed.');
  const source = await loadScenarioImageEditorSource(project.id, image);
  const baseline =
    source.document?.document ?? rasterDocument(source.dataUrl, source.width, source.height);
  const same =
    hasSameEditorImageGeometry(baseline, args.document) &&
    baseline.canvasWidth * source.height === baseline.canvasHeight * source.width;
  let geometry =
    slide.kind === 'image' ? remapTourImageGeometry(slide, same ? [1, 0, 0, 1, 0, 0] : null) : null;
  if (geometry?.status === 'requires-target-review' && !args.allowTargetReview)
    return { status: 'requires-target-review' };
  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: args.dataUrl,
    projectId: project.id,
    galleryAssetId: image.galleryAssetId,
  });
  let handedOff = false;
  if (
    slide.kind === 'image' &&
    args.document.canvasWidth * prepared.asset.height !==
      args.document.canvasHeight * prepared.asset.width
  ) {
    geometry = remapTourImageGeometry(slide, null);
    if (geometry.status === 'requires-target-review' && !args.allowTargetReview) {
      await discardPreparedScenarioAsset(prepared.entry);
      return { status: 'requires-target-review' };
    }
  }
  try {
    const documentId = crypto.randomUUID();
    const replacement = {
      ...image,
      assetId: prepared.asset.id,
      editDocumentId: documentId,
      width: prepared.asset.width,
      height: prepared.asset.height,
    };
    if (slide.kind === 'image' && geometry)
      Object.assign(slide, geometry.slide, { image: replacement });
    else if (slide.kind === 'navigation') slide.background.image = replacement;
    handedOff = true;
    const result = await commitScenarioAggregateMutation(project, {
      expectedUpdatedAt: args.baseUpdatedAt,
      children: {
        assetPuts: [prepared.entry],
        editorDocumentPuts: [
          {
            projectId: project.id,
            stepId: documentId,
            document: args.document,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
    });
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return { status: 'applied', project: result.project };
  } catch (error) {
    if (!handedOff)
      return rejectScenarioMutationBeforeHandoff({ assetPuts: [prepared.entry] }, error);
    throw error;
  }
}
