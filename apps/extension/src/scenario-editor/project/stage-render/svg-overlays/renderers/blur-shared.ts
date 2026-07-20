import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../../../../features/highlighter/style/defaults';

type ResolvedScenarioBlurSettings = BlurSettings & {
  borderPresetId: string | null;
  radius: number;
  shadow: number;
  showBorder: boolean;
  strokeColor: string;
  strokeOpacity: number;
  strokeStyle: NonNullable<BlurSettings['strokeStyle']>;
  strokeWidth: number;
};

export function resolveScenarioBlurSettings(settings: BlurSettings): ResolvedScenarioBlurSettings {
  const strokeWidth =
    settings.showBorder === false
      ? 0
      : (settings.strokeWidth ?? DEFAULT_BLUR_SETTINGS.strokeWidth ?? 0);

  return {
    ...DEFAULT_BLUR_SETTINGS,
    ...settings,
    borderPresetId: settings.borderPresetId ?? DEFAULT_BLUR_SETTINGS.borderPresetId ?? null,
    radius: settings.radius ?? DEFAULT_BLUR_SETTINGS.radius ?? 0,
    shadow: settings.shadow ?? DEFAULT_BLUR_SETTINGS.shadow ?? 0,
    showBorder: settings.showBorder ?? strokeWidth > 0,
    strokeColor: settings.strokeColor ?? DEFAULT_BLUR_SETTINGS.strokeColor ?? '#475569',
    strokeOpacity: settings.strokeOpacity ?? DEFAULT_BLUR_SETTINGS.strokeOpacity ?? 1,
    strokeStyle: settings.strokeStyle ?? DEFAULT_BLUR_SETTINGS.strokeStyle ?? 'solid',
    strokeWidth,
  };
}

export function getScenarioBlurFill(settings: BlurSettings): string {
  const resolved = resolveScenarioBlurSettings(settings);
  if (resolved.blurType !== 'solid') {
    return 'transparent';
  }

  const opacity = Math.min(0.82, Math.max(0.08, resolved.amount / 30));
  return `rgb(0 0 0 / ${opacity.toFixed(3)})`;
}

export function getScenarioBlurDisplacementScale(settings: BlurSettings): string {
  return (resolveScenarioBlurSettings(settings).amount * 1.5).toFixed(3);
}
