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

export function CalloutSettingsPositionGrid(props: {
  anchor: CalloutAnchor;
  anchorGrid?: CalloutAnchor[][];
  onChange: (anchor: CalloutAnchor) => void;
}) {
  const orderedAnchors: CalloutAnchor[] = [
    'middle-left',
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'middle-right',
  ];
  const availableAnchors = new Set(props.anchorGrid?.flat() ?? orderedAnchors);
  const anchors = orderedAnchors.filter((anchor) => availableAnchors.has(anchor));
  return (
    <div
      data-ui="content.callout-settings.position-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 28px)',
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
            title={label}
          >
            <span style={getAnchorDotPosition(anchor)} />
          </ProductGlassIconButton>
        );
      })}
    </div>
  );
}
