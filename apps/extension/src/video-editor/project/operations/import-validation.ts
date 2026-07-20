import { translate } from '../../../platform/i18n';
import {
  PROJECT_ASSET_AUDIO_MIME_TYPES,
  PROJECT_ASSET_IMAGE_MIME_TYPES,
  PROJECT_ASSET_VIDEO_MIME_TYPES,
} from '../../../features/media-hub/project-assets';
import { VideoProjectAssetType } from '../../../features/video/project/types/model';

const IMPORTED_ASSET_SIZE_LIMITS = {
  [VideoProjectAssetType.IMAGE]: 64 * 1024 * 1024,
  [VideoProjectAssetType.AUDIO]: 192 * 1024 * 1024,
  [VideoProjectAssetType.VIDEO]: 512 * 1024 * 1024,
} as const;
const MAX_SIGNATURE_BYTES = 16;

type ImportableProjectAssetType =
  | typeof VideoProjectAssetType.IMAGE
  | typeof VideoProjectAssetType.VIDEO
  | typeof VideoProjectAssetType.AUDIO;
type SignatureMatcher = (bytes: Uint8Array) => boolean;

const IMPORTABLE_PROJECT_ASSET_MIME_TYPES = {
  [VideoProjectAssetType.IMAGE]: PROJECT_ASSET_IMAGE_MIME_TYPES,
  [VideoProjectAssetType.VIDEO]: PROJECT_ASSET_VIDEO_MIME_TYPES,
  [VideoProjectAssetType.AUDIO]: PROJECT_ASSET_AUDIO_MIME_TYPES,
} as const satisfies Record<ImportableProjectAssetType, readonly string[]>;

const PROJECT_ASSET_ACCEPT_ATTRIBUTE = {
  [VideoProjectAssetType.IMAGE]:
    IMPORTABLE_PROJECT_ASSET_MIME_TYPES[VideoProjectAssetType.IMAGE].join(','),
  [VideoProjectAssetType.VIDEO]:
    IMPORTABLE_PROJECT_ASSET_MIME_TYPES[VideoProjectAssetType.VIDEO].join(','),
  [VideoProjectAssetType.AUDIO]:
    IMPORTABLE_PROJECT_ASSET_MIME_TYPES[VideoProjectAssetType.AUDIO].join(','),
} as const satisfies Record<ImportableProjectAssetType, string>;

export const PROJECT_MEDIA_ACCEPT_ATTRIBUTE = [
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.IMAGE],
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.VIDEO],
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.AUDIO],
].join(',');
export const PROJECT_IMAGE_ACCEPT_ATTRIBUTE =
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.IMAGE];
export const PROJECT_VIDEO_ACCEPT_ATTRIBUTE =
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.VIDEO];
export const PROJECT_AUDIO_ACCEPT_ATTRIBUTE =
  PROJECT_ASSET_ACCEPT_ATTRIBUTE[VideoProjectAssetType.AUDIO];

function throwTooLarge(): never {
  throw new Error(translate('videoEditor.app.importAssetTooLarge'));
}

function throwUnsupported(): never {
  throw new Error(translate('videoEditor.app.importAssetUnsupported'));
}

function hasAsciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function hasPngSignature(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasGifSignature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'GIF87a') || hasAsciiAt(bytes, 0, 'GIF89a');
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'RIFF') && hasAsciiAt(bytes, 8, 'WEBP');
}

function hasWebmSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function hasMp4Signature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 4, 'ftyp');
}

function hasAvifSignature(bytes: Uint8Array): boolean {
  return hasMp4Signature(bytes) && (hasAsciiAt(bytes, 8, 'avif') || hasAsciiAt(bytes, 8, 'avis'));
}

function hasGenericMp4Signature(bytes: Uint8Array): boolean {
  return hasMp4Signature(bytes) && !hasAvifSignature(bytes);
}

function hasOggSignature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'OggS');
}

function hasWavSignature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'RIFF') && hasAsciiAt(bytes, 8, 'WAVE');
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
}

function hasFlacSignature(bytes: Uint8Array): boolean {
  return hasAsciiAt(bytes, 0, 'fLaC');
}

const SIGNATURE_MATCHERS: Record<ImportableProjectAssetType, Record<string, SignatureMatcher>> = {
  [VideoProjectAssetType.IMAGE]: {
    'image/png': hasPngSignature,
    'image/jpeg': hasJpegSignature,
    'image/gif': hasGifSignature,
    'image/webp': hasWebpSignature,
    'image/avif': hasAvifSignature,
  },
  [VideoProjectAssetType.VIDEO]: {
    'video/webm': hasWebmSignature,
    'video/mp4': hasGenericMp4Signature,
    'video/quicktime': hasGenericMp4Signature,
  },
  [VideoProjectAssetType.AUDIO]: {
    'audio/webm': hasWebmSignature,
    'audio/mp4': hasGenericMp4Signature,
    'audio/ogg': hasOggSignature,
    'audio/wav': hasWavSignature,
    'audio/wave': hasWavSignature,
    'audio/x-wav': hasWavSignature,
    'audio/mpeg': hasMp3Signature,
    'audio/flac': hasFlacSignature,
    'audio/x-flac': hasFlacSignature,
  },
};

function getSignatureMatcher(
  assetType: ImportableProjectAssetType,
  mimeType: string
): SignatureMatcher | null {
  const [baseMimeType] = mimeType.toLowerCase().split(';', 1);
  return baseMimeType ? (SIGNATURE_MATCHERS[assetType][baseMimeType] ?? null) : null;
}

async function readFileSignature(file: File): Promise<Uint8Array> {
  const signature = await file.slice(0, MAX_SIGNATURE_BYTES).arrayBuffer();
  return new Uint8Array(signature);
}

export async function assertImportableProjectAssetFile(
  file: File,
  assetType: ImportableProjectAssetType
): Promise<void> {
  if (file.size > IMPORTED_ASSET_SIZE_LIMITS[assetType]) {
    throwTooLarge();
  }

  const signatureMatcher = getSignatureMatcher(assetType, file.type);

  if (!signatureMatcher || !signatureMatcher(await readFileSignature(file))) {
    throwUnsupported();
  }
}
