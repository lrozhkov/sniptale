import { Droplets, Image, Maximize2, Square, Type } from 'lucide-react';
import { useLayoutEffect, useState, type ComponentType } from 'react';
import { translate, type TranslationKey } from '../../../../platform/i18n';
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
  state: DesignReviewViewState;
}) {
  switch (props.section) {
    case 'text':
      return <TextSection {...props} />;
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
}) {
  const imageSelected = props.state.selection?.kind === 'image';
  const sections: SectionOption[] = imageSelected
    ? [
        ...BASE_SECTIONS,
        { icon: Image, key: 'image' as const, labelKey: 'content.designReview.sectionImage' },
      ]
    : BASE_SECTIONS;
  const [section, setSection] = useState<SettingsSection>(imageSelected ? 'image' : 'text');

  useLayoutEffect(() => {
    setSection(imageSelected ? 'image' : 'text');
  }, [imageSelected, props.state.selection?.element]);

  return (
    <div className="grid min-h-40 grid-cols-[3rem_minmax(0,1fr)]">
      <nav
        className={[
          'grid content-start gap-1 border-r border-solid p-1.5',
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
                'inline-flex h-9 w-9 items-center justify-center rounded-[7px]',
                section === option.key
                  ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]'
                  : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
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
      <div className="min-w-0 p-2.5">
        <SettingsContent {...props} section={section} />
      </div>
    </div>
  );
}
