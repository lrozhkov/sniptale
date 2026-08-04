import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import type { CalloutAnchor } from '@sniptale/runtime-contracts/highlighter/callout';
import { translate, type TranslationKey } from '../../../platform/i18n';

function getAnchorDotPosition(anchor: CalloutAnchor) {
  const horizontal = anchor.endsWith('left') ? '25%' : anchor.endsWith('right') ? '75%' : '50%';
  const vertical = anchor.startsWith('top') ? '25%' : anchor.startsWith('bottom') ? '75%' : '50%';
  return {
    background: 'currentColor',
    borderRadius: '50%',
    height: 5,
    left: horizontal,
    position: 'absolute' as const,
    top: vertical,
    transform: 'translate(-50%, -50%)',
    width: 5,
  };
}

const ANCHOR_LABEL_KEYS: Record<CalloutAnchor, TranslationKey> = {
  'middle-left': 'content.callout.anchor.middleLeft',
  'top-left': 'content.callout.anchor.topLeft',
  'top-center': 'content.callout.anchor.topCenter',
  'top-right': 'content.callout.anchor.topRight',
  'bottom-left': 'content.callout.anchor.bottomLeft',
  'bottom-center': 'content.callout.anchor.bottomCenter',
  'bottom-right': 'content.callout.anchor.bottomRight',
  'middle-right': 'content.callout.anchor.middleRight',
  center: 'content.callout.positionSection',
};

const ROW_ANCHORS: CalloutAnchor[] = [
  'middle-left',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'middle-right',
];

const SQUARE_ANCHORS: CalloutAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const SQUARE_GRID_POSITION: Partial<Record<CalloutAnchor, { column: number; row: number }>> = {
  'top-left': { column: 1, row: 1 },
  'top-center': { column: 2, row: 1 },
  'top-right': { column: 3, row: 1 },
  'middle-left': { column: 1, row: 2 },
  'middle-right': { column: 3, row: 2 },
  'bottom-left': { column: 1, row: 3 },
  'bottom-center': { column: 2, row: 3 },
  'bottom-right': { column: 3, row: 3 },
};

export function CalloutSettingsPositionGrid(props: {
  anchor: CalloutAnchor;
  anchorGrid?: CalloutAnchor[][];
  layout?: 'row' | 'square';
  onChange: (anchor: CalloutAnchor) => void;
}) {
  const layout = props.layout ?? 'row';
  const orderedAnchors = layout === 'square' ? SQUARE_ANCHORS : ROW_ANCHORS;
  const availableAnchors = new Set(props.anchorGrid?.flat() ?? ROW_ANCHORS);
  const anchors = orderedAnchors.filter((anchor) => availableAnchors.has(anchor));
  return (
    <div
      data-ui="content.callout-settings.position-row"
      data-position-layout={layout}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout === 'square' ? 3 : 8}, 28px)`,
        gap: 4,
        justifyContent: 'center',
      }}
    >
      {anchors.map((anchor) => {
        const label = translate(ANCHOR_LABEL_KEYS[anchor]);
        return (
          <ProductGlassIconButton
            key={anchor}
            active={props.anchor === anchor}
            aria-label={label}
            data-callout-anchor={anchor}
            onClick={() => props.onChange(anchor)}
            style={
              layout === 'square' && SQUARE_GRID_POSITION[anchor]
                ? {
                    gridColumn: SQUARE_GRID_POSITION[anchor].column,
                    gridRow: SQUARE_GRID_POSITION[anchor].row,
                  }
                : undefined
            }
            title={label}
          >
            <span style={getAnchorDotPosition(anchor)} />
          </ProductGlassIconButton>
        );
      })}
    </div>
  );
}
