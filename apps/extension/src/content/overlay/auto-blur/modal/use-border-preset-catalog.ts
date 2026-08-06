import { useEffect, useState } from 'react';
import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import {
  DEFAULT_HIGHLIGHTER_SETTINGS,
  loadHighlighterSettings,
  subscribeToHighlighterSettings,
} from '../../../../composition/persistence/highlighter';
import { resolveEnabledBorderPresetCatalog } from '../../../../features/highlighter/presets/enabled-catalog';

function enabledCatalog(settings: HighlighterSettings): HighlighterSettings {
  return { ...settings, ...resolveEnabledBorderPresetCatalog(settings) };
}

export function useAutoBlurBorderPresetCatalog() {
  const [settings, setSettings] = useState(() => enabledCatalog(DEFAULT_HIGHLIGHTER_SETTINGS));

  useEffect(() => {
    let active = true;
    let hasSubscriptionSnapshot = false;
    void loadHighlighterSettings()
      .then((nextSettings) => {
        if (active && !hasSubscriptionSnapshot) setSettings(enabledCatalog(nextSettings));
      })
      .catch(() => undefined);
    const unsubscribe = subscribeToHighlighterSettings((nextSettings) => {
      if (!active) return;
      hasSubscriptionSnapshot = true;
      setSettings(enabledCatalog(nextSettings));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return settings;
}
