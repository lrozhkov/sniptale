import { translate } from '../../../../../platform/i18n';
import { HighlighterSectionContent } from './content';
import { DelayedSettingsCenteredLoadingState } from '../../../../section-surface/loading-state';
import { useHighlighterSection } from './useHighlighterSection';

export function HighlighterSection() {
  const controller = useHighlighterSection();
  const { settings } = controller.status;

  if (controller.status.isLoading) {
    return <DelayedSettingsCenteredLoadingState />;
  }

  if (!settings) {
    return (
      <div className="animate-fadeIn flex items-center justify-center py-12">
        <p className="text-sm text-[var(--sniptale-color-danger)]">
          {translate('common.states.error')}
          {translate('highlighter.section.loadErrorSuffix')}
        </p>
      </div>
    );
  }

  return <HighlighterSectionContent presets={controller.presets} settings={settings} />;
}
