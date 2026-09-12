import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideNumbering } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { guideReadingPages, type GuideReadingOptions } from './reader-pages';

/** The same safe anchor projection supports React reading and standalone progressive navigation. */
export function GuideReadingNavigation({
  project,
  currentId,
  onSelect,
  t,
}: {
  project: GuideProject;
  currentId?: string | undefined;
  onSelect?: (id: string) => void;
  t: Translate;
}) {
  const numbers = resolveGuideNumbering(project.items);
  return (
    <nav className="guide-reading-nav" aria-label={t('scenario.editor.guideReaderOutline')}>
      {guideReadingPages(project.items).map((page, index) => {
        const step = page.items.find((item) => item.kind === 'step');
        const title =
          page.items
            .map((item) => item.title)
            .filter(Boolean)
            .join(' · ') || t('scenario.editor.guideStepTitle');
        return (
          <a
            key={page.id}
            href={`#${page.id}`}
            data-guide-target={page.id}
            title={title}
            aria-label={`${index + 1}. ${title}`}
            aria-current={page.id === currentId ? 'step' : undefined}
            onClick={
              onSelect
                ? (event) => {
                    event.preventDefault();
                    onSelect(page.id);
                  }
                : undefined
            }
          >
            <span className="guide-reading-badge">
              {step ? (numbers.get(step.id)?.label ?? '•') : '§'}
            </span>
            <span className="guide-reading-title">{title}</span>
          </a>
        );
      })}
    </nav>
  );
}

/** Compact output controls share labels and choices across reader and HTML preparation. */
export function GuideReadingControls({
  value,
  onChange,
  disabled = false,
  t,
}: {
  value: GuideReadingOptions;
  onChange: (value: GuideReadingOptions) => void;
  disabled?: boolean;
  t: Translate;
}) {
  return (
    <fieldset className="guide-reading-options" disabled={disabled}>
      <SegmentedSwitch
        density="compact"
        ariaLabel={t('scenario.editor.guideReaderMode')}
        activeId={value.mode}
        options={[
          { id: 'flow', label: t('scenario.editor.guideReaderFlow') },
          { id: 'steps', label: t('scenario.editor.guideReaderSteps') },
        ]}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      <CompactSelect
        aria-label={t('scenario.editor.guideNavigationPosition')}
        value={value.navigation}
        options={[
          { value: 'top', label: t('scenario.editor.guideNavigationTop') },
          { value: 'side', label: t('scenario.editor.guideNavigationSide') },
        ]}
        onChange={(navigation) => onChange({ ...value, navigation })}
        disabled={disabled}
      />
    </fieldset>
  );
}
