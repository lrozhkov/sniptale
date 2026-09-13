import type {
  TourDocument,
  TourNavigationSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { List, Flag, Plus, Trash2 } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
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
      </GuideInspectorGroup>
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
        {slide.buttons.map((entry, index) => (
          <button className="tour-object-row" key={entry.id} onClick={() => onSelect(entry.id)}>
            {index + 1}. {entry.label || t('scenario.editor.tourButton')}
          </button>
        ))}
      </GuideInspectorGroup>
    </>
  );
}

export function TourEndSettings({
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
  const value = tour.endScreen;
  const change = (patch: Partial<TourDocument['endScreen']>) =>
    onChange({ ...tour, endScreen: { ...value, ...patch } });
  return (
    <GuideInspectorGroup icon={Flag} title={t('scenario.editor.tourEnd')}>
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourEnabled')}
          checked={value.enabled}
          onClick={() => change({ enabled: !value.enabled })}
        />
        {t('scenario.editor.tourEnabled')}
      </label>
      <TourTextField
        label={t('scenario.editor.guideStepTitle')}
        singleLine
        value={value.title}
        disabled={disabled}
        onChange={(title) => change({ title })}
      />
      <TourTextField
        label={t('scenario.editor.textLabel')}
        value={value.description}
        disabled={disabled}
        onChange={(description) => change({ description })}
      />
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourRestart')}
          checked={value.restart}
          onClick={() => change({ restart: !value.restart })}
        />
        {t('scenario.editor.tourRestart')}
      </label>
    </GuideInspectorGroup>
  );
}
