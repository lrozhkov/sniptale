import type {
  QuickAction,
  QuickActionDelay,
  ViewportPreset,
} from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { getViewportPresetDisplayName } from '../../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../../features/viewport-presets/format';

export function getViewportPresetLabel(
  viewportPresets: ViewportPreset[] | undefined,
  presetId: string | null | undefined
): string {
  if (!presetId) {
    return translate('settings.quickActions.emulationNone');
  }

  const preset = viewportPresets?.find((item) => item.id === presetId);
  return preset
    ? `${getViewportPresetDisplayName(preset)} (${formatViewportPresetDimensions(
        preset.width,
        preset.height
      )})`
    : presetId;
}

export function getDelayLabel(delay: QuickActionDelay | null | undefined): string {
  if (delay === null || delay === undefined) {
    return '';
  }

  return delay === 0
    ? translate('settings.quickActions.delayNone')
    : `${delay} ${translate('settings.quickActions.delayShortSuffix')}`;
}

export function createDefaultQuickAction(): QuickAction {
  return {
    id: crypto.randomUUID(),
    status: true,
    name: '',
    icon: 'Camera',
    origin: 'user',
    bundledId: null,
    hotkey: null,
    screenshotMode: 'visible',
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  };
}

export function reorderQuickActionsBefore(
  actions: QuickAction[],
  actionId: string,
  beforeActionId: string | null
) {
  const next = actions.filter((action) => action.id !== actionId);
  const moved = actions.find((action) => action.id === actionId);
  if (!moved) return null;
  const target =
    beforeActionId === null
      ? next.length
      : next.findIndex((action) => action.id === beforeActionId);
  if (target < 0) return null;
  next.splice(target, 0, moved);
  return next;
}
