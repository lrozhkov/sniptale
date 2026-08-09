import { Ban, Circle, PaintBucket, Square, Triangle, Type, X } from 'lucide-react';
import { ProductGlassColorOption } from '@sniptale/ui/product-glass-controls/primitives';
import type { ReactNode } from 'react';
import {
  DRAWING_MARKER_OPACITIES,
  DRAWING_TEXT_SIZES,
  type DrawingShapeKind,
} from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';

type DrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';

const ACTIVE_OPTION_CLASS =
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-hover)] ' +
  'text-[var(--sniptale-color-text-primary-strong)]';
const INACTIVE_OPTION_CLASS =
  'border-[var(--sniptale-color-border-soft)] bg-transparent ' +
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]';

function QuickOptionButton(props: {
  active: boolean;
  children: ReactNode;
  dataUi: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      data-ui={props.dataUi}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
        props.active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS,
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function DrawingDeselectOption(props: { onClick: () => void }) {
  const label = translate('content.toolbar.drawingDeselect');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-ui="content.toolbar.drawing-options.deselect"
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
        INACTIVE_OPTION_CLASS,
      ].join(' ')}
      onClick={props.onClick}
    >
      <X aria-hidden size={16} />
    </button>
  );
}

export function DrawingWidthOptions(props: {
  tool: DrawingQuickOptionsTool;
  value: number;
  values: readonly number[];
  onChange: (value: number) => void;
}) {
  return props.values.map((value) => (
    <QuickOptionButton
      key={value}
      active={props.value === value}
      dataUi={`content.toolbar.drawing-options.${props.tool}.width-${value}`}
      label={`${translate('content.toolbar.drawingWidth')}: ${value}px`}
      onClick={() => props.onChange(value)}
    >
      <span
        aria-hidden
        className="block w-4 rounded-full bg-current"
        style={{ height: `${Math.max(2, Math.min(11, Math.round(value / 4)))}px` }}
      />
    </QuickOptionButton>
  ));
}

export function MarkerOpacityOptions(props: { value: number; onChange: (value: number) => void }) {
  return DRAWING_MARKER_OPACITIES.map((value) => {
    const percent = Math.round(value * 100);
    return (
      <QuickOptionButton
        key={value}
        active={props.value === value}
        dataUi={`content.toolbar.drawing-options.marker.opacity-${percent}`}
        label={`${translate('content.toolbar.drawingOpacity')}: ${percent}%`}
        onClick={() => props.onChange(value)}
      >
        <span
          aria-hidden
          className="block h-4 w-4 rounded border border-current bg-current"
          style={{ opacity: value }}
        />
      </QuickOptionButton>
    );
  });
}

function ParallelogramIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none">
      <path d="M7 4h14l-4 16H3L7 4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const SHAPE_OPTIONS: readonly {
  icon: typeof Square | typeof ParallelogramIcon;
  kind: DrawingShapeKind;
  label: Parameters<typeof translate>[0];
}[] = [
  { icon: Square, kind: 'rectangle', label: 'content.toolbar.drawingRectangle' },
  { icon: Circle, kind: 'ellipse', label: 'content.toolbar.drawingEllipse' },
  { icon: Triangle, kind: 'triangle', label: 'content.toolbar.drawingTriangle' },
  {
    icon: ParallelogramIcon,
    kind: 'parallelogram',
    label: 'content.toolbar.drawingParallelogram',
  },
];

export function DrawingShapeOptions(props: {
  value: DrawingShapeKind;
  onChange: (value: DrawingShapeKind) => void;
}) {
  return SHAPE_OPTIONS.map(({ icon: Icon, kind, label }) => (
    <QuickOptionButton
      key={kind}
      active={props.value === kind}
      dataUi={`content.toolbar.drawing-options.shape.kind-${kind}`}
      label={translate(label)}
      onClick={() => props.onChange(kind)}
    >
      <Icon aria-hidden size={17} />
    </QuickOptionButton>
  ));
}

