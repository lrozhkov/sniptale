import { createLogger } from '@sniptale/platform/observability/logger';
import { resolveFroalaPopupUrlFromImage } from './driver';

const logger = createLogger({ namespace: 'ContentFroalaPopup' });

function buildDownloadUrl(previewSrc: string, uuid: string): string | null {
  if (previewSrc.includes('download?uuid')) {
    return previewSrc.replace(/[&?]thumb=true/g, '').replace(/[&?]thumbnail=\d+/g, '');
  }
  if (previewSrc.includes('preview?uuid')) {
    return previewSrc.replace('preview?uuid', 'download?uuid');
  }
  return uuid ? `./download?uuid=file$${uuid}` : null;
}

async function getFullImageUrl(
  imgElement: HTMLImageElement,
  targetDocument?: Document
): Promise<string | null> {
  const src = imgElement.src || '';
  const uuid = src.match(/uuid=file\$(\w+)/)?.[1] || '';

  return resolveFroalaPopupUrlFromImage({
    imgElement,
    fallbackUrl: buildDownloadUrl(src, uuid),
    ...(targetDocument === undefined ? {} : { targetDocument }),
    onClickError: (error) => {
      logger.warn('Preview image click failed', error);
    },
  });
}

export async function extractFullImageUrls(
  images: Array<{ uuid: string; src: string; element?: HTMLImageElement }>,
  targetDocument?: Document
): Promise<Array<{ uuid: string; previewSrc: string; fullUrl: string | null }>> {
  const resolvedImages = await Promise.all(
    images.map(async (image) => {
      if (!image.element) {
        return null;
      }

      return {
        uuid: image.uuid,
        previewSrc: image.src,
        fullUrl: await getFullImageUrl(image.element, targetDocument),
      };
    })
  );

  return resolvedImages.filter(
    (image): image is { uuid: string; previewSrc: string; fullUrl: string | null } => image !== null
  );
}
