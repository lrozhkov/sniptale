import type { FrameData } from '../../../../features/highlighter/contracts';

type FrameBox = Pick<FrameData, 'x' | 'y' | 'width' | 'height'>;
type FrameEffectBox = FrameBox &
  Pick<FrameData, 'borderSettings' | 'blurSettings' | 'focusSettings'>;

function getExpandedFrameBox(frame: FrameBox, borderWidth: number): FrameBox {
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width + borderWidth * 2,
    height: frame.height + borderWidth * 2,
  };
}

function getBorderWidth(frame: Pick<FrameData, 'borderSettings'>): number {
  return frame.borderSettings?.width ?? 3;
}

function getInsetBlurFrameBox(frame: FrameBox, borderWidth: number): FrameBox {
  return {
    x: frame.x + borderWidth,
    y: frame.y + borderWidth,
    width: frame.width,
    height: frame.height,
  };
}

function getInnerFrameBox(frame: FrameEffectBox): FrameBox {
  return getInsetBlurFrameBox(frame, getBorderWidth(frame));
}

export function getFocusMaskBox(frame: FrameEffectBox): FrameBox {
  const showBorder = frame.focusSettings?.showBorder ?? false;
  if (!showBorder) {
    return getInnerFrameBox(frame);
  }

  return getExpandedFrameBox(frame, getBorderWidth(frame));
}

export function createFocusMaskRectNodes(frames: FrameData[]): SVGRectElement[] {
  return frames.map((frame) => {
    const focusMaskBox = getFocusMaskBox(frame);
    const radius = frame.borderSettings?.radius ?? 0;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    rect.dataset['frameId'] = frame.id;
    rect.setAttribute('x', String(focusMaskBox.x));
    rect.setAttribute('y', String(focusMaskBox.y));
    rect.setAttribute('width', String(focusMaskBox.width));
    rect.setAttribute('height', String(focusMaskBox.height));
    rect.setAttribute('fill', 'black');

    if (radius > 0) {
      rect.setAttribute('rx', String(radius));
    }

    return rect;
  });
}

export function getBlurOverlayBox(frame: FrameEffectBox): FrameBox {
  return getInnerFrameBox(frame);
}

export function getBlurBackdropStyle(frame: Pick<FrameData, 'blurSettings'>): {
  backdropFilter: string;
  backgroundColor: string;
  imageRendering: string;
  distortionScale?: number;
} {
  const blurAmount = frame.blurSettings?.amount ?? 8;
  const blurType = frame.blurSettings?.blurType ?? 'gaussian';

  switch (blurType) {
    case 'distortion':
      return {
        backdropFilter: 'url(#sniptale-distortion-filter)',
        backgroundColor: 'transparent',
        imageRendering: 'auto',
        distortionScale: blurAmount * 1.5,
      };
    case 'pixelate':
      return {
        // CSS cannot reproduce true backdrop pixelation here, so keep the blur overlay readable
        // while nudging the renderer toward a chunkier fallback when pixelated data arrives.
        backdropFilter: `blur(${Math.max(1, blurAmount / 3)}px)`,
        backgroundColor: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 8%, transparent)',
        imageRendering: 'pixelated',
      };
    case 'solid': {
      const opacity = Math.min(1, Math.max(0.08, blurAmount / 25));
      return {
        backdropFilter: 'none',
        backgroundColor: `rgb(0 0 0 / ${opacity.toFixed(3)})`,
        imageRendering: 'auto',
      };
    }
    case 'gaussian':
      return {
        backdropFilter: `blur(${blurAmount}px)`,
        // Chromium can drop the visible blur contribution on fully transparent layers.
        // A minimal translucent backing keeps the blur readable without turning it into a solid mask.
        backgroundColor: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 4%, transparent)',
        imageRendering: 'auto',
      };
  }
}
