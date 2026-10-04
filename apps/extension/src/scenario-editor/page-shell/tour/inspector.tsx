import { TourDocumentSettings } from './document-settings';
import { TourMaskSettings, TourMaskDefaultSettings } from './mask-settings';
import { TourCameraSettings } from './camera-settings';
import { TourTransitionSettings } from './transition-settings';
import { TourPlaybackSettings, TourTimingSettings } from './playback-settings';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTourInspectorSections, TourInspectorPreferences } from './settings-sections';
import type {
  TourDocument,
  TourImageSlide,
  TourSlide,
  TourSlideObject,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourSlideObjects, TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  Crosshair,
  MessageSquare,
  ScanLine,
  Palette,
  Image,
  ArrowDown,
  ArrowUp,
  Trash2,
  Plus,
  ScanSearch,
  Play,
  Layers,
  LayoutPanelTop,
  List,
  MousePointer2,
} from 'lucide-react';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuideInspectorGroup, InspectorCategorizedContent } from '../inspector';
import { ScenarioInspectorActionButton, ScenarioInspectorBackButton } from '../inspector-actions';
import { GuideActionMenu } from '../action-menu';
import { TourTextField } from './fields';
import { TourHotspotSettings, TourAnnotationSettings } from './object-settings';
import { TourNavigationSettings, TourAddButtonControl } from './navigation-settings';
import { TourEndSettings } from './end-settings';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';

type InspectorProps = {
  imageActions?: ReactNode;
  presentation?: 'all' | 'sections';
  narration?: ReactNode;
  tour: TourDocument;
  slide: TourSlide | null;
  selection: TourSelection | null;
  scope: 'selection' | 'document';
  disabled: boolean;
  t: Translate;
  onChangeTour: (tour: TourDocument) => boolean;
  onChangeSlide: (slide: TourSlide, group?: string | null) => boolean;
  onSelectObject: (id: string | null) => void;
};

/**
 * Slide categories for image and navigation slides; grouped content matches the category labels.
 */
function TourSlideCategories({
  slide,
  disabled,
  t,
  onChangeSlide,
  onSelectObject,
}: {
  slide: TourSlide;
  disabled: boolean;
  t: Translate;
  onChangeSlide: (slide: TourSlide, group?: string | null) => boolean;
  onSelectObject: (id: string | null) => void;
}) {
  const buttonControl =
    slide.kind === 'navigation' ? (
      <TourAddButtonControl
        slide={slide}
        disabled={disabled}
        onChange={onChangeSlide}
        onSelect={onSelectObject}
        t={t}
      />
    ) : null;
  const objectControl =
    slide.kind === 'image' &&
    slide.hotspots.length + slide.annotations.length + slide.masks.length > 0 ? (
      <TourAddObjectMenu
        slide={slide}
        disabled={disabled}
        onAdd={(kind) => commitTourImageObject(slide, kind, t, onChangeSlide, onSelectObject)}
        t={t}
      />
    ) : null;
  return slide.kind === 'image'
    ? [
        { id: 'content', icon: Image, label: t('scenario.editor.tourSlide'), categorized: true },
        {
          id: 'camera',
          icon: ScanSearch,
          label: t('scenario.editor.tourCamera'),
          categorized: true,
        },
        {
          id: 'objects',
          icon: Crosshair,
          label: t('scenario.editor.tourObjects'),
          categorized: true,
          headingControl: objectControl,
        },
      ]
    : [
        {
          id: 'content',
          icon: Image,
          label: t('scenario.editor.tourAddNavigation'),
          categorized: true,
        },
        {
          id: 'layout',
          icon: LayoutPanelTop,
          label: t('scenario.editor.tourComposition'),
          categorized: true,
        },
        {
          id: 'buttons',
          icon: List,
          label: t('scenario.editor.tourContentsLinks'),
          categorized: true,
          headingControl: buttonControl,
        },
      ];
}

function TourDocumentCategories({
  tour,
  disabled,
  onChangeTour,
  t,
}: Pick<InspectorProps, 'tour' | 'disabled' | 'onChangeTour' | 't'>) {
  const documentSettings = { tour, disabled, onChange: onChangeTour, t };
  return [
    {
      id: 'appearance',
      icon: Palette,
      label: t('scenario.editor.appearance'),
      categorized: true,
      content: <TourDocumentSettings {...documentSettings} section="appearance" />,
    },
    {
      id: 'hotspots',
      icon: Crosshair,
      label: t('scenario.editor.tourHotspot'),
      categorized: true,
      content: <TourDocumentSettings {...documentSettings} section="hotspots" />,
    },
    {
      id: 'masks',
      icon: ScanLine,
      label: t('scenario.editor.tourMask'),
      content: <TourMaskDefaultSettings {...documentSettings} />,
    },
    {
      id: 'explanations',
      icon: MessageSquare,
      label: t('scenario.editor.tourAnnotation'),
      categorized: true,
      content: <TourDocumentSettings {...documentSettings} section="explanations" />,
    },
    {
      id: 'playback',
      icon: Play,
      label: t('scenario.editor.tourPlayback'),
      categorized: true,
      content: <TourPlaybackSettings {...documentSettings} />,
    },
    {
      id: 'transitions',
      icon: Layers,
      label: t('scenario.editor.tourTransitions'),
      categorized: true,
      content: <TourTransitionSettings {...documentSettings} />,
    },
  ];
}

