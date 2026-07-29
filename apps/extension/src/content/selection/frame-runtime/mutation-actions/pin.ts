import type { FrameData } from '../../../../features/highlighter/contracts';
import type { UseFrameMutationActionHelperOptions } from './types';
import { resolveDocumentPagePlacement } from '../../../platform/frame';

export function createPinFrameAtLastPlacementHandler(
  args: Pick<
    UseFrameMutationActionHelperOptions,
    'framesRef' | 'hostLayoutServiceRef' | 'setFrames'
  >
) {
  return (frameId: string): boolean => {
    const placement = args.hostLayoutServiceRef.current.getLastGoodPagePlacement(frameId);
    if (
      !placement ||
      !Number.isFinite(placement.pageX) ||
      !Number.isFinite(placement.pageY) ||
      !Array.isArray(placement.iframePath) ||
      !placement.iframePath.every((selector) => typeof selector === 'string')
    ) {
      return false;
    }
    const point = resolveDocumentPagePlacement(placement);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

    let converted = false;
    const frames = args.framesRef.current.map((frame): FrameData => {
      if (frame.id !== frameId || !frame.linkedElementSelector) return frame;
      const { linkedElementSelector: _selector, offset: _offset, ...rest } = frame;
      converted = true;
      return {
        ...rest,
        x: point.x,
        y: point.y,
        pagePlacement: { ...placement, iframePath: [...placement.iframePath] },
      };
    });
    if (!converted) return false;
    args.framesRef.current = frames;
    args.setFrames(frames);
    args.hostLayoutServiceRef.current.unlink(frameId);
    return converted;
  };
}
