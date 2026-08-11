import type { BundledQuickActionId, QuickAction } from '../../contracts/settings';

export type BundledQuickActionConfig = {
  id: BundledQuickActionId;
  icon: string;
  nameKey:
    | 'shared.defaults.quickActionVisibleDownload'
    | 'shared.defaults.quickActionVisibleEdit'
    | 'shared.defaults.quickActionSelectionDownload'
    | 'shared.defaults.quickActionVisibleDelayed'
    | 'shared.defaults.quickActionVisibleCopy'
    | 'shared.defaults.quickActionSelectionCopy'
    | 'shared.defaults.quickActionDesktopDownload';
  screenshotMode: QuickAction['screenshotMode'];
  afterCapture: NonNullable<QuickAction['afterCapture']>;
  delay: Exclude<QuickAction['delay'], undefined>;
  imageFormat?: QuickAction['imageFormat'];
  exitAfterCapture?: boolean;
};
