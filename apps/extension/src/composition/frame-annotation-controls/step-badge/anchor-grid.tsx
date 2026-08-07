import {
  ProductGlassIconButton,
  ProductGlassThreeColumnGrid,
} from '@sniptale/ui/product-glass-controls';
import type { StepBadgeAnchor } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ANCHOR_GRID, getAnchorDotPosition } from './helpers';
import { StepBadgePopoverOffsetGrid } from './offset-grid';

export function StepBadgeAnchorGrid(props: {
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  selectedAnchor: StepBadgeAnchor;
  selectedOffsets: string[];
}) {
  return (
    <div
      className="grid w-full grid-cols-2 items-center gap-4"
      data-ui="content.step-badge.position-controls"
    >
      <div className="flex justify-center">
        <ProductGlassThreeColumnGrid>
          {ANCHOR_GRID.flat().map((anchor) => (
            <ProductGlassIconButton
              key={anchor}
              onClick={() => props.onAnchorChange(anchor)}
              title={anchor}
              active={props.selectedAnchor === anchor}
            >
              <span
                className="sniptale-step-badge-anchor-dot"
                style={getAnchorDotPosition(anchor)}
              />
            </ProductGlassIconButton>
          ))}
        </ProductGlassThreeColumnGrid>
      </div>
      <div className="flex justify-center">
        <StepBadgePopoverOffsetGrid
          onOffsetToggle={props.onOffsetToggle}
          selectedOffsets={props.selectedOffsets}
        />
      </div>
    </div>
  );
}
