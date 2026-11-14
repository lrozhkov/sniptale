import { Color, type Group } from 'fabric';
import type { ReactNode } from 'react';
import { Palette } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../../ui/color-selector';
import { NumericValueField } from '../../chrome/ui';
import { CompactCommandToken } from '../../inspector/compact';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import type { EditorVectorStyleTransaction } from './use-vector-style-transaction';
import { ToolPropertiesButton } from './tool-properties-button';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
function concreteColor(value: string): string | null {
  const color = new Color(value);
  return color.isUnrecognised
    ? null
    : `#${(color.getAlpha() === 1 ? color.toHex() : color.toHexa()).toLowerCase()}`;
}

function VectorParameter(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit: '%' | 'x';
  onPreview(value: number): void;
  onCommit(value: number): void;
  onCancel(): void;
}) {
  return (
    <div
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') props.onCancel();
      }}
    >
      <NumericValueField
        label={props.label}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        precision={props.precision}
        unit={props.unit}
        enterBehavior="blur"
        onPreviewValue={props.onPreview}
        onCommitValue={props.onCommit}
      />
    </div>
  );
}
export function VectorProperty(props: {
  id: string;
  title: string;
  trigger: ReactNode;
  children: ReactNode;
  active: string | null;
  onToggle(id: string): void;
  rich?: boolean;
}) {
  return (
    <ToolPropertiesButton
      active={props.active === props.id}
      onToggle={props.onToggle}
      group={{
        id: props.id,
        kind: 'effects',
        title: props.title,
        trigger: props.trigger,
        width: props.rich ? 'rich' : 'simple',
        content: props.children,
      }}
    />
  );
}

export function EditorVectorStyleProperties({
  first,
  definition,
  same,
  opacity,
  strokeScale,
  active,
  toggle,
  transaction,
}: {
  first: Group;
  definition: EditorVectorDefinition;
  same: boolean;
  opacity: number;
  strokeScale: number;
  active: string | null;
  toggle(id: string): void;
  transaction: EditorVectorStyleTransaction;
}) {
  return (
    <>
      {' '}
      {same && definition.capabilities.palette ? (
        <VectorProperty
          id="vector-palette"
          title={message('palette')}
          trigger={<Palette size={16} />}
          active={active}
          onToggle={toggle}
          rich
        >
          <div className="space-y-2">
            {definition.slots.map((slot, index) => (
              <CompactColorSelector
                key={slot.id}
                label={message('paletteSlot').replace('{index}', String(index + 1))}
                title={message('palette')}
                value={first.sniptaleVectorElement?.overrides.colors[slot.id] ?? slot.originalColor}
                allowTransparent={false}
                paletteInPicker
                triggerVariant="swatch"
                onPreviewChange={(value) => {
                  const color = concreteColor(value);
                  if (color) transaction.preview({ colors: { [slot.id]: color } });
                }}
                onOpenChange={(open) => {
                  if (open) transaction.prepare();
                }}
                onPreviewReset={() => transaction.cancel()}
                onChange={(value) => {
                  const color = concreteColor(value);
                  if (color) void transaction.commit({ colors: { [slot.id]: color } });
                }}
              />
            ))}
          </div>
        </VectorProperty>
      ) : null}
      <VectorProperty
        id="vector-opacity"
        title={message('opacity')}
        trigger={<CompactCommandToken>{Math.round(opacity * 100)}%</CompactCommandToken>}
        active={active}
        onToggle={toggle}
      >
        <VectorParameter
          label={message('opacity')}
          value={opacity * 100}
          min={0}
          max={100}
          step={1}
          precision={0}
          unit="%"
          onPreview={(value) => transaction.preview({ opacity: value / 100 })}
          onCommit={(value) => void transaction.commit({ opacity: value / 100 })}
          onCancel={transaction.cancel}
        />
      </VectorProperty>
      {same && definition.capabilities.strokeScale ? (
        <VectorProperty
          id="vector-stroke"
          title={message('strokeScale')}
          trigger={<CompactCommandToken>{strokeScale.toFixed(2)}×</CompactCommandToken>}
          active={active}
          onToggle={toggle}
        >
          <VectorParameter
            label={message('strokeScale')}
            value={strokeScale}
            min={0.01}
            max={100}
            step={0.1}
            precision={2}
            unit="x"
            onPreview={(value) => transaction.preview({ strokeScale: value })}
            onCommit={(value) => void transaction.commit({ strokeScale: value })}
            onCancel={transaction.cancel}
          />
        </VectorProperty>
      ) : null}
    </>
  );
}
