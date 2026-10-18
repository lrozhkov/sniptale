import { TourImageObjects, TourAddObjectMenu, commitTourImageObject } from './image-object-list';
import { SelectField } from '../../../ui/compact-inspector-controls/controls';
import { TourDocumentSettings } from './document-settings';
import { TourCameraSettings } from './camera-settings';
import { TourTransitionSettings } from './transition-settings';
import { TourPlaybackSettings, TourTimingSettings } from './playback-settings';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTourInspectorSections, TourInspectorPreferences } from './settings-sections';
import type {
  TourDocument,
  TourImageSlide,
  TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  Crosshair,
  MessageSquare,
  Palette,
  Image,
  Trash2,
  ScanSearch,
  Play,
  Layers,
  LayoutPanelTop,
  List,
  MousePointer2,
  Music2,
} from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuideInspectorGroup, InspectorCategorizedContent } from '../inspector';
import { ScenarioInspectorActionButton, ScenarioInspectorBackButton } from '../inspector-actions';
import { TourTextField } from './fields';
import { TourHotspotSettings, TourAnnotationSettings } from './object-settings';
import { TourNavigationSettings, TourAddButtonControl } from './navigation-settings';
import { TourEndSettings } from './end-settings';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';

type InspectorProps = {
  imageActions?: ReactNode;
  onUploadStage?: (file: File, signal: AbortSignal) => Promise<boolean>;
  importDisabled?: boolean;
  presentation?: 'all' | 'sections';
  narration?: ReactNode;
  music?: ReactNode;
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
    slide.kind === 'image' && slide.actions.length > 0 ? (
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
  music,
  tour,
  disabled,
  onChangeTour,
  onUploadStage,
  importDisabled,
  t,
}: Pick<
  InspectorProps,
  'tour' | 'disabled' | 'onChangeTour' | 'onUploadStage' | 'importDisabled' | 't' | 'music'
>) {
  const documentSettings = {
    tour,
    disabled,
    onChange: onChangeTour,
    t,
    onUploadStage,
    importDisabled,
  };
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
    ...(music
      ? [
          {
            id: 'music',
            icon: Music2,
            label: t('scenario.editor.tourMusic'),
            categorized: true,
            content: music,
          },
        ]
      : []),
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
        {slide.kind === 'navigation'
          ? renderSections('navigation-button', [
              {
                id: 'content',
                icon: MousePointer2,
                label: t('scenario.editor.tourButton'),
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
            <SelectField
              label={t('scenario.editor.tourFit')}
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
          tour={tour}
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
  const entry = slide.actions.find((entry) => entry.object.id === objectId);
  const timing = entry ? (
    <TourTimingSettings
      tour={tour}
      hasNarration={Boolean(entry.object.narration)}
      slide={{ ...slide, timing: entry.object.timing ?? slide.timing }}
      disabled={disabled}
      t={t}
      onChange={(next) =>
        onChange({
          ...slide,
          actions: slide.actions.map((item) =>
            item.object.id !== objectId
              ? item
              : item.type === 'hotspot'
                ? { type: 'hotspot', object: { ...item.object, timing: next.timing } }
                : { type: 'annotation', object: { ...item.object, timing: next.timing } }
          ),
        })
      }
    />
  ) : undefined;
  const camera = entry ? (
    <TourCameraSettings
      tour={tour}
      slide={{ ...slide, camera: entry.object.camera ?? slide.camera }}
      disabled={disabled}
      t={t}
      onChange={(next) =>
        onChange({
          ...slide,
          actions: slide.actions.map((item) =>
            item.object.id !== objectId
              ? item
              : item.type === 'hotspot'
                ? { type: 'hotspot', object: { ...item.object, camera: next.camera } }
                : { type: 'annotation', object: { ...item.object, camera: next.camera } }
          ),
        })
      }
    />
  ) : undefined;
  const remove = () => {
    if (
      onChange({
        ...slide,
        actions: slide.actions.filter((entry) => entry.object.id !== objectId),
      })
    )
      onSelect(null);
  };
  return (
    <>
      {entry?.type === 'hotspot' && (
        <TourHotspotSettings
          timing={timing}
          camera={camera}
          narration={narration}
          presentation={presentation}
          value={entry.object}
          tour={tour}
          disabled={disabled}
          t={t}
          onChange={(value) =>
            onChange({
              ...slide,
              actions: slide.actions.map((item) =>
                item.object.id === value.id ? { type: 'hotspot', object: value } : item
              ),
            })
          }
        />
      )}
      {entry?.type === 'annotation' && (
        <TourAnnotationSettings
          timing={timing}
          camera={camera}
          narration={narration}
          presentation={presentation}
          value={entry.object}
          tour={tour}
          disabled={disabled}
          t={t}
          onChange={(value) =>
            onChange({
              ...slide,
              actions: slide.actions.map((item) =>
                item.object.id === value.id ? { type: 'annotation', object: value } : item
              ),
            })
          }
        />
      )}
      {entry && (
        <div className="tour-object-destructive-actions">
          <ScenarioInspectorActionButton tone="danger" disabled={disabled} onClick={remove}>
            <Trash2 size={15} />
            {t('common.actions.delete')}
          </ScenarioInspectorActionButton>
        </div>
      )}
    </>
  );
}
