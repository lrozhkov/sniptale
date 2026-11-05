import scanLetterAIcon from '@iconify-icons/tabler/scan-letter-a';
import { Icon as IconifyIcon } from '@iconify/react';
import { setColorAlpha } from '@sniptale/foundation/color';
import { Image, Shapes, Minus, RotateCcw, Type, PaintBucket, RefreshCw } from 'lucide-react';
import type { RefObject } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import {
  SIMPLIFY_SENSITIVITIES,
  SIMPLIFY_THICKNESSES,
  type SimplifySettings,
} from '../../features/simplify/settings';
import { translate } from '../../platform/i18n';
import { DrawingColorOptions, DrawingOptionsDivider, QuickOptionButton } from './options';

/** Explicit settings and callbacks shared by selected layers and new drawing defaults. */
export interface DrawingSimplifyOptionsProps {
  settings: SimplifySettings;
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto' | 'side';
  vertical: boolean;
  onChange: (update: Partial<SimplifySettings>) => void;
  onPreview?: (color: string | null) => void;
  onPreviewReset?: (color: string | null) => void;
  /** Supply only for a selected layer that can rebuild its existing source. */
  onRebuild?: () => void;
}

const SENSITIVITY_CHOICES = [
  { label: 'content.toolbar.drawingSimplifySensitivityLow' },
  { label: 'content.toolbar.drawingSimplifySensitivityMedium' },
  { label: 'content.toolbar.drawingSimplifySensitivityHigh' },
] as const;
const THICKNESS_LABELS = [
  'content.toolbar.drawingSimplifyThicknessThin',
  'content.toolbar.drawingSimplifyThicknessMedium',
  'content.toolbar.drawingSimplifyThicknessThick',
] as const;

/** Renders pure Simplify controls; the consumer owns application and preview recovery. */
export function DrawingSimplifyOptions(props: DrawingSimplifyOptionsProps) {
  const { settings } = props;
  const colors = props.colors.map((color) => setColorAlpha(color, 1) ?? color);
  const image = !settings.automatic && settings.manualKind === 'image';
  const colorLabel = translate(
    image ? 'content.toolbar.drawingFillColor' : 'content.toolbar.drawingColor'
  );
  return (
    <CommandPressScope value>
      <div
        role="group"
        aria-label={translate('content.toolbar.drawingSimplify')}
        data-ui="content.toolbar.drawing-options.simplify"
        className={`flex items-center gap-1.5 ${props.vertical ? 'flex-col' : 'flex-row'}`}
      >
        <QuickOptionButton
          active={settings.automatic}
          label={translate('content.toolbar.drawingSimplifyAutomatic')}
          dataUi="content.toolbar.drawing-options.simplify.automatic"
          onClick={() => props.onChange({ automatic: !settings.automatic })}
        >
          <IconifyIcon aria-hidden="true" ssr icon={scanLetterAIcon} width={17} height={17} />
        </QuickOptionButton>
        <DrawingOptionsDivider vertical={props.vertical} />
        {settings.automatic ? (
          <>
            <QuickOptionButton
              active={settings.content === 'text'}
              label={translate('content.toolbar.drawingSimplifyTextOnly')}
              dataUi="content.toolbar.drawing-options.simplify.content-text"
              onClick={() => props.onChange({ content: 'text' })}
            >
              <Type aria-hidden size={17} />
            </QuickOptionButton>
            <QuickOptionButton
              active={settings.content === 'all'}
              label={translate('content.toolbar.drawingSimplifyAll')}
              dataUi="content.toolbar.drawing-options.simplify.content-all"
              onClick={() => props.onChange({ content: 'all' })}
            >
              <Shapes aria-hidden size={17} />
            </QuickOptionButton>
          </>
        ) : (
          <>
            <QuickOptionButton
              active={settings.manualKind === 'text'}
              label={translate('content.toolbar.drawingText')}
              dataUi="content.toolbar.drawing-options.simplify.manual-text"
              onClick={() => props.onChange({ manualKind: 'text' })}
            >
              <Type aria-hidden size={17} />
            </QuickOptionButton>
            <QuickOptionButton
              active={settings.manualKind === 'image'}
              label={translate('content.toolbar.drawingSimplifyImages')}
              dataUi="content.toolbar.drawing-options.simplify.manual-image"
              onClick={() => props.onChange({ manualKind: 'image' })}
            >
              <Image aria-hidden size={17} />
            </QuickOptionButton>
          </>
        )}
        {settings.automatic ? (
          <>
            <DrawingOptionsDivider vertical={props.vertical} />
            {SIMPLIFY_SENSITIVITIES.map((value, index) => {
              const { label } = SENSITIVITY_CHOICES[index]!;
              return (
                <QuickOptionButton
                  key={value}
                  active={settings.sensitivity === value}
                  label={translate(label)}
                  dataUi={`content.toolbar.drawing-options.simplify.sensitivity-${value}`}
                  onClick={() => props.onChange({ sensitivity: value })}
                >
                  <span aria-hidden className="text-xs font-medium tabular-nums">
                    {value}
                  </span>
                </QuickOptionButton>
              );
            })}
          </>
        ) : null}
        {!image ? (
          <>
            <DrawingOptionsDivider vertical={props.vertical} />
            {SIMPLIFY_THICKNESSES.map((value, index) => (
              <QuickOptionButton
                key={value}
                active={settings.thickness === value}
                label={translate(THICKNESS_LABELS[index]!)}
                dataUi={`content.toolbar.drawing-options.simplify.thickness-${value}`}
                onClick={() => props.onChange({ thickness: value })}
              >
                <Minus aria-hidden size={17} strokeWidth={2 + index * 2} />
              </QuickOptionButton>
            ))}
          </>
        ) : null}
        <DrawingOptionsDivider vertical={props.vertical} />
        <DrawingColorOptions
          colors={colors}
          floatingBoundaryRef={props.floatingBoundaryRef}
          floatingPlacement={props.floatingPlacement}
          vertical={props.vertical}
          icon={PaintBucket}
          label={colorLabel}
          dataUi="content.toolbar.drawing-options.simplify.color"
          value={settings.color ?? colors[0] ?? '#000000'}
          selectedValue={settings.color}
          allowAlpha={false}
          onSelect={(color) => props.onChange({ color: setColorAlpha(color, 1) ?? color })}
          {...(props.onPreview ? { onPreview: props.onPreview } : {})}
          {...(props.onPreviewReset || props.onPreview
            ? { onPreviewReset: () => (props.onPreviewReset ?? props.onPreview)?.(settings.color) }
            : {})}
        />
        <QuickOptionButton
          active={settings.color === null}
          label={translate('content.toolbar.drawingSimplifyAutomaticColor')}
          dataUi="content.toolbar.drawing-options.simplify.color-auto"
          onClick={() => props.onChange({ color: null })}
        >
          <RotateCcw aria-hidden size={17} />
        </QuickOptionButton>
        {props.onRebuild ? (
          <>
            <DrawingOptionsDivider vertical={props.vertical} />
            <ContentToolbarButton
              type="button"
              aria-label={translate('content.toolbar.drawingSimplifyRebuild')}
              title={translate('content.toolbar.drawingSimplifyRebuild')}
              dataUi="content.toolbar.drawing-options.simplify.rebuild"
              className="aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !p-0"
              onClick={props.onRebuild}
            >
              <RefreshCw aria-hidden size={17} />
            </ContentToolbarButton>
          </>
        ) : null}
      </div>
    </CommandPressScope>
  );
}
