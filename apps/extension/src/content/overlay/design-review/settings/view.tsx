import { InspectorDisclosureView } from '../../../../ui/compact-inspector-controls/disclosure';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../../ui/compact-inspector-controls/layout';
import { Droplets, Image, Maximize2, Square, Type } from 'lucide-react';
import { useLayoutEffect, useState, type ComponentType } from 'react';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { useDesignReviewInputModality } from '../input-modality';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { ImageSection } from './image-section';
import { AppearanceSection } from './sections/appearance';
import { BorderSection } from './sections/border';
import { BoxSection } from './sections/frame';
import { TextSection } from './sections/text';

type SettingsSection = 'text' | 'layout' | 'appearance' | 'border' | 'image';

type SectionOption = {
  icon: ComponentType<{ size?: number }>;
  key: SettingsSection;
  labelKey: TranslationKey;
};

const BASE_SECTIONS: SectionOption[] = [
  { icon: Type, key: 'text', labelKey: 'content.designReview.sectionText' },
  { icon: Maximize2, key: 'layout', labelKey: 'content.designReview.sectionFrame' },
  { icon: Droplets, key: 'appearance', labelKey: 'content.designReview.sectionAppearance' },
  { icon: Square, key: 'border', labelKey: 'content.designReview.sectionBorder' },
];

function SettingsContent(props: {
  actions: DesignReviewActions;
  disabled: boolean;
  section: SettingsSection;
  compact?: boolean;
  state: DesignReviewViewState;
}) {
  switch (props.section) {
    case 'text':
      return <TextSection {...props} compact={props.compact} />;
    case 'layout':
      return <BoxSection {...props} />;
    case 'appearance':
      return <AppearanceSection {...props} />;
    case 'border':
      return <BorderSection {...props} />;
    case 'image':
      return <ImageSection {...props} />;
  }
}

export function DesignReviewSettings(props: {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
  presentation?: 'comment' | 'workspace';
}) {
  const modality = useDesignReviewInputModality();
  const imageSelected = props.state.selection?.kind === 'image';
  const sections: SectionOption[] = imageSelected
    ? [
        ...BASE_SECTIONS,
        { icon: Image, key: 'image' as const, labelKey: 'content.designReview.sectionImage' },
      ]
    : BASE_SECTIONS;
  const [section, setSection] = useState<SettingsSection | null>(imageSelected ? 'image' : 'text');

  useLayoutEffect(() => {
    if (props.presentation !== 'workspace') setSection(imageSelected ? 'image' : 'text');
    else if (!imageSelected) setSection((current) => (current === 'image' ? 'text' : current));
  }, [imageSelected, props.state.selection?.element, props.presentation]);

  if (props.presentation === 'workspace')
    return (
      <InspectorLayout>
        <div
          data-ui="content.design-review.settings"
          data-focus-modality={modality}
          className="sniptale-inspector-surface min-w-0"
        >
          {sections.map((option) => (
            <InspectorDisclosureView
              key={option.key}
              dataUi={`content.design-review.workspace-section.${option.key}`}
              variant="structural"
              level="section"
              label={translate(option.labelKey)}
              open={section === option.key}
              onOpenChange={(open) =>
                setSection((current) =>
                  open ? option.key : current === option.key ? null : current
                )
              }
              bodyClassName="px-2 pb-3 pt-2"
            >
              <SettingsContent {...props} section={option.key} compact />
            </InspectorDisclosureView>
          ))}
        </div>
      </InspectorLayout>
    );

  return (
    <CommandPressScope value={true}>
      <InspectorLayout>
        <div
          className={[
            'sniptale-design-review-chrome sniptale-compact-workspace sniptale-inspector-surface',
            'grid min-h-40 grid-cols-[3rem_minmax(0,1fr)]',
          ].join(' ')}
          data-ui="content.design-review.settings"
          data-focus-modality={modality}
        >
          <nav
            className={[
              'grid content-start justify-items-center gap-1 border-r border-solid p-1',
              'border-[color:var(--sniptale-color-border-soft)]',
            ].join(' ')}
            aria-label={translate('content.designReview.settingsNavigation')}
          >
            {sections.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={[
                    'inline-flex h-9 w-9 items-center justify-center rounded-[4px]',
                    section === option.key
                      ? 'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-primary)]'
                      : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
                    'active:bg-[var(--sniptale-color-surface-hover)] focus:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
                  ].join(' ')}
                  aria-label={translate(option.labelKey)}
                  aria-pressed={section === option.key}
                  title={translate(option.labelKey)}
                  onClick={() => setSection(option.key)}
                >
                  <Icon size={17} />
                </button>
              );
            })}
          </nav>
          <div className="min-w-0 p-2">
            <SettingsContent {...props} section={section ?? 'text'} />
          </div>
        </div>
      </InspectorLayout>
    </CommandPressScope>
  );
}
