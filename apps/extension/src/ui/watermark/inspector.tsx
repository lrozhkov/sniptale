import {
  RotateCcw,
  ArrowUpLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Dot,
  ArrowRight,
  ArrowDownLeft,
  ArrowDown,
  ArrowDownRight,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { InspectorDisclosureProps } from '../compact-inspector-controls/shared';
import './inspector.css';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedRow } from '../compact-inspector-controls';
import { InspectorParameterRow } from '../compact-inspector-controls/layout';
import { BackgroundImagePicker } from '../../composition/background-resources/picker';
import { prepareStaticLogo, StaticLogoError } from '../../workflows/background-images/static-logo';
import {
  createQuickEditWatermark,
  resetQuickEditWatermark,
  setQuickEditWatermarkAnchor,
  setQuickEditWatermarkMode,
  type QuickEditWatermarkSettings,
} from '../../features/video/project/scene/watermark';
import { translate, useAppLocale } from '../../platform/i18n';
import { WatermarkTextFields, WatermarkNumber, type WatermarkBinding as Binding } from './controls';

/** Controlled scene settings; acquisition, preview resources and history remain with the scene owner. */
export interface WatermarkInspectorProps {
  Disclosure: ComponentType<InspectorDisclosureProps>;
  dataUi?: string;
  settings: QuickEditWatermarkSettings | undefined;
  output: { width: number; height: number };
  onChange(settings: QuickEditWatermarkSettings): Promise<boolean>;
  onPreview(settings: QuickEditWatermarkSettings | null): void;
  onImage(file: File, originMediaId?: string, signal?: AbortSignal): Promise<void>;
  pending: boolean;
  error: string | null;
  onError(message: string | null): void;
  imagePreviewUrl?: string | undefined;
  onRetry?: (() => Promise<void>) | undefined;
}

const modes = [
  { value: 'none', label: 'gallery.videoReview.watermarkNone' },
  { value: 'text', label: 'gallery.videoReview.watermarkText' },
  { value: 'image', label: 'gallery.videoReview.watermarkImage' },
] as const;

