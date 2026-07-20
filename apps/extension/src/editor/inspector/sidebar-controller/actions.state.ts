import { useEffect, useState } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import {
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
  subscribeToHighlighterSettings,
} from '../../../composition/persistence/highlighter';
import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { loadRecentColors, pushRecentColor } from '../sidebar-shared';
import { isRecordableRecentColor } from './colors';

function sortBorderPresets(borderPresets: BorderPreset[]): BorderPreset[] {
  return [...borderPresets].sort((left, right) => {
    const orderDelta = (left.order ?? 0) - (right.order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return left.name.localeCompare(right.name);
  });
}

export function useBorderPresetsState() {
  const [borderPresets, setBorderPresets] = useState<BorderPreset[]>([DEFAULT_BORDER_PRESET]);
  const [defaultBorderPresetId, setDefaultBorderPresetId] = useState(DEFAULT_BORDER_PRESET.id);

  useEffect(() => {
    let cancelled = false;
    const applySettings = (settings: Awaited<ReturnType<typeof loadHighlighterSettings>>) => {
      if (cancelled) {
        return;
      }

      const loadedBorderPresets =
        settings.borderPresets.length > 0 ? settings.borderPresets : [DEFAULT_BORDER_PRESET];
      setBorderPresets(sortBorderPresets(loadedBorderPresets));
      setDefaultBorderPresetId(settings.defaultBorderPresetId);
    };

    void loadHighlighterSettings()
      .then(applySettings)
      .catch(() => {
        if (!cancelled) {
          setBorderPresets([DEFAULT_BORDER_PRESET]);
          setDefaultBorderPresetId(DEFAULT_BORDER_PRESET.id);
        }
      });
    const unsubscribe = subscribeToHighlighterSettings(applySettings);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    appendBorderPreset: (preset: BorderPreset) => {
      setBorderPresets((current) => sortBorderPresets([...current, preset]));
    },
    borderPresets,
    defaultBorderPresetId,
  };
}

export function useRecentColorsState() {
  const [recentColors, setRecentColors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void loadRecentColors()
      .then((colors: string[]) => {
        if (!cancelled) {
          setRecentColors(colors);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentColors([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function rememberRecentColor(color: string) {
    if (!isRecordableRecentColor(color)) {
      return;
    }

    try {
      const nextColors = await pushRecentColor(color);
      setRecentColors(nextColors);
    } catch {
      toast.error(translate('common.states.error'));
    }
  }

  return { recentColors, rememberRecentColor };
}
