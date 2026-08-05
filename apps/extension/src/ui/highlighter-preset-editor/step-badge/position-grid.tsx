import type {
  StepBadgeAnchor,
  StepBadgeOffsetDirection,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  ProductGlassArrowGrid,
  ProductGlassDimMarker,
  ProductGlassIconButton,
} from '@sniptale/ui/product-glass-controls';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { translate } from '../../../platform/i18n';

const anchors: StepBadgeAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export function StepBadgePositionGrid(props: {
  anchor: StepBadgeAnchor;
  offsets: StepBadgeOffsetDirection[];
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onOffsetToggle: (direction: StepBadgeOffsetDirection) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 items-center gap-4">
      <div className="flex justify-center">
        <div className="grid w-24 grid-cols-3 gap-1 rounded-lg border border-[var(--sniptale-color-border-soft)] p-1">
          {anchors.map((anchor) => (
            <button
              aria-pressed={props.anchor === anchor}
              className={[
                'grid aspect-square place-items-center rounded-md border-0',
                props.anchor === anchor
                  ? 'bg-[var(--sniptale-color-accent-soft)]'
                  : 'bg-transparent hover:bg-[var(--sniptale-color-surface-hover)]',
              ].join(' ')}
              key={anchor}
              onClick={() => props.onAnchorChange(anchor)}
              type="button"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--sniptale-color-text-primary)]" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center">
        <ProductGlassArrowGrid>
          <span />
          <OffsetButton direction="up" Icon={ArrowUp} {...props} />
          <span />
          <OffsetButton direction="left" Icon={ArrowLeft} {...props} />
          <ProductGlassDimMarker>±</ProductGlassDimMarker>
          <OffsetButton direction="right" Icon={ArrowRight} {...props} />
          <span />
          <OffsetButton direction="down" Icon={ArrowDown} {...props} />
          <span />
        </ProductGlassArrowGrid>
      </div>
    </div>
  );
}

function OffsetButton(props: {
  direction: StepBadgeOffsetDirection;
  Icon: typeof ArrowUp;
  offsets: StepBadgeOffsetDirection[];
  onOffsetToggle: (direction: StepBadgeOffsetDirection) => void;
}) {
  return (
    <ProductGlassIconButton
      active={props.offsets.includes(props.direction)}
      onClick={() => props.onOffsetToggle(props.direction)}
      title={translate(`content.stepBadge.offset${capitalize(props.direction)}`)}
    >
      <props.Icon size={14} />
    </ProductGlassIconButton>
  );
}

function capitalize(value: StepBadgeOffsetDirection) {
  return `${value[0]!.toUpperCase()}${value.slice(1)}` as 'Up' | 'Down' | 'Left' | 'Right';
}
