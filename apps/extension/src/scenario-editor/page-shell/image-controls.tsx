import type { KeyboardEvent } from 'react';
import { ScenarioInspectorActionButton, ScenarioInspectorBackButton } from './inspector-actions';
import { useGuideResourceRequest } from './resource-drawer';
import { GuideHtmlImageFields } from './html-image-fields';
import { DEFAULT_HTML_IMAGES } from './html-image-settings';
import { ProductRange, ProductToggle } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  MousePointer2,
  Focus,
  Maximize2,
  RotateCcw,
  ScanLine,
  Text,
  Pencil,
  Image,
} from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useImageDimensions } from './image-dimensions';
import { useGuideImageBounds } from './layout-assistance';
import {
  GUIDE_LIMITS,
  type GuideImageBlock,
  type GuideHtmlImageSettings,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideInspectorGroup, GuideInspectorNumber } from './inspector';
import { changeGuideImageGeometry, constrainGuideImage } from './image-geometry';

/** Framing fields belong to the selected image in the existing right inspector. */
export function GuideImageControls({
  block,
  htmlDefaults,
  disabled,
  onChange,
  onClose,
  onEscape,
  onEdit,
  stepId,
  t,
  url,
}: {
  block: GuideImageBlock;
  htmlDefaults?: GuideHtmlImageSettings | undefined;
  url: string | null | undefined;
  disabled: boolean;
  onChange: (block: GuideImageBlock, group?: string | null) => void;
  onClose: () => void;
  onEscape?: () => void;
  onEdit?: () => void;
  stepId?: string;
  t: Translate;
}) {
  const dimensions = useImageDimensions(url);
  const requestResource = useGuideResourceRequest();
  const { cropBounds } = useGuideImageBounds(block);
  const geometryDisabled = disabled || (cropBounds && !dimensions);
  const constrain = (next: GuideImageBlock) =>
    cropBounds && dimensions ? constrainGuideImage(next, dimensions) : next;
  const geometry = (
    change: Parameters<typeof changeGuideImageGeometry>[1],
    group: string | null = null
  ) => onChange(constrain(changeGuideImageGeometry(block, change)), group);
  return (
    <div
      className="guide-image-inspector"
      onKeyDown={(event) => handleInspectorEscape(event, onEscape ?? onClose)}
    >
      <ScenarioInspectorBackButton
        label={t('scenario.editor.guideStepSettings')}
        onBack={onClose}
      />
      <fieldset className="guide-image-controls" disabled={disabled}>
        <legend className="sr-only">{t('scenario.editor.guideEditImageFrame')}</legend>
        {onEdit && (
          <ScenarioInspectorActionButton
            data-inspector-edit-image={block.id}
            disabled={disabled || !url}
            onClick={onEdit}
          >
            <Pencil size={16} aria-hidden="true" />
            {t('scenario.editor.guideEditImage')}
          </ScenarioInspectorActionButton>
        )}
        {stepId && (
          <ScenarioInspectorActionButton
            disabled={disabled || !requestResource}
            aria-controls="guide-resource-drawer"
            onClick={() => requestResource?.({ kind: 'replace-image', stepId, blockId: block.id })}
          >
            <Image size={16} aria-hidden="true" />
            {t('scenario.editor.guideReplaceImage')}
          </ScenarioInspectorActionButton>
        )}
        <GuideInspectorGroup
          id="framing"
          icon={ScanLine}
          title={t('scenario.editor.guideFramingGroup')}
        >
          <p>{t('scenario.editor.guideImageGestureHint')}</p>
          <fieldset className="contents" disabled={geometryDisabled}>
            <SegmentedSwitch
              activeId={block.fit}
              ariaLabel={t('scenario.editor.guideImageFit')}
              options={[
                { id: 'contain', label: t('scenario.editor.guideImageContain') },
                { id: 'cover', label: t('scenario.editor.guideImageCover') },
              ]}
              onChange={(fit) => geometry({ kind: 'fit', fit })}
            />
          </fieldset>
          <GuideImageRangeField
            label={t('scenario.editor.guideImageZoom')}
            min={10}
            max={10000}
            sliderMax={400}
            step={10}
            disabled={geometryDisabled}
            value={Math.round(block.contentTransform.scale * 100)}
            onChange={(value) =>
              geometry({ kind: 'zoom', scale: value / 100 }, `image-zoom:${block.id}`)
            }
          />
          {(['width', 'height'] as const).map((dimension) => (
            <GuideImageRangeField
              key={dimension}
              label={t(
                dimension === 'width'
                  ? 'scenario.editor.guideImageWidth'
                  : 'scenario.editor.guideImageHeight'
              )}
              min={1}
              max={GUIDE_LIMITS.maxDimension}
              sliderMax={2000}
              disabled={geometryDisabled}
              value={Math.round(block.frame[dimension])}
              onChange={(value) =>
                geometry(
                  { kind: 'frame', ...block.frame, [dimension]: value },
                  `image-${dimension}:${block.id}`
                )
              }
            />
          ))}
          <div className="guide-image-reset-actions">
            <ContentToolbarButton
              title={t('scenario.editor.guideImageCenter')}
              disabled={geometryDisabled}
              onClick={() => geometry({ kind: 'pan', x: 0, y: 0 })}
            >
              <Focus size={16} aria-hidden="true" />
            </ContentToolbarButton>
            <ContentToolbarButton
              title={t('scenario.editor.guideImageReset')}
              disabled={geometryDisabled || !dimensions}
              onClick={() => {
                if (dimensions) geometry({ kind: 'reset', ...dimensions });
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </ContentToolbarButton>
          </div>
        </GuideInspectorGroup>
        <GuideImageDescriptionFields block={block} disabled={disabled} onChange={onChange} t={t} />
        <ImageActionContext source={block.source} t={t} />
        <ImageHtmlSettings
          block={block}
          htmlDefaults={htmlDefaults}
          disabled={disabled}
          onChange={onChange}
          t={t}
        />
      </fieldset>
    </div>
  );
}

function GuideImageDescriptionFields({
  block,
  disabled,
  onChange,
  t,
}: Pick<Parameters<typeof GuideImageControls>[0], 'block' | 'disabled' | 'onChange' | 't'>) {
  return (
    <GuideInspectorGroup
      id="description"
      icon={Text}
      title={t('scenario.editor.guideDescriptionGroup')}
    >
      {(['caption', 'alt'] as const).map((field) => {
        const label = t(
          field === 'caption'
            ? 'scenario.editor.guideImageCaption'
            : 'scenario.editor.guideImageAlt'
        );
        return (
          <label key={field} className="guide-image-description">
            {label}
            <ProductInput
              aria-label={label}
              value={block[field]}
              maxLength={GUIDE_LIMITS.maxTextLength}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...block, [field]: event.target.value }, `image-${field}:${block.id}`)
              }
            />
            {field === 'alt' && <small>{t('scenario.editor.guideImageAltHint')}</small>}
          </label>
        );
      })}
    </GuideInspectorGroup>
  );
}

