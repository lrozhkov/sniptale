import { useEffect, useMemo, useState } from 'react';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  loadCalloutPresetCatalog,
  subscribeToCalloutPresetCatalog,
} from '../../persistence/callout-presets';
import {
  loadStepBadgePresetCatalog,
  subscribeToStepBadgePresetCatalog,
} from '../../persistence/step-badge-presets';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';
import { useAppLocale } from '../../../platform/i18n';
import type { LinkedAnnotationTemplateOptions } from '../../../ui/highlighter-preset-editor/fields/inspector';

export function useLinkedAnnotationTemplateOptions(): LinkedAnnotationTemplateOptions {
  const locale = useAppLocale();
  const [callouts, setCallouts] = useState<CalloutPresetCatalog | null>(null);
  const [stepBadges, setStepBadges] = useState<StepBadgePresetCatalog | null>(null);

  useEffect(() => {
    let active = true;
    void loadCalloutPresetCatalog()
      .then((catalog) => {
        if (active) setCallouts(catalog);
      })
      .catch(() => undefined);
    void loadStepBadgePresetCatalog()
      .then((catalog) => {
        if (active) setStepBadges(catalog);
      })
      .catch(() => undefined);
    const unsubscribeCallouts = subscribeToCalloutPresetCatalog(setCallouts);
    const unsubscribeStepBadges = subscribeToStepBadgePresetCatalog(setStepBadges);
    return () => {
      active = false;
      unsubscribeCallouts();
      unsubscribeStepBadges();
    };
  }, []);

  return useMemo(
    () => ({
      callouts:
        callouts?.presets.map((preset) => ({
          label: getCalloutPresetDisplayName(preset, locale),
          value: preset.id,
        })) ?? [],
      stepBadges:
        stepBadges?.presets.map((preset) => ({
          label: getStepBadgePresetDisplayName(preset, locale),
          value: preset.id,
        })) ?? [],
    }),
    [callouts, locale, stepBadges]
  );
}
