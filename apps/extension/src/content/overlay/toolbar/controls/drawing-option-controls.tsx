import { Ban, Blend, Circle, PaintBucket, Square, Trash2, Triangle, Type, X } from 'lucide-react';
import { ProductGlassColorOption } from '@sniptale/ui/product-glass-controls/primitives';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReactNode, RefObject } from 'react';
import { CompactColorSelector } from '../../../../ui/color-selector';
import {
  DRAWING_MARKER_OPACITIES,
  DRAWING_TEXT_FONT_FAMILIES,
  DRAWING_TEXT_SIZES,
  resolveDrawingTextFontFamily,
  type DrawingCreatableShapeKind,
  type DrawingFontFamily,
  type DrawingArrowDesign,
  type DrawingShapeKind,
} from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';

type DrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';

const INACTIVE_OPTION_CLASS =
  'border-[var(--sniptale-color-border-soft)] bg-transparent ' +
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]';
const DRAWING_COLOR_PICKER_CLASS = [
  '!h-7 !w-7 shrink-0',
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!h-7",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!gap-0",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!rounded-md",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!px-[5px]",
  "[&_[data-ui='shared.ui.color-selector.picker-trigger']]:!justify-center",
  "[&_[data-ui='shared.ui.color-selector.picker-trigger']>span:last-child]:hidden",
].join(' ');

