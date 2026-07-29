import type { FrameData } from '../../../../features/highlighter/contracts';
import { areDescriptorListsEqual } from './descriptor-equality';

export type FocusFrameDescriptor = {
  borderRadius: number | undefined;
  id: string;
  height: number;
  opacity: number | undefined;
  width: number;
  x: number;
  y: number;
};

export type BlurFrameDescriptor = {
  amount: number | undefined;
  blurType: string | undefined;
  borderRadius: number | undefined;
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
};

export function buildFocusFrameDescriptors(frames: FrameData[]): FocusFrameDescriptor[] {
  return frames
    .filter((frame) => frame.effectMode === 'focus')
    .map((frame) => ({
      borderRadius: frame.borderSettings?.radius,
      id: frame.id,
      height: frame.height,
      opacity: frame.focusSettings?.opacity,
      width: frame.width,
      x: frame.x,
      y: frame.y,
    }));
}

export function buildBlurFrameDescriptors(frames: FrameData[]): BlurFrameDescriptor[] {
  return frames
    .filter((frame) => frame.effectMode === 'blur')
    .map((frame) => ({
      amount: frame.blurSettings?.amount,
      blurType: frame.blurSettings?.blurType,
      borderRadius: frame.borderSettings?.radius,
      height: frame.height,
      id: frame.id,
      width: frame.width,
      x: frame.x,
      y: frame.y,
    }));
}

export function areFocusFrameDescriptorsEqual(
  next: FocusFrameDescriptor[],
  current: FocusFrameDescriptor[]
): boolean {
  return areDescriptorListsEqual(next, current);
}

export function areBlurFrameDescriptorsEqual(
  next: BlurFrameDescriptor[],
  current: BlurFrameDescriptor[]
): boolean {
  return areDescriptorListsEqual(next, current);
}
