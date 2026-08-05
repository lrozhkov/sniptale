import type {
  StepBadgeAnchor,
  StepBadgeOffsetDirection,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ProductGlassMiniButton } from '@sniptale/ui/product-glass-controls';
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
    <div className="grid gap-2">
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
      <div className="flex gap-1">
        {(
          [
            ['up', ArrowUp, 'content.stepBadge.offsetUp'],
            ['left', ArrowLeft, 'content.stepBadge.offsetLeft'],
            ['right', ArrowRight, 'content.stepBadge.offsetRight'],
            ['down', ArrowDown, 'content.stepBadge.offsetDown'],
          ] as const
        ).map(([direction, Icon, label]) => (
          <ProductGlassMiniButton
            active={props.offsets.includes(direction)}
            key={direction}
            onClick={() => props.onOffsetToggle(direction)}
            title={translate(label)}
          >
            <Icon size={13} />
          </ProductGlassMiniButton>
        ))}
      </div>
    </div>
  );
}