/** Each local text or numeric gesture proposes one authored change only at acceptance. */
export function WatermarkInspector(props: WatermarkInspectorProps) {
  useAppLocale();
  const settings =
    props.settings ?? createQuickEditWatermark(translate('gallery.videoReview.watermarkSeed'));
  const binding = {
    settings,
    onChange: props.onChange,
    onPreview: props.onPreview,
    Disclosure: props.Disclosure,
  };
  return (
    <fieldset
      disabled={props.pending}
      aria-busy={props.pending}
      className="sniptale-parameter-stack"
      data-ui={props.dataUi ?? 'watermark.inspector'}
    >
      <SegmentedRow
        columns={3}
        ariaLabel={translate('gallery.videoReview.watermark')}
        value={settings.mode}
        options={modes.map((mode) => ({ ...mode, label: translate(mode.label) }))}
        onChange={(mode) => {
          props.onPreview(null);
          void props.onChange(
            setQuickEditWatermarkMode(
              props.settings,
              mode,
              translate('gallery.videoReview.watermarkSeed')
            )
          );
        }}
      />
      {props.error && (
        <div role="alert" className="space-y-1 text-xs">
          <p>{props.error}</p>
          {props.onRetry && (
            <ContentToolbarButton
              tone="outline"
              aria-label={translate('gallery.videoReview.watermarkRetry')}
              onClick={() =>
                void props
                  .onRetry?.()
                  .catch(() => props.onError(translate('gallery.videoReview.watermarkImageFailed')))
              }
            >
              {translate('gallery.videoReview.watermarkRetry')}
            </ContentToolbarButton>
          )}
        </div>
      )}
      {settings.mode !== 'none' && (
        <div className="sniptale-watermark-columns">
          <div className="sniptale-parameter-stack">
            {settings.mode === 'text' ? (
              <WatermarkTextFields {...binding} output={props.output} />
            ) : (
              <WatermarkImageFields {...props} {...binding} />
            )}
          </div>
          <WatermarkPlacementFields {...binding} />
        </div>
      )}
      {settings.mode !== 'none' && (
        <ContentToolbarButton
          type="button"
          tone="outline"
          size="compact"
          className="flex w-full items-center justify-center gap-2"
          aria-label={translate('gallery.videoReview.watermarkReset')}
          title={translate('gallery.videoReview.watermarkReset')}
          onClick={() => {
            props.onPreview(null);
            void props.onChange(
              resetQuickEditWatermark(settings, translate('gallery.videoReview.watermarkSeed'))
            );
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {translate('gallery.videoReview.watermarkReset')}
        </ContentToolbarButton>
      )}
    </fieldset>
  );
}

function logoError(error: unknown): string {
  if (error instanceof StaticLogoError) {
    if (error.code === 'animated') return translate('gallery.videoReview.watermarkImageAnimated');
    if (error.code === 'size' || error.code === 'dimensions')
      return translate('gallery.videoReview.watermarkImageSize');
  }
  return translate('gallery.videoReview.watermarkImageFailed');
}

function WatermarkImageFields(props: WatermarkInspectorProps & Binding) {
  const { settings } = props;
  const image = settings.image;
  return (
    <>
      {props.imagePreviewUrl && (
        <img
          src={props.imagePreviewUrl}
          alt={translate('gallery.videoReview.watermarkImage')}
          className="h-20 w-full rounded-md border border-[var(--sniptale-color-border-subtle)] object-contain"
        />
      )}
      <BackgroundImagePicker
        showPresets={false}
        prepareImage={prepareStaticLogo}
        pending={props.pending}
        onSelect={({ file, originMediaId }, signal) => {
          props.onError(null);
          return props.onImage(file, originMediaId, signal);
        }}
        onError={(error) => props.onError(logoError(error))}
      />
      {image && (
        <>
          <WatermarkNumber
            {...props}
            label={translate('gallery.videoReview.watermarkSize')}
            unit="%"
            value={image.size * 100}
            min={1}
            max={100}
            step={1}
            change={(value) => ({ ...settings, image: { ...image, size: value / 100 } })}
          />
          <WatermarkNumber
            {...props}
            label={translate('gallery.videoReview.watermarkOpacity')}
            unit="%"
            value={image.opacity * 100}
            min={0}
            max={100}
            step={1}
            change={(value) => ({ ...settings, image: { ...image, opacity: value / 100 } })}
          />
        </>
      )}
    </>
  );
}

const anchorOptions = [
  ['top-left', ArrowUpLeft],
  ['top', ArrowUp],
  ['top-right', ArrowUpRight],
  ['left', ArrowLeft],
  ['center', Dot],
  ['right', ArrowRight],
  ['bottom-left', ArrowDownLeft],
  ['bottom', ArrowDown],
  ['bottom-right', ArrowDownRight],
] as const;
function WatermarkPlacementFields(props: Binding) {
  const { settings, onChange } = props;
  return (
    <div className="sniptale-parameter-stack">
      <SegmentedRow
        columns={2}
        ariaLabel={translate('gallery.videoReview.watermarkLayout')}
        value={settings.layout}
        options={[
          { value: 'single', label: translate('gallery.videoReview.watermarkSingle') },
          { value: 'tiled', label: translate('gallery.videoReview.watermarkTiled') },
        ]}
        onChange={(layout: typeof settings.layout) => onChange({ ...settings, layout })}
      />
      {settings.layout === 'single' ? (
        <WatermarkSinglePlacement {...props} />
      ) : (
        <>
          <WatermarkNumber
            {...props}
            label={translate('gallery.videoReview.watermarkSpacing')}
            unit="%"
            value={settings.tile.spacing * 100}
            min={0}
            max={100}
            step={1}
            change={(value) => ({ ...settings, tile: { ...settings.tile, spacing: value / 100 } })}
          />
          <WatermarkNumber
            {...props}
            label={translate('gallery.videoReview.watermarkRotation')}
            value={settings.tile.rotation}
            min={-180}
            max={180}
            step={1}
            change={(rotation) => ({ ...settings, tile: { ...settings.tile, rotation } })}
          />
        </>
      )}
    </div>
  );
}

function WatermarkSinglePlacement(props: Binding) {
  const { settings, onChange } = props;
  const index = anchorOptions.findIndex(([anchor]) => anchor === settings.placement.anchor);
  const position = settings.placement.position ?? {
    x: (index % 3) / 2,
    y: Math.floor(index / 3) / 2,
  };
  return (
    <>
      <InspectorParameterRow
        label={translate('gallery.videoReview.watermarkAnchor')}
        valueMinimum={116}
      >
        <div
          role="group"
          aria-label={translate('gallery.videoReview.watermarkAnchor')}
          data-ui="watermark.anchors"
          data-inspector-choices=""
          className="ml-auto grid w-max grid-cols-3 gap-1"
        >
          {anchorOptions.map(([anchor, Icon]) => (
            <ContentToolbarButton
              key={anchor}
              tone="property"
              aria-label={translate(`gallery.videoReview.watermarkAnchor_${anchor}`)}
              aria-pressed={!settings.placement.position && anchor === settings.placement.anchor}
              onClick={() => onChange(setQuickEditWatermarkAnchor(settings, anchor))}
            >
              <Icon size={14} aria-hidden="true" />
            </ContentToolbarButton>
          ))}
        </div>
      </InspectorParameterRow>
      <props.Disclosure
        label={translate('gallery.videoReview.watermarkPositionExact')}
        preferenceId="watermark.position"
      >
        <WatermarkNumber
          {...props}
          label={translate('gallery.videoReview.watermarkMargin')}
          unit="%"
          value={settings.placement.margin * 100}
          min={0}
          max={25}
          step={0.1}
          change={(value) => ({
            ...settings,
            placement: { ...settings.placement, margin: value / 100 },
          })}
        />
        {(['x', 'y'] as const).map((axis) => (
          <WatermarkNumber
            key={axis}
            {...props}
            label={translate(
              axis === 'x' ? 'gallery.videoReview.watermarkX' : 'gallery.videoReview.watermarkY'
            )}
            unit="%"
            value={position[axis] * 100}
            min={0}
            max={100}
            step={0.1}
            change={(value) => ({
              ...settings,
              placement: { ...settings.placement, position: { ...position, [axis]: value / 100 } },
            })}
          />
        ))}
      </props.Disclosure>
    </>
  );
}
