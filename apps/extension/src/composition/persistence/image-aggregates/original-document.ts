import type { EditorDocument } from '../../../features/editor/document/types';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { getMediaAssetBlob, getMediaLibraryEntry } from '../media-library/index.library';
import { ImageAggregateNotFoundError } from './errors';

export async function createOriginalImageDocument(
  media: MediaLibraryEntry & { blob: Blob }
): Promise<EditorDocument> {
  const width = media.width;
  const height = media.height;
  if (!width || !height) throw new ImageAggregateNotFoundError(media.id);
  return {
    version: 2,
    sourceImageData: await blobToDataUrl(media.blob),
    sourceName: media.originalFilename,
    sourceWidth: width,
    sourceHeight: height,
    canvasWidth: width,
    canvasHeight: height,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: width,
    sourceDisplayHeight: height,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundBlurAmount: 0,
      backgroundColor: 'transparent',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      backgroundGradientAngle: 0,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: JSON.stringify({ version: '7.2.0', objects: [] }),
  };
}

/** Reads the retained source bytes without changing the current workspace. */
export async function readImageAggregateOriginalDocument(
  aggregateId: string
): Promise<EditorDocument | null> {
  const [media, blob] = await Promise.all([
    getMediaLibraryEntry(aggregateId),
    getMediaAssetBlob(aggregateId),
  ]);
  if (!media || !blob || (media.kind !== 'image' && media.kind !== 'screenshot')) return null;
  return createOriginalImageDocument({ ...media, blob });
}
