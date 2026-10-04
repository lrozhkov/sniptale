import { useRef } from 'react';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { changeGuideImageGeometry } from './image-geometry';

/** Shows the source raster and the frame footprint in the same coordinate space. */
export function GuideImageOverview({
  block,
  url,
  dimensions,
  disabled,
  onChange,
  t,
}: {
  block: GuideImageBlock;
  url: string | null | undefined;
  dimensions: { width: number; height: number } | null;
  disabled: boolean;
  onChange: (block: GuideImageBlock) => void;
  t: Translate;
}) {
  const drag = useRef<{ pointerId: number; origin: GuideImageBlock } | null>(null);
  if (!url || !dimensions) return null;
  const fit = (block.fit === 'cover' ? Math.max : Math.min)(
    block.frame.width / dimensions.width,
    block.frame.height / dimensions.height
  );
  const width = block.frame.width / (dimensions.width * fit * block.contentTransform.scale);
  const height = block.frame.height / (dimensions.height * fit * block.contentTransform.scale);
  const move = (element: HTMLElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onChange(
      changeGuideImageGeometry(block, {
        kind: 'pan',
        x: (0.5 - (x - rect.left) / rect.width) / width,
        y: (0.5 - (y - rect.top) / rect.height) / height,
      })
    );
  };
  return (
    <div className="guide-image-overview">
      <div
        className="guide-image-overview-map"
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('scenario.editor.guideImageOverview')}
        style={{
          width: `min(100%, ${(240 * dimensions.width) / dimensions.height}px)`,
          aspectRatio: `${dimensions.width} / ${dimensions.height}`,
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, origin: block };
          move(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!disabled && drag.current?.pointerId === event.pointerId)
            move(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current) onChange(drag.current.origin);
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          if (drag.current) onChange(drag.current.origin);
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (disabled || !direction) return;
          event.preventDefault();
          event.stopPropagation();
          onChange(
            changeGuideImageGeometry(block, {
              kind: 'pan',
              x: block.contentTransform.x - (direction[0]! * 0.02) / width,
              y: block.contentTransform.y - (direction[1]! * 0.02) / height,
            })
          );
        }}
      >
        <img src={url} alt="" draggable={false} />
        <span
          className="guide-image-overview-region"
          aria-hidden="true"
          style={{
            left: `${(0.5 - (0.5 + block.contentTransform.x) * width) * 100}%`,
            top: `${(0.5 - (0.5 + block.contentTransform.y) * height) * 100}%`,
            width: `${width * 100}%`,
            height: `${height * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
