import type {
  TourDocument,
  TourImageSlide,
  TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  Crosshair,
  MessageSquare,
  ScanLine,
  Palette,
  Image,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuideInspectorGroup } from '../inspector';
import { TourTextField, TourTextPresentation } from './fields';
import { TourHotspotSettings, TourAnnotationSettings, TourMaskSettings } from './object-settings';
import { TourNavigationSettings } from './navigation-settings';
import { TourEndSettings } from './end-settings';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';

type InspectorProps = {
  tour: TourDocument;
  slide: TourSlide | null;
  selection: TourSelection | null;
  scope: 'selection' | 'document';
  disabled: boolean;
  t: Translate;
  onChangeTour: (tour: TourDocument) => boolean;
  onChangeSlide: (slide: TourSlide) => boolean;
  onSelectObject: (id: string | null) => void;
};

/** The inspector edits exactly one scope: whole tour, end screen, slide or selected object. */
export function TourInspector(props: InspectorProps) {
  const { tour, slide, selection, disabled, t, onSelectObject } = props;
  if (props.scope === 'document')
    return (
      <TourDocumentSettings tour={tour} disabled={disabled} onChange={props.onChangeTour} t={t} />
    );
  if (selection?.kind === 'end')
    return <TourEndSettings tour={tour} disabled={disabled} onChange={props.onChangeTour} t={t} />;
  if (!slide)
    return <p className="guide-inspector-hint">{t('scenario.editor.guideSelectForSettings')}</p>;
  const objectId = selection?.kind === 'slide' ? selection.objectId : null;
  return (
    <>
      {objectId && (
        <ProductActionButton compact tone="secondary" onClick={() => onSelectObject(null)}>
          <ArrowLeft size={15} />
          {t('scenario.editor.tourBackToSlide')}
        </ProductActionButton>
      )}
      {slide.kind === 'navigation' ? (
        <TourNavigationSettings
          key={JSON.stringify([slide.id, objectId])}
          slide={slide}
          tour={tour}
          objectId={objectId}
          disabled={disabled}
          onChange={props.onChangeSlide}
          onSelect={onSelectObject}
          t={t}
        />
      ) : (
        <TourImageSettings
          key={JSON.stringify([slide.id, objectId])}
          slide={slide}
          tour={tour}
          objectId={objectId}
          disabled={disabled}
          onChange={props.onChangeSlide}
          onSelect={onSelectObject}
          t={t}
        />
      )}
    </>
  );
}

function TourImageSettings({
  slide,
  tour,
  objectId,
  disabled,
  onChange,
  onSelect,
  t,
}: {
  slide: TourImageSlide;
  tour: TourDocument;
  objectId: string | null;
  disabled: boolean;
  onChange: (slide: TourImageSlide) => boolean;
  onSelect: (id: string | null) => void;
  t: Translate;
}) {
  const hotspot = slide.hotspots.find((entry) => entry.id === objectId);
  const annotation = slide.annotations.find((entry) => entry.id === objectId);
  const mask = slide.masks.find((entry) => entry.id === objectId);
  if (hotspot || annotation || mask)
    return (
      <>
        {hotspot && (
          <TourHotspotSettings
            value={hotspot}
            tour={tour}
            disabled={disabled}
            t={t}
            onChange={(value) =>
              onChange({
                ...slide,
                hotspots: slide.hotspots.map((entry) => (entry.id === value.id ? value : entry)),
              })
            }
          />
        )}
        {annotation && (
          <TourAnnotationSettings
            value={annotation}
            tour={tour}
            disabled={disabled}
            t={t}
            onChange={(value) =>
              onChange({
                ...slide,
                annotations: slide.annotations.map((entry) =>
                  entry.id === value.id ? value : entry
                ),
              })
            }
          />
        )}
        {mask && (
          <TourMaskSettings
            value={mask}
            tour={tour}
            disabled={disabled}
            t={t}
            onChange={(value) =>
              onChange({
                ...slide,
                masks: slide.masks.map((entry) => (entry.id === value.id ? value : entry)),
              })
            }
          />
        )}
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled}
          onClick={() => {
            if (
              onChange({
                ...slide,
                hotspots: slide.hotspots.filter((entry) => entry.id !== objectId),
                annotations: slide.annotations.filter((entry) => entry.id !== objectId),
                masks: slide.masks.filter((entry) => entry.id !== objectId),
              })
            )
              onSelect(null);
          }}
        >
          <Trash2 size={15} />
          {t('common.actions.delete')}
        </ProductActionButton>
      </>
    );
  return (
    <>
      <GuideInspectorGroup icon={Image} title={t('scenario.editor.tourSlide')}>
        <TourTextField
          label={t('scenario.editor.guideStepTitle')}
          singleLine
          value={slide.title}
          disabled={disabled}
          onChange={(title) => onChange({ ...slide, title })}
        />
        <CompactSelect
          aria-label={t('scenario.editor.tourFit')}
          value={slide.fit}
          disabled={disabled}
          options={[
            { value: 'contain', label: t('scenario.editor.tourContain') },
            { value: 'cover', label: t('scenario.editor.tourCover') },
          ]}
          onChange={(fit) => onChange({ ...slide, fit })}
        />
        {slide.image && (
          <TourTextField
            label={t('scenario.editor.tourAlt')}
            value={slide.image.alt}
            disabled={disabled}
            onChange={(alt) =>
              onChange({ ...slide, image: slide.image ? { ...slide.image, alt } : null })
            }
          />
        )}
        {slide.requiresTargetReview && (
          <div className="tour-review-notice">
            <p>{t('scenario.editor.tourTargetReview')}</p>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={disabled}
              onClick={() => onChange({ ...slide, requiresTargetReview: false })}
            >
              {t('scenario.editor.tourTargetsReviewed')}
            </ProductActionButton>
          </div>
        )}
      </GuideInspectorGroup>
      <TourImageObjects
        slide={slide}
        disabled={disabled}
        onChange={onChange}
        onSelect={onSelect}
        t={t}
      />
    </>
  );
}

