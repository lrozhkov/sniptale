import { translate } from '../../platform/i18n';
import type { BundledQuickActionId, QuickAction } from '../../contracts/settings';
import type { BundledQuickActionConfig } from './types';

const bundledQuickActionConfigs: readonly BundledQuickActionConfig[] = [
  {
    id: 'default-fullscreen',
    icon: 'MonitorDown',
    nameKey: 'shared.defaults.quickActionVisibleDownload',
    screenshotMode: 'visible',
    afterCapture: 'download_default',
    delay: null,
  },
  {
    id: 'default-edit-visible',
    icon: 'PencilLine',
    nameKey: 'shared.defaults.quickActionVisibleEdit',
    screenshotMode: 'visible',
    afterCapture: 'edit',
    delay: null,
  },
  {
    id: 'default-selection',
    icon: 'SquareDashedMousePointer',
    nameKey: 'shared.defaults.quickActionSelectionDownload',
    screenshotMode: 'selection',
    afterCapture: 'download_default',
    delay: null,
  },
  {
    id: 'default-delayed-visible',
    icon: 'Clock3',
    nameKey: 'shared.defaults.quickActionVisibleDelayed',
    screenshotMode: 'visible',
    afterCapture: 'download_default',
    delay: 5,
  },
  {
    id: 'default-copy-visible',
    icon: 'ClipboardCopy',
    nameKey: 'shared.defaults.quickActionVisibleCopy',
    screenshotMode: 'visible',
    afterCapture: 'copy',
    delay: null,
  },
  {
    id: 'default-copy-selection',
    icon: 'Scan',
    nameKey: 'shared.defaults.quickActionSelectionCopy',
    screenshotMode: 'selection',
    afterCapture: 'copy',
    delay: null,
  },
] as const;

const bundledQuickActionIdSet = new Set<BundledQuickActionId>(
  bundledQuickActionConfigs.map((config) => config.id)
);

const bundledQuickActionConfigMap = new Map<BundledQuickActionId, BundledQuickActionConfig>(
  bundledQuickActionConfigs.map((config) => [config.id, config])
);

function getBundledQuickActionId(value: unknown): BundledQuickActionId | null {
  if (typeof value !== 'string') {
    return null;
  }

  return bundledQuickActionIdSet.has(value as BundledQuickActionId)
    ? (value as BundledQuickActionId)
    : null;
}

export function getBundledQuickActionConfig(
  actionOrId: Pick<QuickAction, 'id' | 'origin' | 'bundledId'> | BundledQuickActionId
): BundledQuickActionConfig | null {
  const bundledId =
    typeof actionOrId === 'string'
      ? getBundledQuickActionId(actionOrId)
      : (getBundledQuickActionId(actionOrId.bundledId) ??
        (actionOrId.origin === 'bundled' ? getBundledQuickActionId(actionOrId.id) : null) ??
        getBundledQuickActionId(actionOrId.id));

  return bundledId ? (bundledQuickActionConfigMap.get(bundledId) ?? null) : null;
}

export function createBundledQuickAction(config: BundledQuickActionConfig): QuickAction {
  return {
    id: config.id,
    status: true,
    name: translate(config.nameKey),
    icon: config.icon,
    origin: 'bundled',
    bundledId: config.id,
    hotkey: null,
    screenshotMode: config.screenshotMode,
    emulation: 'native',
    delay: config.delay,
    afterCapture: config.afterCapture,
    imageFormat: 'png',
    imageQuality: null,
    exitAfterCapture: true,
  };
}

export function getBundledQuickActions(): QuickAction[] {
  return bundledQuickActionConfigs.map(createBundledQuickAction);
}

export function getQuickActionDisplayName(
  action: Pick<QuickAction, 'name' | 'id' | 'origin' | 'bundledId'>
): string {
  const bundledConfig = getBundledQuickActionConfig(action);
  return bundledConfig ? translate(bundledConfig.nameKey) : action.name;
}

export function isBundledQuickAction(
  action: Pick<QuickAction, 'id' | 'origin' | 'bundledId'> | null | undefined
): boolean {
  return Boolean(action && getBundledQuickActionConfig(action));
}
