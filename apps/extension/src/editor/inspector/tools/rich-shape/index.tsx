import { canUseRichShapeRoughControls, resolveRichShapeCapabilities } from './capabilities';
import { RichShapeEffectsSection } from './effects';
import { RichShapeFillSection } from './fill';
import { RichShapeLineSection } from './line';
import { RichShapeTailSection } from './tail';
import { RichShapeTextSection } from './text';
import type { RichShapeControlsProps } from './types';

function hasCapability(
  props: RichShapeControlsProps,
  capability: RichShapeControlsProps['capabilities'][number]
) {
  return props.capabilities.includes(capability);
}

export function renderRichShapeControlsSection(
  props: Omit<RichShapeControlsProps, 'capabilities' | 'roughCapable'>
) {
  const capabilities = resolveRichShapeCapabilities(props.shape);
  const roughCapable = canUseRichShapeRoughControls(props.shape);
  const richShapeProps = { ...props, capabilities, roughCapable };

  return (
    <div className="space-y-3">
      {hasCapability(richShapeProps, 'line') ? <RichShapeLineSection {...richShapeProps} /> : null}
      {hasCapability(richShapeProps, 'fill') ? <RichShapeFillSection {...richShapeProps} /> : null}
      {hasCapability(richShapeProps, 'text') ? <RichShapeTextSection {...richShapeProps} /> : null}
      <RichShapeTailSection {...richShapeProps} />
      {hasCapability(richShapeProps, 'effects') ? (
        <RichShapeEffectsSection {...richShapeProps} />
      ) : null}
    </div>
  );
}
