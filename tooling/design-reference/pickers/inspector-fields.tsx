import { useId, useState } from 'react';
import type { Paint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '../../../apps/extension/src/ui/paint-selector';
import { inspectorCopy } from './inspector-copy';
import { InspectorColorField } from './inspector-color-fields';
import { OpacityField, RadiusField } from './inspector-numeric-fields';

const initialColor = '#5985A3';
const gradientModes = ['linear', 'radial', 'conic'] as const;
const initialGradient: Paint = {
  kind: 'gradient',
  gradient: {
    type: 'linear',
    angle: 90,
    interpolation: 'srgb',
    repeat: { enabled: false, span: 1 },
    stops: [
      { id: 'first', position: 0, color: '#D4D4D8', midpoint: 0.5 },
      { id: 'last', position: 1, color: '#52525B', midpoint: 0.5 },
    ],
  },
};

export function InspectorFields({
  locale,
  palette,
}: {
  locale: keyof typeof inspectorCopy;
  palette: readonly string[];
}) {
  const copy = inspectorCopy[locale];
  const opacityId = useId();
  const radiusId = useId();
  const [opacity, setOpacity] = useState(72);
  const [radius, setRadius] = useState(16);
  const [color, setColor] = useState(initialColor);
  const [gradient, setGradient] = useState(initialGradient);

  return (
    <div className="inspector-fields">
      <section className="inspector-sample">
        <div className="sample-stage" aria-hidden="true">
          <div
            className="subject"
            style={{
              backgroundColor: color,
              borderRadius: radius,
              opacity: opacity / 100,
            }}
          />
        </div>
        <div className="parameters">
          <div className="parameter">
            <span id={opacityId} className="param-name">
              {copy.opacity}
            </span>
            <OpacityField
              copy={copy}
              labelledBy={opacityId}
              value={opacity}
              max={100}
              onChange={setOpacity}
            />
          </div>
          <slot name="inspector-dropdown" />
          <slot name="inspector-segments" />
          <div className="parameter">
            <span id={radiusId} className="param-name">
              {copy.radius}
            </span>
            <RadiusField
              copy={copy}
              labelledBy={radiusId}
              value={radius}
              max={64}
              onChange={setRadius}
            />
          </div>
          <InspectorColorField
            copy={copy}
            palette={palette}
            initialValue={initialColor}
            onVisibleColorChange={setColor}
          />
          <InspectorColorField copy={copy} palette={palette} initialValue="#5985A399" allowAlpha />
          <CompactPaintSelector
            className="gradient-field"
            triggerVariant="swatch"
            label={copy.gradient}
            title={copy.gradientEditor}
            value={gradient}
            allowedModes={gradientModes}
            palette={palette}
            onChange={setGradient}
          />
          <slot name="inspector-text" />
        </div>
      </section>
    </div>
  );
}
