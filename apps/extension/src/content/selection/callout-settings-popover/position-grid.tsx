import {
  ProductGlassIconButton,
  ProductGlassThreeColumnGrid,
} from '@sniptale/ui/product-glass-controls';
import type { CalloutAnchor, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { CalloutSettingsSideGrid } from './side-grid';
import { getAnchorDotPosition } from './anchor-grid';

export function CalloutSettingsPositionGrid(props: {
  anchor: CalloutAnchor;
  anchorGrid: CalloutAnchor[][];
  onAnchorChange: (anchor: CalloutAnchor) => void;
  onSideChange: (side: CalloutSide) => void;
  side: CalloutSide;
}) {
  return (
    <>
      <ProductGlassThreeColumnGrid>
        {props.anchorGrid.flat().map((anchor) => (
          <ProductGlassIconButton
            key={anchor}
            onClick={() => props.onAnchorChange(anchor)}
            title={anchor}
            active={props.anchor === anchor}
          >
            <span style={getAnchorDotPosition(anchor)} />
          </ProductGlassIconButton>
        ))}
      </ProductGlassThreeColumnGrid>
      <CalloutSettingsSideGrid onSideChange={props.onSideChange} side={props.side} />
    </>
  );
}
