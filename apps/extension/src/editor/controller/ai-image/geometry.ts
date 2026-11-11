import { IMAGE_JOB_LIMITS } from '../../../contracts/ai/image';
import type { ImageBounds, ImageCaptureContext } from './types';

/** Adds only empty margins. The complete disclosed context must fit without resampling or trimming. */
export function padImageBounds(
  content: ImageBounds,
  size: { width: number; height: number }
): ImageBounds {
  const native = integerImageBounds(content);
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width < native.width ||
    size.height < native.height
  )
    throw new Error('output-too-small');
  return integerImageBounds({
    left: native.left - Math.floor((size.width - native.width) / 2),
    top: native.top - Math.floor((size.height - native.height) / 2),
    width: size.width,
    height: size.height,
  });
}

/** Uses document pixels, independent of interactive zoom and device pixel ratio. */
export function integerImageBounds(bounds: ImageBounds): ImageBounds {
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new Error('invalid-region');
  const left = Math.floor(bounds.left),
    top = Math.floor(bounds.top);
  const width = Math.ceil(bounds.left + bounds.width) - left;
  const height = Math.ceil(bounds.top + bounds.height) - top;
  if (width * height > IMAGE_JOB_LIMITS.maxImagePixels) throw new Error('too-large');
  return { left, top, width, height };
}

/** Context adds pixels around the target and never scales or excludes selected pixels. */
export function imageContextBounds(
  target: ImageBounds,
  document: ImageBounds,
  mode: ImageCaptureContext
): ImageBounds {
  const selection = integerImageBounds(target);
  if (mode === 'region') return selection;
  if (mode === 'whole') return integerImageBounds(document);
  const padding = Math.min(
    128,
    Math.max(32, Math.ceil(Math.max(selection.width, selection.height) / 4))
  );
  const left = Math.max(document.left, selection.left - padding);
  const top = Math.max(document.top, selection.top - padding);
  const right = Math.min(
    document.left + document.width,
    selection.left + selection.width + padding
  );
  const bottom = Math.min(
    document.top + document.height,
    selection.top + selection.height + padding
  );
  try {
    return integerImageBounds({ left, top, width: right - left, height: bottom - top });
  } catch {
    return selection;
  }
}

/** Maps a target crop only when native pixels cover the disclosed input, or after explicit Fit consent. */
export function imageResultCrop(
  input: ImageBounds,
  target: ImageBounds,
  result: { width: number; height: number },
  fit: boolean
): ImageBounds {
  const scaleX = fit ? result.width / input.width : 1;
  const scaleY = fit ? result.height / input.height : 1;
  const left = (target.left - input.left) * scaleX;
  const top = (target.top - input.top) * scaleY;
  const width = target.width * scaleX,
    height = target.height * scaleY;
  if (!fit && (result.width !== input.width || result.height !== input.height))
    throw new Error('size-mismatch');
  if (
    left < 0 ||
    top < 0 ||
    left + width > result.width + 0.001 ||
    top + height > result.height + 0.001
  )
    throw new Error('size-mismatch');
  return { left, top, width, height };
}
