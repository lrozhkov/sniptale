import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  resolveFocusCutoutGeometry,
  resolveFrameSurface,
} from '../../../../features/highlighter/frame-surface';
import { getFrameAnnotationBlurBackdropStyle } from '../../../../features/highlighter/frame-annotation/effect-style';

type FrameBox = Pick<FrameData, 'x' | 'y' | 'width' | 'height'>;
type FrameEffectBox = FrameBox &
  Pick<FrameData, 'borderSettings' | 'blurSettings' | 'focusSettings'>;

export function getFocusMaskBox(frame: FrameEffectBox): FrameBox {
  const { x, y, width, height } = resolveFocusCutoutGeometry({
    id: '',
    ...frame,
    effectMode: 'focus',
  });
  return { x, y, width, height };
}

export function setFocusMaskRectBox(rect: SVGRectElement, box: FrameBox): void {
  rect.setAttribute('x', String(box.x));
  rect.setAttribute('y', String(box.y));
  rect.setAttribute('width', String(box.width));
  rect.setAttribute('height', String(box.height));
}

export function createFocusMaskRectNodes(frames: FrameData[], visualScale = 1): SVGRectElement[] {
  return frames.map((frame) => {
    const focusMaskBox = getFocusMaskBox(frame);
    const radius = resolveFocusCutoutGeometry(frame).radius * visualScale;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    rect.dataset['frameId'] = frame.id;
    setFocusMaskRectBox(rect, focusMaskBox);
    rect.setAttribute('fill', 'black');

    if (radius > 0) {
      rect.setAttribute('rx', String(radius));
    }

    return rect;
  });
}

export function getBlurOverlayBox(frame: FrameEffectBox): FrameBox {
  const { x, y, width, height } = resolveFrameSurface({ id: '', ...frame }).geometry;
  return { x, y, width, height };
}

export function getBlurBackdropStyle(frame: Pick<FrameData, 'blurSettings'>): {
  backdropFilter: string;
  backgroundColor: string;
  imageRendering: string;
  distortionScale?: number;
} {
  return getFrameAnnotationBlurBackdropStyle(frame);
}