function ArrowModeIcon(props: { dynamic: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
      {props.dynamic ? (
        <path d="M2 11.35 15.2 9.2V5l7 7-7 7v-4.2L2 12.65Z" />
      ) : (
        <path d="M2 10.5h13.2V6l7 6-7 6v-4.5H2Z" />
      )}
    </svg>
  );
}

export function ArrowWidthModeOptions(props: {
  dynamic: boolean;
  onChange: (dynamic: boolean) => void;
}) {
  return [false, true].map((dynamic) => {
    const label = translate(
      dynamic
        ? 'content.toolbar.drawingArrowDynamicWidth'
        : 'content.toolbar.drawingArrowUniformWidth'
    );
    return (
      <QuickOptionButton
        key={String(dynamic)}
        active={props.dynamic === dynamic}
        dataUi={`content.toolbar.drawing-options.arrow.${dynamic ? 'dynamic' : 'uniform'}`}
        label={label}
        onClick={() => props.onChange(dynamic)}
      >
        <ArrowModeIcon dynamic={dynamic} />
      </QuickOptionButton>
    );
  });
}

export function DrawingColorOptions(props: {
  colors: readonly string[];
  icon?: typeof Type;
  label: string;
  value: string;
  onSelect: (color: string) => void;
}) {
  const Icon = props.icon;
  return (
    <div
      role="group"
      className="flex items-center gap-1.5"
      aria-label={props.label}
      title={props.label}
    >
      {Icon ? (
        <Icon
          aria-hidden
          size={16}
          className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
        />
      ) : null}
      <div className="grid w-[104px] grid-cols-5 gap-1.5">
        {props.colors.map((color) => {
          const active = props.value.toLowerCase() === color.toLowerCase();
          return (
            <ProductGlassColorOption
              key={color}
              active={active}
              aria-label={`${props.label}: ${color}`}
              aria-pressed={active}
              onClick={() => props.onSelect(color)}
              style={{ backgroundColor: color }}
              title={color}
            />
          );
        })}
      </div>
    </div>
  );
}

export function DrawingTextOptions(props: {
  backgroundColor: string | null;
  color: string;
  colors: readonly string[];
  fontSize: number;
  onBackgroundColorChange: (color: string | null) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (fontSize: number) => void;
}) {
  return (
    <>
      <DrawingColorOptions
        colors={props.colors}
        icon={Type}
        label={translate('content.toolbar.drawingTextColor')}
        value={props.color}
        onSelect={props.onColorChange}
      />
      <span aria-hidden className="h-9 w-px bg-[var(--sniptale-color-border-soft)]" />
      <div className="flex items-center gap-1.5">
        <QuickOptionButton
          active={props.backgroundColor === null}
          dataUi="content.toolbar.drawing-options.text.background-none"
          label={translate('content.toolbar.drawingNoBackground')}
          onClick={() => props.onBackgroundColorChange(null)}
        >
          <Ban aria-hidden size={16} />
        </QuickOptionButton>
        <DrawingColorOptions
          colors={props.colors}
          icon={PaintBucket}
          label={translate('content.toolbar.drawingTextBackground')}
          value={props.backgroundColor ?? '__transparent__'}
          onSelect={props.onBackgroundColorChange}
        />
      </div>
      <span aria-hidden className="h-9 w-px bg-[var(--sniptale-color-border-soft)]" />
      {DRAWING_TEXT_SIZES.map((fontSize) => (
        <QuickOptionButton
          key={fontSize}
          active={props.fontSize === fontSize}
          dataUi={`content.toolbar.drawing-options.text.size-${fontSize}`}
          label={`${translate('content.toolbar.drawingTextSize')}: ${fontSize}px`}
          onClick={() => props.onFontSizeChange(fontSize)}
        >
          <span
            aria-hidden
            className="font-semibold leading-none"
            style={{ fontSize: 11 + fontSize / 8 }}
          >
            A
          </span>
        </QuickOptionButton>
      ))}
    </>
  );
}
