import type {
  TourDocument,
  TourNavigationSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { List, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { TourActionField, TourTextField } from './fields';
import type { Translate } from '../../../platform/i18n';

export function TourNavigationSettings({
  slide,
  tour,
  objectId,
  disabled,
  onChange,
  onSelect,
  t,
}: {
  slide: TourNavigationSlide;
  tour: TourDocument;
  objectId: string | null;
  disabled: boolean;
  onChange: (slide: TourNavigationSlide) => boolean;
  onSelect: (id: string | null) => void;
  t: Translate;
}) {
  const button = slide.buttons.find((entry) => entry.id === objectId);
  if (button)
    return (
      <GuideInspectorGroup icon={List} title={t('scenario.editor.tourButton')}>
        <TourTextField
          label={t('scenario.editor.textLabel')}
          singleLine
          value={button.label}
          disabled={disabled}
          onChange={(label) =>
            onChange({
              ...slide,
              buttons: slide.buttons.map((entry) =>
                entry.id === button.id ? { ...entry, label } : entry
              ),
            })
          }
        />
        <TourActionField
          value={button.action}
          tour={tour}
          disabled={disabled}
          t={t}
          onChange={(action) =>
            onChange({
              ...slide,
              buttons: slide.buttons.map((entry) =>
                entry.id === button.id ? { ...entry, action } : entry
              ),
            })
          }
        />
        <ContentToolbarButton
          title={t('common.actions.delete')}
          disabled={disabled}
          onClick={() => {
            if (
              onChange({
                ...slide,
                buttons: slide.buttons.filter((entry) => entry.id !== button.id),
              })
            )
              onSelect(null);
          }}
        >
          <Trash2 size={16} />
        </ContentToolbarButton>
      </GuideInspectorGroup>
    );
  return (
    <>
      <GuideInspectorGroup icon={List} title={t('scenario.editor.tourAddNavigation')}>
        <TourTextField
          label={t('scenario.editor.guideStepTitle')}
          singleLine
          value={slide.title}
          disabled={disabled}
          onChange={(title) => onChange({ ...slide, title })}
        />
        <TourTextField
          label={t('scenario.editor.textLabel')}
          value={slide.description}
          disabled={disabled}
          onChange={(description) => onChange({ ...slide, description })}
        />
        <ColorField
          label={t('scenario.editor.tourBackground')}
          title={t('scenario.editor.tourBackground')}
          value={slide.background.color}
          disabled={disabled}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(color) => onChange({ ...slide, background: { ...slide.background, color } })}
        />
        {slide.background.image && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={disabled}
            onClick={() => onChange({ ...slide, background: { ...slide.background, image: null } })}
          >
            {t('scenario.editor.tourRemoveBackground')}
          </ProductActionButton>
        )}
      </GuideInspectorGroup>
      <TourNavigationButtons
        slide={slide}
        tour={tour}
        disabled={disabled}
        onChange={onChange}
        onSelect={onSelect}
        t={t}
      />
    </>
  );
}

/** Ordered button list and contents generation share one atomic slide update. */
function TourNavigationButtons({
  slide,
  tour,
  disabled,
  onChange,
  onSelect,
  t,
}: {
  slide: TourNavigationSlide;
  tour: TourDocument;
  disabled: boolean;
  onChange: (slide: TourNavigationSlide) => boolean;
  onSelect: (id: string | null) => void;
  t: Translate;
}) {
  const linked = new Set(
    slide.buttons.flatMap((button) =>
      button.action.kind === 'slide' ? [button.action.slideId] : []
    )
  );
  const destinations = tour.slides.filter(
    (entry) => entry.kind === 'image' && !linked.has(entry.id)
  );
  const move = (index: number, offset: number) => {
    const buttons = [...slide.buttons];
    const [button] = buttons.splice(index, 1);
    if (!button) return;
    buttons.splice(index + offset, 0, button);
    onChange({ ...slide, buttons });
  };
  return (
    <GuideInspectorGroup
      icon={List}
      title={t('scenario.editor.tourObjects')}
      action={
        <ContentToolbarButton
          disabled={disabled || slide.buttons.length >= 120}
          title={t('scenario.editor.tourAddButton')}
          onClick={() => {
            const id = crypto.randomUUID();
            if (
              onChange({
                ...slide,
                buttons: [
                  ...slide.buttons,
                  { id, label: t('scenario.editor.tourButton'), action: { kind: 'next' } },
                ],
              })
            )
              onSelect(id);
          }}
        >
          <Plus size={16} />
        </ContentToolbarButton>
      }
    >
      <ProductActionButton
        compact
        tone="secondary"
        disabled={
          disabled || !destinations.length || slide.buttons.length + destinations.length > 120
        }
        onClick={() =>
          onChange({
            ...slide,
            buttons: [
              ...slide.buttons,
              ...destinations.map((entry) => ({
                id: crypto.randomUUID(),
                label: entry.title || t('scenario.editor.tourUntitled'),
                action: { kind: 'slide' as const, slideId: entry.id },
              })),
            ],
          })
        }
      >
        {t('scenario.editor.tourBuildContents')}
      </ProductActionButton>
      {slide.buttons.map((entry, index) => (
        <div key={entry.id} className="tour-slide-row">
          <button
            className="tour-slide-select"
            onClick={() => onSelect(entry.id)}
            title={entry.label}
          >
            {index + 1}. {entry.label || t('scenario.editor.tourButton')}
          </button>
          <ContentToolbarButton
            title={t('scenario.editor.tourMoveButtonUp')}
            disabled={disabled || index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp size={14} />
          </ContentToolbarButton>
          <ContentToolbarButton
            title={t('scenario.editor.tourMoveButtonDown')}
            disabled={disabled || index === slide.buttons.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown size={14} />
          </ContentToolbarButton>
        </div>
      ))}
    </GuideInspectorGroup>
  );
}