/** The inspector edits exactly one scope: whole tour, end screen, slide or selected object. */
export function TourInspector(props: InspectorProps) {
  return (
    <TourInspectorPreferences scope={props.scope} slide={props.slide} selection={props.selection}>
      <TourInspectorContent {...props} />
    </TourInspectorPreferences>
  );
}

function TourInspectorContent(props: InspectorProps) {
  const { tour, slide, selection, disabled, t, onSelectObject } = props;
  const renderSections = useTourInspectorSections(
    props.presentation ?? 'all',
    t,
    props.scope === 'selection' && selection?.kind === 'slide' ? props.narration : null
  );
  const list = useRef<HTMLDivElement>(null);
  const previousObject = useRef<string | null>(null);
  const selectedObject = selection?.kind === 'slide' ? selection.objectId : null;
  useEffect(() => {
    if (props.scope === 'selection' && !selectedObject && previousObject.current) {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[data-inspector-object]');
      Array.from(buttons ?? [])
        .find((button) => button.dataset['inspectorObject'] === previousObject.current)
        ?.focus();
    }
    previousObject.current = selectedObject;
  }, [selectedObject, props.scope]);
  if (props.scope === 'document') return renderSections('document', TourDocumentCategories(props));
  if (selection?.kind === 'end')
    return (
      <InspectorCategorizedContent>
        <TourEndSettings tour={tour} disabled={disabled} onChange={props.onChangeTour} t={t} />
      </InspectorCategorizedContent>
    );
  if (!slide)
    return <p className="guide-inspector-hint">{t('scenario.editor.guideSelectForSettings')}</p>;
  const objectId = selection?.kind === 'slide' ? selection.objectId : null;
  const settings = (section: string) =>
    slide.kind === 'navigation' ? (
      <TourNavigationSettings
        key={JSON.stringify([slide.id, objectId])}
        section={section}
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
        narration={props.narration}
        presentation={props.presentation ?? 'all'}
        key={JSON.stringify([slide.id, objectId])}
        section={section}
        slide={slide}
        tour={tour}
        objectId={objectId}
        disabled={disabled}
        onChange={props.onChangeSlide}
        onSelect={onSelectObject}
        t={t}
      />
    );
  if (objectId)
    return (
      <div className="tour-object-inspector">
        <ScenarioInspectorBackButton
          label={t('scenario.editor.tourBackToSlide')}
          onBack={() => onSelectObject(null)}
        />
        {slide.kind === 'navigation' || slide.annotations.some((entry) => entry.id === objectId)
          ? renderSections(slide.kind === 'navigation' ? 'navigation-button' : 'annotation', [
              {
                id: 'content',
                icon: slide.kind === 'navigation' ? MousePointer2 : MessageSquare,
                label: t(
                  slide.kind === 'navigation'
                    ? 'scenario.editor.tourButton'
                    : 'scenario.editor.textLabel'
                ),
                categorized: true,
                content: settings('object'),
              },
            ])
          : settings('object')}
      </div>
    );
  return (
    <div ref={list}>
      {renderSections(slide.kind, [
        ...TourSlideCategories({
          slide,
          disabled,
          t,
          onChangeSlide: props.onChangeSlide,
          onSelectObject,
        }).map((section) => ({
          ...section,
          content: (
            <>
              {section.id === 'content' && props.imageActions}
              {settings(section.id)}
            </>
          ),
        })),
        {
          id: 'playback',
          icon: Play,
          label: t('scenario.editor.tourPlayback'),
          categorized: true,
          content: (
            <>
              <TourTimingSettings
                tour={tour}
                slide={slide}
                disabled={disabled}
                onChange={props.onChangeSlide}
                t={t}
              />
            </>
          ),
        },
      ])}
    </div>
  );
}

type ImageSettingsProps = {
  narration?: ReactNode;
  presentation: 'all' | 'sections';
  section: string;
  slide: TourImageSlide;
  tour: TourDocument;
  objectId: string | null;
  disabled: boolean;
  onChange: (slide: TourImageSlide, group?: string | null) => boolean;
  onSelect: (id: string | null) => void;
  t: Translate;
};

