import alignLeftIcon from '@iconify-icons/tabler/align-left-2';
import alignCenterIcon from '@iconify-icons/tabler/align-center';
import alignRightIcon from '@iconify-icons/tabler/align-right-2';
import diceIcon from '@iconify-icons/tabler/dice-5';
import photoSearchIcon from '@iconify-icons/tabler/photo-search';
import scanLetterAIcon from '@iconify-icons/tabler/scan-letter-a';
import { Icon as IconifyIcon } from '@iconify/react';
import { setColorAlpha } from '@sniptale/foundation/color';
import { Image, Type, RefreshCw } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import {
  SIMPLIFY_THICKNESSES,
  SIMPLIFY_LINE_SPACINGS,
  type SimplifySettings,
} from '../../features/simplify/settings';
import { translate } from '../../platform/i18n';
import {
  DrawingColorOptions,
  DrawingFillToggle,
  DrawingOptionsDivider,
  QuickOptionButton,
} from './options';

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

const THICKNESS_LABELS = [
  'content.toolbar.drawingSimplifyThicknessThin',
  'content.toolbar.drawingSimplifyThicknessMedium',
  'content.toolbar.drawingSimplifyThicknessThick',
] as const;

const SPACING_LABELS = [
  'content.toolbar.drawingSimplifyLineSpacingCompact',
  'content.toolbar.drawingSimplifyLineSpacingNormal',
  'content.toolbar.drawingSimplifyLineSpacingWide',
] as const;

/** Renders pure Simplify controls; the consumer owns application and preview recovery. */
export function DrawingSimplifyOptions(props: DrawingSimplifyOptionsProps) {
  const { settings } = props;
  const colors = props.colors.map((color) => setColorAlpha(color, 1) ?? color);
  const lastColor = useRef(settings.color ?? colors[0] ?? '#000000');
  useEffect(() => {
    if (settings.color !== null) lastColor.current = settings.color;
  }, [settings.color]);
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
              <IconifyIcon aria-hidden="true" ssr icon={photoSearchIcon} width={17} height={17} />
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
                <span aria-hidden className="flex h-6 items-center justify-center">
                  <span
                    data-ui="drawing-width-preview"
                    className="block w-4 rounded-full bg-current"
                    style={{ height: `${2 + index * 3}px` }}
                  />
                </span>
              </QuickOptionButton>
            ))}
          </>
        ) : null}
        {!settings.automatic && !image ? (
          <ManualTextSpacingOptions
            settings={settings}
            vertical={props.vertical}
            onChange={props.onChange}
          />
        ) : null}
        <DrawingOptionsDivider vertical={props.vertical} />
        <DrawingFillToggle
          filled={settings.color !== null}
          label={colorLabel}
          dataUi="content.toolbar.drawing-options.simplify.color"
          emptyIconUi="content.toolbar.drawing-options.simplify.color-empty-icon"
          onClick={() =>
            props.onChange({ color: settings.color === null ? lastColor.current : null })
          }
        />
        {settings.color !== null ? (
          <DrawingColorOptions
            colors={colors}
            floatingBoundaryRef={props.floatingBoundaryRef}
            floatingPlacement={props.floatingPlacement}
            vertical={props.vertical}
            label={colorLabel}
            dataUi="content.toolbar.drawing-options.simplify.color-palette"
            value={settings.color ?? lastColor.current}
            selectedValue={settings.color}
            allowAlpha={false}
            onSelect={(color) => props.onChange({ color: setColorAlpha(color, 1) ?? color })}
            {...(props.onPreview ? { onPreview: props.onPreview } : {})}
            {...(props.onPreviewReset || props.onPreview
              ? {
                  onPreviewReset: () => (props.onPreviewReset ?? props.onPreview)?.(settings.color),
                }
              : {})}
          />
        ) : null}
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

function ManualTextSpacingOptions(
  props: Pick<DrawingSimplifyOptionsProps, 'settings' | 'vertical' | 'onChange'>
) {
  const { settings } = props;
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      {SIMPLIFY_LINE_SPACINGS.map((value, index) => {
        const gap = 3 + index * 3;
        return (
          <QuickOptionButton
            key={value}
            active={settings.lineSpacing === value}
            label={translate(SPACING_LABELS[index]!)}
            dataUi={`content.toolbar.drawing-options.simplify.line-spacing-${value}`}
            onClick={() => props.onChange({ lineSpacing: value })}
          >
            <svg
              aria-hidden="true"
              width={17}
              height={17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d={`M4 ${12 - gap}h16M4 12h16M4 ${12 + gap}h16`} />
            </svg>
          </QuickOptionButton>
        );
      })}
      <ManualTextLayoutOptions {...props} />
    </>
  );
}

const ALIGNMENT_OPTIONS = [
  { value: 'left', icon: alignLeftIcon, label: 'content.toolbar.drawingSimplifyAlignLeft' },
  { value: 'center', icon: alignCenterIcon, label: 'content.toolbar.drawingSimplifyAlignCenter' },
  { value: 'right', icon: alignRightIcon, label: 'content.toolbar.drawingSimplifyAlignRight' },
] as const;

function ManualTextLayoutOptions(
  props: Pick<DrawingSimplifyOptionsProps, 'settings' | 'vertical' | 'onChange'>
) {
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      <QuickOptionButton
        active={props.settings.textPattern === 'random'}
        label={translate('content.toolbar.drawingSimplifyRandomWidths')}
        dataUi="content.toolbar.drawing-options.simplify.random-widths"
        onClick={() =>
          props.onChange({
            textPattern: props.settings.textPattern === 'random' ? 'typical' : 'random',
          })
        }
      >
        <IconifyIcon aria-hidden="true" ssr icon={diceIcon} width={17} height={17} />
      </QuickOptionButton>
      <DrawingOptionsDivider vertical={props.vertical} />
      {ALIGNMENT_OPTIONS.map((option) => (
        <QuickOptionButton
          key={option.value}
          active={props.settings.textAlign === option.value}
          label={translate(option.label)}
          dataUi={`content.toolbar.drawing-options.simplify.align-${option.value}`}
          onClick={() => props.onChange({ textAlign: option.value })}
        >
          <IconifyIcon aria-hidden="true" ssr icon={option.icon} width={17} height={17} />
        </QuickOptionButton>
      ))}
    </>
  );
}
