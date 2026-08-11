import { PanelTop, PanelTopOpen, PanelsTopLeft, Zap } from 'lucide-react';
import { PopupIconStateButton } from '../../../../ui/popup-shell/icon-state-button';
import { translate } from '../../../../platform/i18n';
import type { ScreenshotSetupMode } from '../../../../composition/persistence/capture-settings';

const ACCENT = 'text-[var(--sniptale-color-accent)]';
const MODE_HINT_KEYS = {
  'quick-actions': 'popup.home.quickActionsModeHint',
  tab: 'popup.home.captureTabHint',
  desktop: 'popup.home.captureWindowHint',
} as const;

export function ScreenshotModeSelector(props: {
  mode: ScreenshotSetupMode;
  tabDisabledReason: string | null;
  toolsDisabledReason: string | null;
  onModeChange(mode: ScreenshotSetupMode): void;
  onOpenTools(): void;
}) {
  const options = [
    { mode: 'quick-actions' as const, icon: Zap, label: translate('popup.home.quickActionsTitle') },
    { mode: 'tab' as const, icon: PanelTop, label: translate('popup.home.captureTabLabel') },
    {
      mode: 'desktop' as const,
      icon: PanelsTopLeft,
      label: translate('popup.home.captureWindowLabel'),
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {options.map((option) => {
        const disabledReason = option.mode === 'tab' ? props.tabDisabledReason : null;
        return (
          <PopupIconStateButton
            key={option.mode}
            icon={option.icon}
            label={option.label}
            description={disabledReason ?? translate(MODE_HINT_KEYS[option.mode])}
            active={props.mode === option.mode}
            disabled={Boolean(disabledReason)}
            accentClassName={ACCENT}
            layout="stacked"
            onClick={() => props.onModeChange(option.mode)}
          />
        );
      })}
      <PopupIconStateButton
        icon={PanelTopOpen}
        label={translate('popup.home.toolsLabel')}
        description={props.toolsDisabledReason ?? translate('popup.home.toolsTitle')}
        active={false}
        disabled={Boolean(props.toolsDisabledReason)}
        accentClassName={ACCENT}
        layout="stacked"
        onClick={props.onOpenTools}
      />
    </div>
  );
}
