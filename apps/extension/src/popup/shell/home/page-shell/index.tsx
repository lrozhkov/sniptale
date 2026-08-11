import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { translate } from '../../../../platform/i18n';
import type {
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import type { QuickAction, ViewportPreset } from '../../../../contracts/settings';
import {
  type GalleryStatus,
  PopupHomeActionRow,
  PopupHomeErrorMessage,
  PopupHomeQuickActions,
} from './sections';
import { usePopupHomeActions } from './actions';
import { PageAccessControls } from './page-access-controls';
import { isDesktopQuickAction } from '../../../../features/quick-actions-presets/policy';

interface PopupHomePageProps {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  viewportPresets: ViewportPreset[];
  activeTabCapabilities: ActiveTabCapabilities;
  galleryStatus: GalleryStatus | null;
  homeError?: string | null;
  pageAccess?: PopupPageAccessRuntime;
}

const defaultPageAccessRuntime: PopupPageAccessRuntime = {
  disabledReason: null,
  error: null,
  handleRequest: async () => undefined,
  loading: false,
  pendingOperation: null,
  status: null,
};

function isPageAccessChoiceActive(status: PageAccessStatus | null): boolean {
  return status?.supported === true && !status.currentTabActive;
}

function getPopupHomeCapabilityState(
  activeTabCapabilities: ActiveTabCapabilities,
  quickActions: QuickAction[],
  pageAccessDisabledReason: string | null,
  pageAccessStatus: PageAccessStatus | null
) {
  const shouldShowQuickActions =
    !isPageAccessChoiceActive(pageAccessStatus) || quickActions.some(isDesktopQuickAction);
  const restrictedPageFeaturesTitle = activeTabCapabilities.isRestrictedPage
    ? translate('popup.common.restrictedPageFeatures')
    : null;
  const screenshotDisabledReason =
    activeTabCapabilities.screenshotMode.reason ?? pageAccessDisabledReason;
  const quickActionsDisabledReason =
    activeTabCapabilities.quickActions.reason ?? pageAccessDisabledReason;
  return {
    shouldShowQuickActions,
    hasQuickActions: shouldShowQuickActions && quickActions.length > 0,
    screenshotDisabledReason,
    quickActionsDisabledReason,
    restrictedPageFeaturesTitle,
    screenshotDisabledTitle: restrictedPageFeaturesTitle ?? screenshotDisabledReason,
    quickActionsDisabledTitle: restrictedPageFeaturesTitle ?? quickActionsDisabledReason,
  };
}

type PopupHomeCapabilityState = ReturnType<typeof getPopupHomeCapabilityState>;

interface PopupHomePageContentProps {
  capabilityState: PopupHomeCapabilityState;
  galleryStatus: GalleryStatus | null;
  onOpenScreenshotMode(): void;
  onPageAccessRequest(operation: PageAccessOperation): void;
  onQuickAction(actionId: string): void;
  pageAccessError: string | null;
  pageAccessPendingOperation: PageAccessOperation | null;
  pageAccessStatus: PageAccessStatus | null;
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  resolvedHomeError: string | null;
  showHomeError: boolean;
  viewportPresets: ViewportPreset[];
}

function PopupHomePageContent({
  capabilityState,
  galleryStatus,
  onOpenScreenshotMode,
  onPageAccessRequest,
  onQuickAction,
  pageAccessError,
  pageAccessPendingOperation,
  pageAccessStatus,
  quickActions,
  quickActionsReady,
  resolvedHomeError,
  showHomeError,
  viewportPresets,
}: PopupHomePageContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PopupHomeQuickActions
        shouldShowQuickActions={capabilityState.shouldShowQuickActions}
        quickActionsReady={quickActionsReady}
        hasQuickActions={capabilityState.hasQuickActions}
        quickActions={quickActions}
        viewportPresets={viewportPresets}
        quickActionsDisabledTitle={capabilityState.quickActionsDisabledTitle}
        restrictionIndicatorTitle={capabilityState.restrictedPageFeaturesTitle}
        onTriggerAction={onQuickAction}
      />
      <PageAccessControls
        disabled={pageAccessPendingOperation !== null}
        error={pageAccessError}
        onRequest={onPageAccessRequest}
        pendingOperation={pageAccessPendingOperation}
        status={pageAccessStatus}
      />
      <PopupHomeActionRow
        screenshotDisabled={Boolean(capabilityState.screenshotDisabledReason)}
        screenshotDisabledTitle={capabilityState.screenshotDisabledTitle}
        galleryStatus={galleryStatus}
        onOpenScreenshotMode={onOpenScreenshotMode}
      />
      {showHomeError && resolvedHomeError ? (
        <PopupHomeErrorMessage message={resolvedHomeError} />
      ) : null}
    </div>
  );
}

export function PopupHomePage({
  quickActions,
  quickActionsReady,
  viewportPresets,
  activeTabCapabilities,
  galleryStatus,
  homeError,
  pageAccess = defaultPageAccessRuntime,
}: PopupHomePageProps) {
  const capabilityState = getPopupHomeCapabilityState(
    activeTabCapabilities,
    quickActions,
    pageAccess.disabledReason,
    pageAccess.status
  );
  const { actionError, handleOpenScreenshotMode, handleQuickAction } = usePopupHomeActions({
    screenshotDisabledReason: capabilityState.screenshotDisabledReason,
    quickActionsDisabledReason: capabilityState.quickActionsDisabledReason,
    quickActions,
  });
  const resolvedHomeError = actionError ?? homeError ?? null;

  return (
    <PopupHomePageContent
      capabilityState={capabilityState}
      galleryStatus={galleryStatus}
      onOpenScreenshotMode={() => {
        void handleOpenScreenshotMode();
      }}
      onPageAccessRequest={(operation) => {
        void pageAccess.handleRequest(operation);
      }}
      onQuickAction={(actionId) => {
        void handleQuickAction(actionId);
      }}
      pageAccessError={pageAccess.error}
      pageAccessPendingOperation={pageAccess.pendingOperation}
      pageAccessStatus={pageAccess.status}
      quickActions={quickActions}
      quickActionsReady={quickActionsReady}
      resolvedHomeError={resolvedHomeError}
      showHomeError={!activeTabCapabilities.isRestrictedPage || homeError != null}
      viewportPresets={viewportPresets}
    />
  );
}