function QuickOptionButton(props: {
  active: boolean;
  children: ReactNode;
  dataUi: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <ContentToolbarButton
      type="button"
      active={props.active}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      dataUi={props.dataUi}
      className={[
        'aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !rounded-md !p-0',
        props.active ? '!text-[var(--sniptale-color-accent-emphasis)]' : '',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </ContentToolbarButton>
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

export function DrawingDeleteOption(props: { onClick: () => void }) {
  const label = translate('content.toolbar.drawingDelete');
  return (
    <ContentToolbarButton
      type="button"
      tone="danger"
      aria-label={label}
      title={label}
      dataUi="content.toolbar.drawing-options.delete"
      className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !rounded-md !p-0"
      onClick={props.onClick}
    >
      <Trash2 aria-hidden size={16} />
    </ContentToolbarButton>
  );
}

export function DrawingOptionsDivider(props: { extended?: boolean; vertical: boolean }) {
  return (
    <span
      aria-hidden
      data-ui="content.toolbar.drawing-options.divider"
      className={[
        'shrink-0 bg-[var(--sniptale-color-border-soft)]',
        props.vertical ? 'h-px w-full' : props.extended ? 'h-9 w-px' : 'h-5 w-px',
      ].join(' ')}
    />
  );
}

export function DrawingWidthOptions(props: {
  tool: DrawingQuickOptionsTool;
  value: number;
  values: readonly number[];
  onChange: (value: number) => void;
}) {
  return props.values.map((value, index) => {
    const circular = props.tool === 'pencil' || props.tool === 'marker';
    const minimumSize = circular ? (props.tool === 'marker' ? 5 : 3) : 2;
    const maximumSize = circular ? 12 : 10;
    const previewSize =
      props.values.length === 1
        ? maximumSize
        : Math.round(
            minimumSize + ((maximumSize - minimumSize) * index) / (props.values.length - 1)
          );
    return (
      <QuickOptionButton
        key={value}
        active={props.value === value}
        dataUi={`content.toolbar.drawing-options.${props.tool}.width-${value}`}
        label={`${translate('content.toolbar.drawingWidth')}: ${value}px`}
        onClick={() => props.onChange(value)}
      >
        <span
          aria-hidden
          data-ui="drawing-width-preview"
          className="block rounded-full bg-current"
          style={{
            height: `${previewSize}px`,
            width: circular ? `${previewSize}px` : '16px',
          }}
        />
      </QuickOptionButton>
    );
  });
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
        <Blend aria-hidden size={17} style={{ opacity: value }} />
      </QuickOptionButton>
    );
  });
}

const SHAPE_OPTIONS: readonly {
  icon: typeof Square;
  kind: DrawingCreatableShapeKind;
  label: Parameters<typeof translate>[0];
}[] = [
  { icon: Square, kind: 'rectangle', label: 'content.toolbar.drawingRectangle' },
  { icon: Circle, kind: 'ellipse', label: 'content.toolbar.drawingEllipse' },
  { icon: Triangle, kind: 'triangle', label: 'content.toolbar.drawingTriangle' },
];

const TEXT_FONT_LABELS: Record<
  DrawingFontFamily,
  | 'content.toolbar.drawingTextFontSans'
  | 'content.toolbar.drawingTextFontSerif'
  | 'content.toolbar.drawingTextFontMono'
  | 'content.toolbar.drawingTextFontHandwritten'
> = {
  sans: 'content.toolbar.drawingTextFontSans',
  serif: 'content.toolbar.drawingTextFontSerif',
  mono: 'content.toolbar.drawingTextFontMono',
  handwritten: 'content.toolbar.drawingTextFontHandwritten',
};
const TEXT_FONT_PREVIEW = 'Aa';

export function DrawingShapeOptions(props: {
  value: DrawingShapeKind;
  onChange: (value: DrawingCreatableShapeKind) => void;
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

type ArrowProfile = 'uniform' | 'dynamic' | 'freehand';
const ARROW_PROFILE_LABELS: Record<ArrowProfile, Parameters<typeof translate>[0]> = {
  uniform: 'content.toolbar.drawingArrowUniformWidth',
  dynamic: 'content.toolbar.drawingArrowDynamicWidth',
  freehand: 'content.toolbar.drawingArrowFreehand',
};

function ArrowModeIcon(props: { profile: ArrowProfile }) {
  if (props.profile === 'freehand') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" width="19" height="19" fill="none">
        <path
          d="M2.5 15.5c4.7-5.8 9.1-7.4 17-5.3m-5.1-4.3 5.1 4.3-5.8 3.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
      {props.profile === 'dynamic' ? (
        <path d="M2 11.35 15.2 9.2V5l7 7-7 7v-4.2L2 12.65Z" />
      ) : (
        <path d="M2 10.5h13.2V6l7 6-7 6v-4.5H2Z" />
      )}
    </svg>
  );
}

export function ArrowWidthModeOptions(props: {
  design: DrawingArrowDesign;
  dynamic: boolean;
  onChange: (update: { design: DrawingArrowDesign; dynamicWidth?: boolean }) => void;
}) {
  const activeProfile: ArrowProfile =
    props.design === 'freehand' ? 'freehand' : props.dynamic ? 'dynamic' : 'uniform';
  return (['uniform', 'dynamic', 'freehand'] as const).map((profile) => {
    const label = translate(ARROW_PROFILE_LABELS[profile]);
    return (
      <QuickOptionButton
        key={profile}
        active={activeProfile === profile}
        dataUi={`content.toolbar.drawing-options.arrow.${profile}`}
        label={label}
        onClick={() =>
          props.onChange(
            profile === 'freehand'
              ? { design: 'freehand' }
              : { design: 'standard', dynamicWidth: profile === 'dynamic' }
          )
        }
      >
        <ArrowModeIcon profile={profile} />
      </QuickOptionButton>
    );
  });
}

export function DrawingColorOptions(props: {
  allowAlpha?: boolean;
  colors: readonly string[];
  dataUi?: string;
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto' | 'side';
  icon?: typeof Type;
  label: string;
  selectedValue?: string | null;
  vertical?: boolean;
  value: string;
  onSelect: (color: string) => void;
}) {
  const Icon = props.icon;
  const quickColors = props.colors
    .filter((color) => color.toLowerCase() !== '#14b8a6' && color.toLowerCase() !== '#ec4899')
    .slice(0, 8);
  return (
    <div
      role="group"
      data-ui={props.dataUi}
      className={`flex items-center gap-1.5 ${props.vertical ? 'flex-col' : 'flex-row'}`}
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
      <div
        className={`grid gap-1.5 ${
          props.vertical ? 'w-[38px] grid-cols-2' : 'w-[82px] grid-cols-4'
        }`}
      >
        {quickColors.map((color) => {
          const selectedValue =
            props.selectedValue === undefined ? props.value : props.selectedValue;
          const active = selectedValue?.toLowerCase() === color.toLowerCase();
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
      <CompactColorSelector
        allowAlpha={props.allowAlpha ?? false}
        allowTransparent={false}
        className={DRAWING_COLOR_PICKER_CLASS}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        label={props.label}
        title={props.label}
        value={props.value}
        pickerOnly
        onChange={props.onSelect}
      />
    </div>
  );
}

export function DrawingShapeFillOptions(props: {
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto' | 'side';
  value: string | null;
  vertical: boolean;
  onChange: (color: string | null) => void;
}) {
  const label = translate('content.toolbar.drawingFillColor');
  return (
    <div
      data-ui="content.toolbar.drawing-options.shape.fill"
      className={`flex items-center gap-1.5 ${props.vertical ? 'flex-col' : 'flex-row'}`}
    >
      <QuickOptionButton
        active={props.value === null}
        dataUi="content.toolbar.drawing-options.shape.fill-none"
        label={translate('content.toolbar.drawingNoFill')}
        onClick={() => props.onChange(null)}
      >
        <Ban aria-hidden size={17} />
      </QuickOptionButton>
      <DrawingColorOptions
        allowAlpha
        colors={props.colors}
        dataUi="content.toolbar.drawing-options.shape.fill-colors"
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        icon={PaintBucket}
        label={label}
        selectedValue={props.value}
        vertical={props.vertical}
        value={props.value ?? props.colors[0] ?? '#000000'}
        onSelect={props.onChange}
      />
    </div>
  );
}

export function DrawingTextOptions(props: {
  backgroundColor: string | null;
  color: string;
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto' | 'side';
  fontSize: number;
  fontFamily: DrawingFontFamily;
  vertical: boolean;
  onBackgroundColorChange: (color: string | null) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onFontFamilyChange: (fontFamily: DrawingFontFamily) => void;
}) {
  return (
    <>
      {DRAWING_TEXT_FONT_FAMILIES.map((fontFamily) => (
        <QuickOptionButton
          key={fontFamily}
          active={props.fontFamily === fontFamily}
          dataUi={`content.toolbar.drawing-options.text.font-${fontFamily}`}
          label={translate(TEXT_FONT_LABELS[fontFamily])}
          onClick={() => props.onFontFamilyChange(fontFamily)}
        >
          <span
            aria-hidden
            className="text-[13px] leading-none"
            style={{ fontFamily: resolveDrawingTextFontFamily(fontFamily) }}
          >
            {TEXT_FONT_PREVIEW}
          </span>
        </QuickOptionButton>
      ))}
      <DrawingOptionsDivider extended vertical={props.vertical} />
      <DrawingColorOptions
        colors={props.colors}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        icon={Type}
        label={translate('content.toolbar.drawingTextColor')}
        vertical={props.vertical}
        value={props.color}
        onSelect={props.onColorChange}
      />
      <DrawingOptionsDivider extended vertical={props.vertical} />
      <div
        data-ui="content.toolbar.drawing-options.text.background-group"
        className={`flex items-center gap-1.5 ${props.vertical ? 'flex-col' : 'flex-row'}`}
      >
        <QuickOptionButton
          active={props.backgroundColor === null}
          dataUi="content.toolbar.drawing-options.text.background-none"
          label={translate('content.toolbar.drawingNoBackground')}
          onClick={() => props.onBackgroundColorChange(null)}
        >
          <Ban aria-hidden size={16} />
        </QuickOptionButton>
        <DrawingColorOptions
          allowAlpha
          colors={props.colors}
          floatingBoundaryRef={props.floatingBoundaryRef}
          floatingPlacement={props.floatingPlacement}
          icon={PaintBucket}
          label={translate('content.toolbar.drawingTextBackground')}
          vertical={props.vertical}
          value={props.backgroundColor ?? '__transparent__'}
          onSelect={props.onBackgroundColorChange}
        />
      </div>
      <DrawingOptionsDivider extended vertical={props.vertical} />
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
