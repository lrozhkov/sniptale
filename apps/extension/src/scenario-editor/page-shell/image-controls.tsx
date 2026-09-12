import { GuideHtmlImageFields } from './html-image-fields';
import { DEFAULT_HTML_IMAGES } from './html-image-settings';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Check, MousePointer2, Focus, Maximize2, RotateCcw, ScanLine, Text } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useEffect, useState } from 'react';
import {
  GUIDE_LIMITS,
  type GuideImageBlock,
  type GuideHtmlImageSettings,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { GuideInspectorGroup, GuideInspectorNumber } from './inspector';
import { changeGuideImageGeometry } from './image-geometry';

/** Decodes current leased media for reset dimensions without acquiring or revoking its URL. */
function useImageDimensions(url: string | null | undefined) {
  const [decoded, setDecoded] = useState<{ url: string; width: number; height: number } | null>(
    null
  );
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0)
        setDecoded({ url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => setDecoded(null);
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);
  return decoded?.url === url ? decoded : null;
}

/** Framing fields belong to the selected image in the existing right inspector. */
export function GuideImageControls({
  block,
  htmlDefaults,
  disabled,
  onChange,
  onClose,
  t,
  url,
}: {
  block: GuideImageBlock;
  htmlDefaults?: GuideHtmlImageSettings | undefined;
  url: string | null | undefined;
  disabled: boolean;
  onChange: (block: GuideImageBlock, group?: string | null) => void;
  onClose: () => void;
  t: Translate;
}) {
  const dimensions = useImageDimensions(url);
  const onReset = () => {
    if (dimensions)
      onChange(changeGuideImageGeometry(block, { kind: 'reset', ...dimensions }), null);
  };
  const geometry = (
    change: Parameters<typeof changeGuideImageGeometry>[1],
    group: string | null = null
  ) => onChange(changeGuideImageGeometry(block, change), group);
  return (
    <div
      className="guide-image-inspector"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="guide-image-inspector-heading">
        <h3>{t('scenario.editor.guideEditImageFrame')}</h3>
        <ContentToolbarButton title={t('scenario.editor.guideImageDone')} onClick={onClose}>
          <Check size={16} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      <fieldset className="guide-image-controls" disabled={disabled}>
        <legend className="sr-only">{t('scenario.editor.guideEditImageFrame')}</legend>
        <GuideInspectorGroup icon={ScanLine} title={t('scenario.editor.guideFramingGroup')}>
          <p>{t('scenario.editor.guideImageGestureHint')}</p>
          <SegmentedSwitch
            activeId={block.fit}
            ariaLabel={t('scenario.editor.guideImageFit')}
            options={[
              { id: 'contain', label: t('scenario.editor.guideImageContain') },
              { id: 'cover', label: t('scenario.editor.guideImageCover') },
            ]}
            onChange={(fit) => geometry({ kind: 'fit', fit })}
          />
          <GuideInspectorNumber
            label={t('scenario.editor.guideImageZoom')}
            min={10}
            max={10000}
            step={10}
            disabled={disabled}
            value={Math.round(block.contentTransform.scale * 100)}
            onChange={(value) =>
              geometry({ kind: 'zoom', scale: value / 100 }, `image-zoom:${block.id}`)
            }
          />
          {(['width', 'height'] as const).map((dimension) => (
            <GuideInspectorNumber
              key={dimension}
              label={t(
                dimension === 'width'
                  ? 'scenario.editor.guideImageWidth'
                  : 'scenario.editor.guideImageHeight'
              )}
              min={1}
              max={GUIDE_LIMITS.maxDimension}
              disabled={disabled}
              value={Math.round(block.frame[dimension])}
              onChange={(value) =>
                geometry(
                  { kind: 'frame', ...block.frame, [dimension]: value },
                  `image-${dimension}:${block.id}`
                )
              }
            />
          ))}
        </GuideInspectorGroup>
        <GuideInspectorGroup icon={Text} title={t('scenario.editor.guideDescriptionGroup')}>
          <label className="guide-image-description">
            {t('scenario.editor.guideImageCaption')}
            <ProductInput
              value={block.caption}
              maxLength={GUIDE_LIMITS.maxTextLength}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...block, caption: event.target.value }, `image-caption:${block.id}`)
              }
            />
          </label>
          <label className="guide-image-description">
            {t('scenario.editor.guideImageAlt')}
            <ProductInput
              value={block.alt}
              maxLength={GUIDE_LIMITS.maxTextLength}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...block, alt: event.target.value }, `image-alt:${block.id}`)
              }
            />
          </label>
        </GuideInspectorGroup>
        <div className="guide-image-reset-actions">
          <ContentToolbarButton
            title={t('scenario.editor.guideImageResetZoom')}
            disabled={disabled}
            onClick={() => geometry({ kind: 'zoom', scale: 1 })}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </ContentToolbarButton>
          <ContentToolbarButton
            title={t('scenario.editor.guideImageCenter')}
            disabled={disabled}
            onClick={() => geometry({ kind: 'pan', x: 0, y: 0 })}
          >
            <Focus size={16} aria-hidden="true" />
          </ContentToolbarButton>
          <ContentToolbarButton
            title={t('scenario.editor.guideImageReset')}
            disabled={disabled || !dimensions}
            onClick={onReset}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
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
    <GuideInspectorGroup icon={Maximize2} title={t('scenario.editor.htmlImages')}>
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
    <GuideInspectorGroup icon={MousePointer2} title={t('scenario.editor.guideVideoActionContext')}>
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