function GuideImageRangeField({
  label,
  min,
  max,
  sliderMax,
  step = 1,
  value,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  sliderMax: number;
  step?: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="guide-image-range-field">
      <GuideInspectorNumber
        label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={onChange}
      />
      <ProductRange
        aria-label={label}
        min={min}
        max={Math.min(max, Math.max(sliderMax, value))}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

function ImageHtmlSettings({
  block,
  htmlDefaults,
  disabled,
  onChange,
  t,
}: Pick<
  Parameters<typeof GuideImageControls>[0],
  'block' | 'htmlDefaults' | 'disabled' | 'onChange' | 't'
>) {
  return (
    <GuideInspectorGroup id="htmlImages" icon={Maximize2} title={t('scenario.editor.htmlImages')}>
      <label className="guide-html-switch">
        <span>{t('scenario.editor.htmlInherit')}</span>
        <ProductToggle
          size="sm"
          disabled={disabled}
          checked={!block.htmlExport}
          aria-label={t('scenario.editor.htmlInherit')}
          onClick={() =>
            onChange(
              {
                ...block,
                htmlExport: block.htmlExport
                  ? undefined
                  : { ...(htmlDefaults ?? DEFAULT_HTML_IMAGES) },
              },
              null
            )
          }
        />
      </label>
      <GuideHtmlImageFields
        value={block.htmlExport ?? htmlDefaults ?? DEFAULT_HTML_IMAGES}
        disabled={disabled || !block.htmlExport}
        onChange={(patch) =>
          onChange(
            {
              ...block,
              htmlExport: {
                ...(block.htmlExport ?? htmlDefaults ?? DEFAULT_HTML_IMAGES),
                ...patch,
              },
            },
            null
          )
        }
        t={t}
      />
    </GuideInspectorGroup>
  );
}

/** Read-only provenance is independent from editable framing settings. */
function ImageActionContext({ source, t }: { source: GuideImageBlock['source']; t: Translate }) {
  if (source.kind !== 'video-frame' || !source.action) return null;
  const action = source.action;
  return (
    <GuideInspectorGroup
      id="videoActionContext"
      icon={MousePointer2}
      title={t('scenario.editor.guideVideoActionContext')}
    >
      <p>
        {t(
          action.kind === 'KEY'
            ? 'scenario.editor.guideVideoKey'
            : 'scenario.editor.guideVideoClick'
        )}{' '}
        · {t('scenario.editor.guideVideoActionTime').replace('{seconds}', action.time.toFixed(2))}
      </p>
      <p>{action.label}</p>
      {action.target && (
        <p>
          {[action.target.name, action.target.tag, action.target.role].filter(Boolean).join(' · ')}
        </p>
      )}
      {action.point && (
        <p>
          {t('scenario.editor.guideVideoActionPoint')
            .replace('{x}', String(Math.round(action.point.x * 100)))
            .replace('{y}', String(Math.round(action.point.y * 100)))}
        </p>
      )}
    </GuideInspectorGroup>
  );
}

function handleInspectorEscape(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.defaultPrevented || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
