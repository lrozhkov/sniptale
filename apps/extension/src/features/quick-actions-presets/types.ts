import type {
  BundledQuickActionId,
  QuickAction,
  QuickActionsDisplayMode,
} from '../../contracts/settings';

export type BundledQuickActionConfig = {
  id: BundledQuickActionId;
  icon: string;
  nameKey:
    | 'shared.defaults.quickActionVisibleDownload'
    | 'shared.defaults.quickActionVisibleEdit'
    | 'shared.defaults.quickActionSelectionDownload'
    | 'shared.defaults.quickActionVisibleDelayed'
    | 'shared.defaults.quickActionVisibleCopy'
    | 'shared.defaults.quickActionSelectionCopy';
  screenshotMode: QuickAction['screenshotMode'];
  afterCapture: NonNullable<QuickAction['afterCapture']>;
  delay: Exclude<QuickAction['delay'], undefined>;
};

export type QuickActionDisplayModeInput = QuickActionsDisplayMode | 'row' | null | undefined;
