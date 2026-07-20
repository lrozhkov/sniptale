import type { QuickAction, QuickActionDelay, ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { getSettingsCountLabel } from '../../../section-surface/text.helpers';

export function getEmulationLabel(
  viewportPresets: ViewportPreset[] | undefined,
  emulationId: string | null | undefined
): string {
  if (!emulationId || emulationId === 'native') {
    return translate('settings.quickActions.emulationNone');
  }

  const preset = viewportPresets?.find((item) => item.id === emulationId);
  return preset ? `${preset.label} (${preset.width}×${preset.height})` : emulationId;
}

export function getDelayLabel(delay: QuickActionDelay | null | undefined): string {
  if (delay === null || delay === undefined) {
    return '';
  }

  return delay === 0
    ? translate('settings.quickActions.delayNone')
    : `${delay} ${translate('settings.quickActions.delayShortSuffix')}`;
}

export function getQuickActionCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'settings.quickActions.countOne',
    few: 'settings.quickActions.countFew',
    many: 'settings.quickActions.countMany',
  });
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
    emulation: 'native',
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  };
}

export function reorderQuickActions(
  actions: QuickAction[],
  draggedId: string,
  targetId: string
): QuickAction[] | null {
  const draggedIndex = actions.findIndex((action) => action.id === draggedId);
  const targetIndex = actions.findIndex((action) => action.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return null;
  }

  const nextActions = [...actions];
  const [draggedAction] = nextActions.splice(draggedIndex, 1);
  if (!draggedAction) {
    return null;
  }
  nextActions.splice(targetIndex, 0, draggedAction);
  return nextActions;
}
