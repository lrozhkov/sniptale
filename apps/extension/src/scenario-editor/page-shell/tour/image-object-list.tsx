import { useState } from 'react';
import { ArrowDown, ArrowUp, Crosshair, MessageSquare, Plus, ScanLine, Trash2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  getTourHotspots,
  getTourAnnotations,
  getTourSlideObjects,
  TOUR_LIMITS,
  type TourSlideObject,
  type TourDocument,
  type TourImageSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { buildTourPlaybackPlan } from '../../../features/scenario/project/tour-playback-plan';
import type { Translate } from '../../../platform/i18n';
import { GuideInspectorGroup } from '../inspector';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { GuideActionMenu } from '../action-menu';

/** Owns action acquisition, ordering and removal within one authoring slide. */
export function TourImageObjects({
  tour,
  slide,
  disabled,
  onChange,
  onSelect,
  t,
}: {
  tour: TourDocument;
  slide: TourImageSlide;
  disabled: boolean;
  onChange: (slide: TourImageSlide, group?: string | null) => boolean;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const numbers = new Map(
    buildTourPlaybackPlan(tour).entries.map((entry) => [entry.actionId, entry.ordinal])
  );
  const move = (id: string, beforeId: string | null) => {
    const entry = slide.actions.find((item) => item.object.id === id);
    if (!entry || id === beforeId) return;
    const actions = slide.actions.filter((item) => item.object.id !== id);
    const index = beforeId
      ? actions.findIndex((item) => item.object.id === beforeId)
      : actions.length;
    actions.splice(index < 0 ? actions.length : index, 0, entry);
    onChange({ ...slide, actions });
  };
  const add = (kind: 'hotspot' | 'annotation' | 'mask') =>
    commitTourImageObject(slide, kind, t, onChange, onSelect);
  return (
    <GuideInspectorGroup
      id="objects"
      icon={Crosshair}
      title={t('scenario.editor.tourObjects')}
      action={
        slide.actions.length + slide.masks.length ? (
          <TourAddObjectMenu slide={slide} disabled={disabled} onAdd={add} t={t} />
        ) : undefined
      }
    >
      {!slide.actions.length && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourNoActions')}</p>
      )}
      {!slide.actions.length && !slide.masks.length && (
        <TourImageObjectActions slide={slide} disabled={disabled} onAdd={add} t={t} />
      )}
      <ol
        className="tour-object-list"
        aria-label={t('scenario.editor.tourObjects')}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (dragged && !disabled) move(dragged, before);
          setDragged(null);
          setBefore(null);
        }}
      >
        {getTourSlideObjects(slide).map((entry) => {
          const { label, Icon } = tourSlideObjectLabel(entry, t);
          const actionIndex = slide.actions.findIndex((item) => item.object.id === entry.object.id);
          return (
            <li
              className="tour-object-item"
              key={entry.object.id}
              data-action-before={entry.object.id}
              data-drop-before={before === entry.object.id || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                if (entry.type !== 'mask') setBefore(entry.object.id);
              }}
            >
              <button
                className="tour-object-row"
                data-inspector-object={entry.object.id}
                onClick={() => onSelect(entry.object.id)}
                title={label}
                draggable={!disabled && entry.type !== 'mask'}
                onDragStart={(event) => {
                  setDragged(entry.object.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', entry.object.id);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setBefore(null);
                }}
              >
                <Icon size={15} aria-hidden="true" />
                <span>
                  {entry.type !== 'mask' && (
                    <span className="tour-action-number">{numbers.get(entry.object.id)}. </span>
                  )}
                  {label}
                </span>
              </button>
              <div className="tour-object-item-actions">
                {entry.type !== 'mask' && (
                  <>
                    <ContentToolbarButton
                      title={t('scenario.editor.tourMoveObjectUp')}
                      disabled={disabled || actionIndex === 0}
                      onClick={() =>
                        move(entry.object.id, slide.actions[actionIndex - 1]?.object.id ?? null)
                      }
                    >
                      <ArrowUp size={14} />
                    </ContentToolbarButton>
                    <ContentToolbarButton
                      title={t('scenario.editor.tourMoveObjectDown')}
                      disabled={disabled || actionIndex === slide.actions.length - 1}
                      onClick={() =>
                        move(entry.object.id, slide.actions[actionIndex + 2]?.object.id ?? null)
                      }
                    >
                      <ArrowDown size={14} />
                    </ContentToolbarButton>
                  </>
                )}
                <ContentToolbarButton
                  className="tour-object-delete"
                  tone="danger"
                  title={t('common.actions.delete')}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...slide,
                      actions: slide.actions.filter((item) => item.object.id !== entry.object.id),
                      masks: slide.masks.filter((item) => item.id !== entry.object.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </ContentToolbarButton>
              </div>
            </li>
          );
        })}
      </ol>
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
export function commitTourImageObject(
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
  const next: TourImageSlide =
    kind === 'mask'
      ? {
          ...slide,
          masks: [
            ...slide.masks,
            {
              id,
              kind: 'redact',
              rect: { x: 0.25, y: 0.25, width: 0.3, height: 0.2 },
              color: '#111827',
              opacity: 1,
            },
          ],
        }
      : {
          ...slide,
          actions: [
            ...slide.actions,
            kind === 'hotspot'
              ? {
                  type: 'hotspot',
                  object: {
                    id,
                    point: { x: 0.5, y: 0.5 },
                    targetRect: null,
                    label: t('scenario.editor.tourHotspot'),
                    text: '',
                    appearance: null,
                    visual: { kind: 'point', pulse: true },
                  },
                }
              : { type: 'annotation', object: { id, text: '', anchor: null, appearance: null } },
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
      disabled: getTourHotspots(slide).length >= TOUR_LIMITS.maxHotspots,
    },
    {
      value: 'annotation' as const,
      label: t('scenario.editor.tourAnnotation'),
      icon: <MessageSquare size={15} aria-hidden="true" />,
      disabled: getTourAnnotations(slide).length >= TOUR_LIMITS.maxAnnotations,
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
export function TourAddObjectMenu({
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