function TourImageObjects({
  slide,
  disabled,
  onChange,
  onSelect,
  t,
}: {
  slide: TourImageSlide;
  disabled: boolean;
  onChange: (slide: TourImageSlide) => boolean;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const add = (kind: 'hotspot' | 'annotation' | 'mask') => {
    const id = crypto.randomUUID();
    const next: TourImageSlide =
      kind === 'hotspot'
        ? {
            ...slide,
            hotspots: [
              ...slide.hotspots,
              {
                id,
                point: { x: 0.5, y: 0.5 },
                targetRect: null,
                label: t('scenario.editor.tourHotspot'),
                text: '',
                action: { kind: 'next' },
                appearance: null,
                pulse: true,
              },
            ],
          }
        : kind === 'annotation'
          ? {
              ...slide,
              annotations: [
                ...slide.annotations,
                { id, text: '', anchor: { x: 0.5, y: 0.5 }, appearance: null },
              ],
            }
          : {
              ...slide,
              masks: [
                ...slide.masks,
                {
                  id,
                  kind: 'highlight',
                  rect: { x: 0.25, y: 0.25, width: 0.3, height: 0.2 },
                  color: '#f97316',
                  opacity: 0.3,
                },
              ],
            };
    if (onChange(next)) onSelect(id);
  };
  return (
    <GuideInspectorGroup
      icon={Crosshair}
      title={t('scenario.editor.tourObjects')}
      action={
        <div className="tour-object-actions">
          <ContentToolbarButton
            disabled={disabled || !slide.image || slide.hotspots.length >= 20}
            title={t('scenario.editor.tourHotspot')}
            onClick={() => add('hotspot')}
          >
            <Crosshair size={15} />
          </ContentToolbarButton>
          <ContentToolbarButton
            disabled={disabled || !slide.image || slide.annotations.length >= 20}
            title={t('scenario.editor.tourAnnotation')}
            onClick={() => add('annotation')}
          >
            <MessageSquare size={15} />
          </ContentToolbarButton>
          <ContentToolbarButton
            disabled={disabled || !slide.image || slide.masks.length >= 20}
            title={t('scenario.editor.tourMask')}
            onClick={() => add('mask')}
          >
            <ScanLine size={15} />
          </ContentToolbarButton>
        </div>
      }
    >
      {[
        ...slide.hotspots.map((entry) => ({
          id: entry.id,
          label: entry.label || t('scenario.editor.tourHotspot'),
          Icon: Crosshair,
        })),
        ...slide.annotations.map((entry) => ({
          id: entry.id,
          label: entry.text || t('scenario.editor.tourAnnotation'),
          Icon: MessageSquare,
        })),
        ...slide.masks.map((entry) => ({
          id: entry.id,
          label: t('scenario.editor.tourMask'),
          Icon: ScanLine,
        })),
      ].map(({ id, label, Icon }) => (
        <button className="tour-object-row" key={id} onClick={() => onSelect(id)} title={label}>
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </GuideInspectorGroup>
  );
}

function TourDocumentSettings({
  tour,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  return (
    <GuideInspectorGroup icon={Palette} title={t('scenario.editor.tourSettings')}>
      <CompactSelect
        aria-label={t('scenario.editor.tourAspect')}
        value={tour.stage.aspect}
        disabled={disabled}
        options={[
          { value: '16:9', label: '16:9' },
          { value: '4:3', label: '4:3' },
          { value: '9:16', label: '9:16' },
        ]}
        onChange={(aspect) => onChange({ ...tour, stage: { ...tour.stage, aspect } })}
      />
      <ColorField
        label={t('scenario.editor.tourBackground')}
        title={t('scenario.editor.tourBackground')}
        value={tour.stage.background}
        disabled={disabled}
        allowAlpha={false}
        allowTransparent={false}
        onChange={(background) => onChange({ ...tour, stage: { ...tour.stage, background } })}
      />
      {(
        [
          { key: 'accent', label: t('scenario.editor.appearanceAccent') },
          { key: 'text', label: t('scenario.editor.tourTextColor') },
          { key: 'surface', label: t('scenario.editor.tourSurface') },
        ] as const
      ).map(({ key, label }) => (
        <ColorField
          key={key}
          label={label}
          title={label}
          value={tour.style[key]}
          disabled={disabled}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(value) => onChange({ ...tour, style: { ...tour.style, [key]: value } })}
        />
      ))}
      <TourTextPresentation
        inherit={false}
        value={tour.style.textAppearance}
        defaults={tour.style.textAppearance}
        disabled={disabled}
        t={t}
        onChange={(textAppearance) => {
          if (textAppearance) onChange({ ...tour, style: { ...tour.style, textAppearance } });
        }}
      />
    </GuideInspectorGroup>
  );
}