/** Slide categories edit the bitmap and camera; selected-object controls are a separate scope. */
function TourImageSettings(props: ImageSettingsProps) {
  const { section, slide, tour, objectId, disabled, onChange, onSelect, t } = props;
  if (objectId) return <TourImageObjectSettings {...props} />;
  return (
    <>
      {section === 'content' && (
        <GuideInspectorGroup id="slide" icon={Image} title={t('scenario.editor.tourSlide')}>
          <TourTextField
            label={t('scenario.editor.guideStepTitle')}
            singleLine
            value={slide.title}
            disabled={disabled}
            onChange={(title) => onChange({ ...slide, title })}
          />
          <div className="tour-text-field">
            <span>{t('scenario.editor.tourFit')}</span>
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
          </div>
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
      )}
      {section === 'camera' && (
        <TourCameraSettings
          slide={slide}
          tour={tour}
          disabled={disabled}
          onChange={onChange}
          t={t}
        />
      )}
      {section === 'objects' && (
        <TourImageObjects
          slide={slide}
          disabled={disabled}
          onChange={onChange}
          onSelect={onSelect}
          t={t}
        />
      )}
    </>
  );
}

function TourImageObjectSettings({
  narration,
  presentation,
  slide,
  tour,
  objectId,
  disabled,
  onChange,
  onSelect,
  t,
}: ImageSettingsProps) {
  const hotspot = slide.hotspots.find((entry) => entry.id === objectId);
  const annotation = slide.annotations.find((entry) => entry.id === objectId);
  const mask = slide.masks.find((entry) => entry.id === objectId);
  if (hotspot || annotation || mask)
    return (
      <>
        {hotspot && (
          <TourHotspotSettings
            narration={narration}
            presentation={presentation}
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
            narration={narration}
            presentation={presentation}
            defaults={tour.style.maskDefaults}
            value={mask}
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
        <div className="tour-object-destructive-actions">
          <ScenarioInspectorActionButton
            tone="danger"
            disabled={disabled}
            onClick={() => {
              if (
                onChange({
                  ...slide,
                  hotspots: slide.hotspots.filter((entry) => entry.id !== objectId),
                  annotations: slide.annotations.filter((entry) => entry.id !== objectId),
                  masks: slide.masks.filter((entry) => entry.id !== objectId),
                  ...(slide.objectOrder
                    ? { objectOrder: slide.objectOrder.filter((id) => id !== objectId) }
                    : {}),
                })
              )
                onSelect(null);
            }}
          >
            <Trash2 size={15} />
            {t('common.actions.delete')}
          </ScenarioInspectorActionButton>
        </div>
      </>
    );
  return null;
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
  onChange: (slide: TourImageSlide, group?: string | null) => boolean;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const objects = getTourSlideObjects(slide);
  const add = (kind: 'hotspot' | 'annotation' | 'mask') =>
    commitTourImageObject(slide, kind, t, onChange, onSelect);
  const move = (index: number, offset: number) => {
    const order = objects.map((entry) => entry.object.id);
    const [entry] = order.splice(index, 1);
    if (!entry) return;
    order.splice(index + offset, 0, entry);
    onChange({ ...slide, objectOrder: order });
  };
  return (
    <GuideInspectorGroup
      id="objects"
      icon={Crosshair}
      title={t('scenario.editor.tourObjects')}
      action={
        objects.length > 0 ? (
          <TourAddObjectMenu slide={slide} disabled={disabled} onAdd={add} t={t} />
        ) : undefined
      }
    >
      {objects.length === 0 && (
        <TourImageObjectActions slide={slide} disabled={disabled} onAdd={add} t={t} />
      )}
      {objects.length > 0 && (
        <ol className="tour-object-list" aria-label={t('scenario.editor.tourObjects')}>
          {objects.map((entry, index) => {
            const { label, Icon } = tourSlideObjectLabel(entry, t);
            return (
              <li className="tour-object-item" key={entry.object.id}>
                <button
                  className="tour-object-row"
                  data-inspector-object={entry.object.id}
                  onClick={() => onSelect(entry.object.id)}
                  title={label}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                </button>
                <div className="tour-object-item-actions">
                  <ContentToolbarButton
                    title={t('scenario.editor.tourMoveObjectUp')}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </ContentToolbarButton>
                  <ContentToolbarButton
                    title={t('scenario.editor.tourMoveObjectDown')}
                    disabled={disabled || index === objects.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </ContentToolbarButton>
                  <ContentToolbarButton
                    className="tour-object-delete"
                    tone="danger"
                    title={t('common.actions.delete')}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...slide,
                        hotspots: slide.hotspots.filter((object) => object.id !== entry.object.id),
                        annotations: slide.annotations.filter(
                          (object) => object.id !== entry.object.id
                        ),
                        masks: slide.masks.filter((object) => object.id !== entry.object.id),
                        ...(slide.objectOrder
                          ? {
                              objectOrder: slide.objectOrder.filter((id) => id !== entry.object.id),
                            }
                          : {}),
                      })
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </ContentToolbarButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GuideInspectorGroup>
  );
}

function tourSlideObjectLabel(entry: TourSlideObject, t: Translate) {
  switch (entry.type) {
    case 'hotspot':
      return { label: entry.object.label || t('scenario.editor.tourHotspot'), Icon: Crosshair };
    case 'annotation':
      return {
        label: entry.object.text || t('scenario.editor.tourAnnotation'),
        Icon: MessageSquare,
      };
    case 'mask':
      return { label: t('scenario.editor.tourMask'), Icon: ScanLine };
  }
}

/** Adds one object then selects it; the single path shared by the Add menu and empty-state actions. */
function commitTourImageObject(
  slide: TourImageSlide,
  kind: 'hotspot' | 'annotation' | 'mask',
  t: Translate,
  onChange: (slide: TourImageSlide, group?: string | null) => boolean,
  onSelect: (id: string) => void
) {
  const { slide: next, id } = addTourImageObject(slide, kind, t);
  if (onChange(next)) onSelect(id);
}

/** Adds one object with a fresh id through a single slide update. */
function addTourImageObject(
  slide: TourImageSlide,
  kind: 'hotspot' | 'annotation' | 'mask',
  t: Translate
): { slide: TourImageSlide; id: string } {
  const id = crypto.randomUUID();
  const ordered = slide.objectOrder ? { objectOrder: [...slide.objectOrder, id] } : {};
  const next: TourImageSlide =
    kind === 'hotspot'
      ? {
          ...slide,
          ...ordered,
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
            ...ordered,
            annotations: [...slide.annotations, { id, text: '', anchor: null, appearance: null }],
          }
        : {
            ...slide,
            ...ordered,
            masks: [
              ...slide.masks,
              {
                id,
                kind: 'highlight',
                inheritStyle: true,
                rect: { x: 0.25, y: 0.25, width: 0.3, height: 0.2 },
                color: '#f97316',
                opacity: 0.3,
              },
            ],
          };
  return { slide: next, id };
}

/** Creation choices with per-type limits; shared by the Add menu and the empty-state actions. */
function tourAddObjectOptions(slide: TourImageSlide, t: Translate) {
  return [
    {
      value: 'hotspot' as const,
      label: t('scenario.editor.tourHotspot'),
      icon: <Crosshair size={15} aria-hidden="true" />,
      disabled: slide.hotspots.length >= TOUR_LIMITS.maxHotspots,
    },
    {
      value: 'annotation' as const,
      label: t('scenario.editor.tourAnnotation'),
      icon: <MessageSquare size={15} aria-hidden="true" />,
      disabled: slide.annotations.length >= TOUR_LIMITS.maxAnnotations,
    },
    {
      value: 'mask' as const,
      label: t('scenario.editor.tourMask'),
      icon: <ScanLine size={15} aria-hidden="true" />,
      disabled: slide.masks.length >= TOUR_LIMITS.maxMasks,
    },
  ];
}

/** One localized Add menu rendered at the objects heading seam in both inspector presentations. */
function TourAddObjectMenu({
  slide,
  disabled,
  onAdd,
  t,
}: {
  slide: TourImageSlide;
  disabled: boolean;
  onAdd: (kind: 'hotspot' | 'annotation' | 'mask') => void;
  t: Translate;
}) {
  return (
    <div className="tour-object-add">
      <GuideActionMenu
        label={t('scenario.editor.tourAddObject')}
        icon={<Plus size={16} aria-hidden="true" />}
        disabled={disabled || !slide.image}
        items={tourAddObjectOptions(slide, t).map((option) => ({
          label: option.label,
          icon: option.icon,
          disabled: option.disabled,
          onSelect: () => onAdd(option.value),
        }))}
      />
    </div>
  );
}

/** Empty-state direct creation actions; the heading Add menu replaces them once objects exist. */
function TourImageObjectActions({
  slide,
  disabled,
  onAdd,
  t,
}: {
  slide: TourImageSlide;
  disabled: boolean;
  onAdd: (kind: 'hotspot' | 'annotation' | 'mask') => void;
  t: Translate;
}) {
  return (
    <div className="tour-object-actions">
      {tourAddObjectOptions(slide, t).map((option) => (
        <ScenarioInspectorActionButton
          key={option.value}
          disabled={disabled || !slide.image || option.disabled}
          title={option.label}
          onClick={() => onAdd(option.value)}
        >
          {option.icon}
          {option.label}
        </ScenarioInspectorActionButton>
      ))}
    </div>
  );
}
