import { Color, type Group } from 'fabric';
import { useRef, type ReactNode } from 'react';
import { Droplet, Paintbrush } from 'lucide-react';
import { ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../../ui/color-selector';
import { NumericValueField } from '../../chrome/ui';
import { InspectorSurface } from '../../../ui/compact-inspector-controls/layout';
import './layer-tool-controls.css';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import type { EditorVectorStyleTransaction } from './use-vector-style-transaction';
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
  icon: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit: '%' | 'x';
  onFocus(): void;
  onPreview(value: number): void;
  onCommit(value: number): void;
  onCancel(): void;
}) {
  return (
    <InspectorSurface
      title={props.label}
      className="editor-vector-numeric flex h-7 w-[104px] shrink-0 items-center gap-1"
      onFocusCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          props.onFocus();
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') props.onCancel();
      }}
    >
      {props.icon}
      <NumericValueField
        className="min-w-0 flex-1"
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
    </InspectorSurface>
  );
}
function VectorPaletteColor({
  slot,
  index,
  first,
  transaction,
  compact = false,
  onOpen,
}: {
  slot: EditorVectorDefinition['slots'][number];
  index: number;
  first: Group;
  transaction: EditorVectorStyleTransaction;
  compact?: boolean;
  onOpen?(): void;
}) {
  const wasOpen = useRef(false);
  return (
    <CompactColorSelector
      {...(compact ? { className: 'editor-vector-color shrink-0' } : {})}
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
        if (open && !wasOpen.current) {
          onOpen?.();
          transaction.prepare();
        }
        wasOpen.current = open;
      }}
      onPreviewReset={() => transaction.cancel()}
      onChange={(value) => {
        const color = concreteColor(value);
        if (color) void transaction.commit({ colors: { [slot.id]: color } });
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
  transaction,
  paletteKey,
  onColorOpen,
  onNumberFocus,
}: {
  first: Group;
  definition: EditorVectorDefinition;
  same: boolean;
  opacity: number;
  strokeScale: number;
  transaction: EditorVectorStyleTransaction;
  paletteKey: number;
  onColorOpen(): void;
  onNumberFocus(): void;
}) {
  return (
    <>
      {same && definition.capabilities.palette && definition.slots.length ? (
        <>
          <div
            className="flex max-w-[min(224px,25vw)] shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:thin]"
            aria-label={message('palette')}
          >
            {definition.slots.map((slot, index) => (
              <VectorPaletteColor
                key={`${paletteKey}:${slot.id}`}
                slot={slot}
                index={index}
                first={first}
                transaction={transaction}
                compact
                onOpen={onColorOpen}
              />
            ))}
          </div>
          <ContentToolbarDivider className="!my-0 !h-5" />
        </>
      ) : null}
      <VectorParameter
        label={message('opacity')}
        icon={<Droplet size={16} aria-hidden="true" className="shrink-0" />}
        value={opacity * 100}
        min={0}
        max={100}
        step={1}
        precision={0}
        unit="%"
        onFocus={onNumberFocus}
        onPreview={(value) => transaction.preview({ opacity: value / 100 })}
        onCommit={(value) => void transaction.commit({ opacity: value / 100 })}
        onCancel={transaction.cancel}
      />
      {same && definition.capabilities.strokeScale ? (
        <VectorParameter
          label={message('strokeScale')}
          icon={<Paintbrush size={16} aria-hidden="true" className="shrink-0" />}
          value={strokeScale}
          min={0.01}
          max={100}
          step={0.1}
          precision={2}
          unit="x"
          onFocus={onNumberFocus}
          onPreview={(value) => transaction.preview({ strokeScale: value })}
          onCommit={(value) => void transaction.commit({ strokeScale: value })}
          onCancel={transaction.cancel}
        />
      ) : null}
    </>
  );
}
