import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type {
  GuideProject,
  GuideImageBlock,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { generateTourFromGuide, type TourMaterial } from '../../features/scenario/project/public';
import { hasSameEditorImageGeometry } from '../../features/editor/document/public';
import { findScenarioImageEditorSource } from './source';

type LoadedSource = NonNullable<Awaited<ReturnType<typeof findScenarioImageEditorSource>>>;
function originalGeometry(source: LoadedSource): boolean {
  const document = source.document?.document;
  if (!document) return true;
  return hasSameEditorImageGeometry(document, {
    ...document,
    sourceImageData: source.dataUrl,
    sourceWidth: source.width,
    sourceHeight: source.height,
    canvasWidth: source.width,
    canvasHeight: source.height,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: source.width,
    sourceDisplayHeight: source.height,
    canvasJson: '{"objects":[]}',
  });
}
function material(
  block: GuideImageBlock,
  loaded: LoadedSource
): Omit<TourMaterial, 'title' | 'description' | 'origin'> {
  const unchanged = originalGeometry(loaded);
  const source = block.source;
  const viewport = source.kind === 'capture' ? source.page.viewport : null;
  const visible =
    unchanged &&
    source.kind === 'capture' &&
    source.captureSurface === 'visible' &&
    viewport &&
    viewport.width > 0 &&
    viewport.height > 0 &&
    Math.abs(loaded.width - (loaded.height * viewport.width) / viewport.height) <= 1;
  return {
    image: {
      assetId: block.assetId,
      editDocumentId: block.editDocumentId,
      galleryAssetId: block.galleryAssetId,
      width: loaded.width,
      height: loaded.height,
      alt: block.alt,
      source: structuredClone(source),
    },
    videoGeometryUnchanged: unchanged,
    ...(visible ? { captureMapping: { sourceRect: { ...viewport }, rotation: 0 as const } } : {}),
  };
}

/** Loads owned intrinsic geometry without mutating either representation or allocating new media. */
export async function prepareTourFromGuide(args: {
  project: GuideProject;
  textOnly: 'navigation' | 'report';
  signal: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}) {
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok' || parsed.project.purpose === 'step-template')
    throw new Error('Invalid scenario project.');
  const project = parsed.project;
  const blocks = project.items.flatMap((item) =>
    item.kind === 'step' ? item.blocks.filter((block) => block.kind === 'image') : []
  );
  const materials = new Map<string, ReturnType<typeof material>>();
  let completed = 0;
  for (const block of blocks) {
    args.signal.throwIfAborted();
    const source = await findScenarioImageEditorSource(project.id, block);
    args.signal.throwIfAborted();
    if (source) materials.set(block.id, material(block, source));
    args.onProgress?.(++completed, blocks.length);
  }
  args.signal.throwIfAborted();
  return generateTourFromGuide(project, (block) => materials.get(block.id) ?? null, args.textOnly);
}
