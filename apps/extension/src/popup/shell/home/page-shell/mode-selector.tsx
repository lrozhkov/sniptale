import { ListChecks, PanelTop, PanelsTopLeft } from 'lucide-react';
import { useState } from 'react';
import { PopupExpandingModeButton } from '../../../../ui/popup-shell/expanding-mode-button';
import { translate } from '../../../../platform/i18n/popup';
const ACCENT = 'text-[var(--sniptale-color-accent)]';
const MODE_HINT_KEYS = {
  'quick-actions': 'popup.home.quickActionsModeHint',
  tab: 'popup.home.captureTabHint',
  desktop: 'popup.home.captureWindowHint',
} as const;

type ScreenshotPageMode = keyof typeof MODE_HINT_KEYS;

export function ScreenshotModeSelector(props: {
  mode: ScreenshotPageMode;
  tabDisabledReason: string | null;
  onModeChange(mode: ScreenshotPageMode): void;
}) {
  const [animate, setAnimate] = useState(false);
  const options = [
    {
      mode: 'quick-actions' as const,
      icon: ListChecks,
      label: translate('popup.home.shortcutsModeLabel'),
    },
    { mode: 'tab' as const, icon: PanelTop, label: translate('popup.home.captureTabLabel') },
    {
      mode: 'desktop' as const,
      icon: PanelsTopLeft,
      label: translate('popup.home.captureWindowLabel'),
    },
  ];
  return (
    <div className="flex gap-1.5">
      {options.map((option) => {
        const disabledReason = option.mode === 'tab' ? props.tabDisabledReason : null;
        return (
          <PopupExpandingModeButton
            key={option.mode}
            icon={option.icon}
            label={option.label}
            description={disabledReason ?? translate(MODE_HINT_KEYS[option.mode])}
            active={props.mode === option.mode}
            animate={animate}
            disabled={Boolean(disabledReason)}
            accentClassName={ACCENT}
            onClick={() => {
              setAnimate(true);
              props.onModeChange(option.mode);
            }}
          />
        );
      })}
    </div>
  );
}
