import { ArrowDownLeft, Blend, Circle, PaintBucket, Square, Triangle, Type } from 'lucide-react';
import { ProductGlassColorOption } from '@sniptale/ui/product-glass-controls/primitives';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { getColorAlpha, replaceColorChannels } from '@sniptale/foundation/color';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { CompactColorSelector } from '../color-selector';
import {
  DRAWING_MARKER_OPACITIES,
  DRAWING_BLUR_STRENGTHS,
  DRAWING_TEXT_FONT_FAMILIES,
  DRAWING_TEXT_SIZES,
  resolveDrawingTextFontFamily,
  type DrawingCreatableShapeKind,
  type DrawingFontFamily,
  type DrawingArrowDesign,
  type DrawingShapeKind,
} from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import { useQuickDrawingColors } from './quick-colors';

type DrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';

const DRAWING_COLOR_PICKER_CLASS = [
  '!h-7 !w-7 shrink-0',
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!h-7",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!border",
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

export function DrawingOptionsDivider(props: { extended?: boolean; vertical: boolean }) {
  return (
    <span
      aria-hidden
      data-ui="content.toolbar.drawing-options.divider"
      className={[
        'shrink-0 bg-[var(--sniptale-color-border-soft)]',
        props.vertical ? 'h-px w-full' : 'h-5 w-px',
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
        active={Math.round(props.value * 100) === percent}
        dataUi={`content.toolbar.drawing-options.marker.opacity-${percent}`}
        label={`${translate('content.toolbar.drawingOpacity')}: ${percent}%`}
        onClick={() => props.onChange(value)}
      >
        <Blend aria-hidden size={17} style={{ opacity: value }} />
      </QuickOptionButton>
    );
  });
}

const BLUR_STRENGTH_LABELS = [
  'content.toolbar.drawingBlurWeak',
  'content.toolbar.drawingBlurMedium',
  'content.toolbar.drawingBlurStrong',
] as const;
const BLUR_PREVIEW_RADII = [0.35, 1.2, 2.6] as const;

export function DrawingBlurStrengthOptions(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  return DRAWING_BLUR_STRENGTHS.map((amount, index) => {
    const label = translate(BLUR_STRENGTH_LABELS[index]!);
    return (
      <QuickOptionButton
        key={amount}
        active={props.value === amount}
        label={`${translate('content.toolbar.drawingBlurStrength')}: ${label}, ${amount}px`}
        dataUi={`content.toolbar.drawing-options.blur.amount-${amount}`}
        onClick={() => props.onChange(amount)}
      >
        <svg aria-hidden viewBox="0 0 24 24" width="19" height="19" fill="none">
          <rect x="2.5" y="2.5" width="19" height="19" rx="2" stroke="currentColor" />
          <rect
            x="7"
            y="7"
            width="10"
            height="10"
            fill="currentColor"
            data-ui="drawing-blur-preview"
            style={{ filter: `blur(${BLUR_PREVIEW_RADII[index]}px)` }}
          />
        </svg>
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

export function ArrowDrawDirectionOption(props: {
  active: boolean;
  dataUi: string;
  onChange: (value: boolean) => void;
}) {
  const label = translate('editor.compact.arrowDrawFromTip');
  return (
    <ContentToolbarButton
      type="button"
      active={props.active}
      aria-label={label}
      aria-pressed={props.active}
      title={label}
      dataUi={props.dataUi}
      className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !rounded-md !p-0"
      onClick={() => props.onChange(!props.active)}
    >
      <ArrowDownLeft aria-hidden size={16} />
    </ContentToolbarButton>
  );
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
  onPreview?: (color: string) => void;
  onPreviewReset?: (color: string) => void;
}) {
  const Icon = props.icon;
  const { quickColors, selectColor } = useQuickDrawingColors(props.colors, props.onSelect);
  const selectedValue = props.selectedValue === undefined ? props.value : props.selectedValue;
  const previewReset = props.onPreviewReset ?? props.onPreview;
  const resolveQuickColor = (color: string) =>
    getColorAlpha(color) === 1 ? (replaceColorChannels(props.value, color) ?? color) : color;
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
      <CompactColorSelector
        allowAlpha={props.allowAlpha ?? false}
        allowTransparent={false}
        className={`${DRAWING_COLOR_PICKER_CLASS} [&_[data-ui='shared.ui.color-selector.trigger']]:!border-transparent`}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        label={props.label}
        title={props.label}
        value={props.value}
        palette={props.colors}
        paletteInPicker
        pickerOnly
        onChange={selectColor}
        {...(props.onPreview ? { onPreviewChange: props.onPreview } : {})}
        {...(previewReset ? { onPreviewReset: previewReset } : {})}
      />
      <div
        className={`grid gap-1.5 ${props.vertical ? 'grid-cols-1' : 'w-[104px] grid-cols-5'}`}
        data-ui="content.toolbar.drawing-options.quick-colors"
      >
        {quickColors.map((color) => {
          const active = selectedValue?.toLowerCase() === resolveQuickColor(color).toLowerCase();
          return (
            <ProductGlassColorOption
              key={color}
              active={active}
              aria-label={`${props.label}: ${color}`}
              aria-pressed={active}
              onClick={() => selectColor(resolveQuickColor(color))}
              style={{ backgroundColor: color }}
              title={color}
            />
          );
        })}
      </div>
    </div>
  );
}

type DrawingFillOptionsProps = {
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto' | 'side';
  value: string | null;
  vertical: boolean;
  onChange: (color: string | null) => void;
  onPreview?: (color: string) => void;
  onPreviewReset?: (color: string) => void;
};

const DRAWING_FILL_UI = {
  shape: {
    group: 'content.toolbar.drawing-options.shape.fill',
    toggle: 'content.toolbar.drawing-options.shape.fill-toggle',
    emptyIcon: 'content.toolbar.drawing-options.shape.fill-empty-icon',
    colors: 'content.toolbar.drawing-options.shape.fill-colors',
    label: 'content.toolbar.drawingFillColor',
    enable: 'content.toolbar.drawingEnableFill',
    disable: 'content.toolbar.drawingDisableFill',
  },
  text: {
    group: 'content.toolbar.drawing-options.text.background-group',
    toggle: 'content.toolbar.drawing-options.text.background-none',
    emptyIcon: 'content.toolbar.drawing-options.text.background-empty-icon',
    colors: 'content.toolbar.drawing-options.text.background-colors',
    label: 'content.toolbar.drawingTextBackground',
    enable: 'content.toolbar.drawingTextBackground',
    disable: 'content.toolbar.drawingNoBackground',
  },
} as const;

function DrawingFillToggle(props: {
  filled: boolean;
  label: string;
  dataUi: string;
  emptyIconUi: string;
  onClick: () => void;
}) {
  return (
    <ContentToolbarButton
      type="button"
      tone="utility"
      active={props.filled}
      aria-pressed={props.filled}
      aria-label={props.label}
      title={props.label}
      dataUi={props.dataUi}
      className={[
        'aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !rounded-md !border-transparent !p-0',
        props.filled ? '!text-[var(--sniptale-color-accent-emphasis)]' : '',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.filled ? (
        <PaintBucket aria-hidden size={19} />
      ) : (
        <svg
          aria-hidden
          data-ui={props.emptyIconUi}
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeWidth="2" />
          <path d="M4 20 20 4" strokeWidth="2.6" />
        </svg>
      )}
    </ContentToolbarButton>
  );
}

function DrawingFillOptions(props: DrawingFillOptionsProps & { kind: 'shape' | 'text' }) {
  const ui = DRAWING_FILL_UI[props.kind];
  const label = translate(ui.label);
  const filled = props.value !== null;
  const toggleLabel = translate(filled ? ui.disable : ui.enable);
  const lastFillColorRef = useRef(props.value ?? props.colors[0] ?? '#000000');
  useEffect(() => {
    if (props.value !== null) lastFillColorRef.current = props.value;
  }, [props.value]);
  return (
    <div
      data-ui={ui.group}
      className={`flex items-center gap-1.5 ${props.vertical ? 'flex-col' : 'flex-row'}`}
    >
      <DrawingFillToggle
        filled={filled}
        label={toggleLabel}
        dataUi={ui.toggle}
        emptyIconUi={ui.emptyIcon}
        onClick={() => props.onChange(filled ? null : lastFillColorRef.current)}
      />
      {filled ? (
        <DrawingColorOptions
          allowAlpha
          colors={props.colors}
          dataUi={ui.colors}
          floatingBoundaryRef={props.floatingBoundaryRef}
          floatingPlacement={props.floatingPlacement}
          label={label}
          selectedValue={props.value}
          vertical={props.vertical}
          value={props.value ?? lastFillColorRef.current}
          onSelect={props.onChange}
          {...(props.onPreview ? { onPreview: props.onPreview } : {})}
          {...(props.onPreviewReset ? { onPreviewReset: props.onPreviewReset } : {})}
        />
      ) : null}
    </div>
  );
}

export function DrawingShapeFillOptions(props: DrawingFillOptionsProps) {
  return <DrawingFillOptions {...props} kind="shape" />;
}

export function DrawingTextBackgroundOptions(props: DrawingFillOptionsProps) {
  return <DrawingFillOptions {...props} kind="text" />;
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
  onColorPreview?: (color: string) => void;
  onColorPreviewReset?: (color: string) => void;
  onBackgroundColorPreview?: (color: string) => void;
  onBackgroundColorPreviewReset?: (color: string) => void;
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
        allowAlpha
        colors={props.colors}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        icon={Type}
        label={translate('content.toolbar.drawingTextColor')}
        vertical={props.vertical}
        value={props.color}
        onSelect={props.onColorChange}
        {...(props.onColorPreview ? { onPreview: props.onColorPreview } : {})}
        {...(props.onColorPreviewReset ? { onPreviewReset: props.onColorPreviewReset } : {})}
      />
      <DrawingOptionsDivider extended vertical={props.vertical} />
      <DrawingFillOptions
        kind="text"
        colors={props.colors}
        floatingBoundaryRef={props.floatingBoundaryRef}
        floatingPlacement={props.floatingPlacement}
        value={props.backgroundColor}
        vertical={props.vertical}
        onChange={props.onBackgroundColorChange}
        {...(props.onBackgroundColorPreview ? { onPreview: props.onBackgroundColorPreview } : {})}
        {...(props.onBackgroundColorPreviewReset
          ? { onPreviewReset: props.onBackgroundColorPreviewReset }
          : {})}
      />
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
