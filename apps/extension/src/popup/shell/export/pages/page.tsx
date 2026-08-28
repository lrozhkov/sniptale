import { useState } from 'react';
import { translate } from '../../../../platform/i18n/popup';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import {
  openGalleryWebSnapshotsPage,
  openSettingsPage,
  openWebSnapshotViewerPage,
} from '../../../../platform/navigation/extension-pages';
import { ExportFooterActions } from '../footer/actions';
import { ExportPageContent } from './content';
import { type PopupExportController, usePopupExportController } from '../controller';
import { WebSnapshotSetupDialog } from './snapshot-setup-dialog';
import { useWebSnapshotAvailability } from './snapshot-availability';

type ExportController = PopupExportController;
type ExportFooterActionsProps = Parameters<typeof ExportFooterActions>[0];

function getWebSnapshotResultAction(controller: ExportController) {
  const { result } = controller.state.session.transfer;
  const snapshotIds = result?.kind === 'webSnapshot' ? (result.snapshotIds ?? []) : [];
  if (result?.success !== true || snapshotIds.length === 0) {
    return {};
  }

  const mode: 'gallery' | 'open' = snapshotIds.length > 1 ? 'gallery' : 'open';

  return {
    onOpenWebSnapshotResult: () => {
      if (mode === 'open') {
        void openWebSnapshotViewerPage(snapshotIds[0]!);
        return;
      }

      void openGalleryWebSnapshotsPage();
    },
    openWebSnapshotResultMode: mode,
    openWebSnapshotResultTitle: translate(
      mode === 'open' ? 'popup.export.openWebSnapshot' : 'popup.export.openWebSnapshotsGallery'
    ),
  };
}

function getExportFooterCallbacks(args: {
  controller: ExportController;
  onRequestExport: () => void;
  onRequestWebSnapshotSave: () => void;
}) {
  return {
    onCancelExport: () => {
      void args.controller.actions.handleCancelExport();
    },
    onCopyJson: () => {
      void args.controller.actions.handleCopyJson();
    },
    onCopyMarkdown: () => {
      void args.controller.actions.handleCopyMarkdown();
    },
    ...getWebSnapshotResultAction(args.controller),
    onResetExportView: () => {
      void args.controller.actions.handleResetExportView();
    },
    onSaveWebSnapshot: () => {
      args.onRequestWebSnapshotSave();
    },
    onStartExport: () => {
      args.onRequestExport();
    },
  };
}

function getExportFooterProps(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccess: PopupPageAccessRuntime;
  controller: ExportController;
  exportDisabledTitle: string | null;
  onRequestExport: () => void;
  onRequestWebSnapshotSave: () => void;
}) {
  const { derived, session } = args.controller.state;
  const isResultReady =
    Boolean(session.transfer.result) || session.transfer.progress.phase === 'error';

  return {
    canExport: derived.canExport,
    canCopyJson: derived.canCopyJson,
    canCopyMarkdown: derived.canCopyMarkdown,
    canSaveWebSnapshot:
      args.controller.state.preferences.hasLoadedPreferences &&
      !args.activeTabCapabilities.export.reason &&
      !args.pageAccess.disabledReason &&
      !derived.isExporting,
    copiedFormat: session.copy.copiedFormat,
    copyJsonTitle: translate('popup.export.copyJsonCurrentTabTitle'),
    copyMarkdownTitle: translate('popup.export.copyMarkdownCurrentTabTitle'),
    isExporting: derived.isExporting,
    isSavingWebSnapshot:
      session.transfer.progress.activeStepKey?.startsWith('webSnapshot') === true ||
      session.transfer.progress.message === translate('popup.export.webSnapshotSaving'),
    isResultReady,
    ...getExportFooterCallbacks({
      controller: args.controller,
      onRequestExport: args.onRequestExport,
      onRequestWebSnapshotSave: args.onRequestWebSnapshotSave,
    }),
    saveWebSnapshotTitle: translate('popup.export.saveWebSnapshotTitle'),
    ...(derived.canExport || args.exportDisabledTitle === null
      ? {}
      : { disabledTitle: args.exportDisabledTitle }),
  };
}

const exportPageContentSectionClassName = [
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
  [
    'bg-[color:color-mix(',
    'in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
    ' p-3',
  ].join(''),
].join(' ');

function ExportPageLayout({
  controller,
  footerProps,
  onCloseWebSnapshotSetup,
  onOpenWebSnapshotSettings,
  webSnapshotSetupOpen,
  webSnapshotStatus,
  webSnapshotEnabled,
  onRequestWebSnapshotSetup,
}: {
  controller: ExportController;
  footerProps: ExportFooterActionsProps;
  onCloseWebSnapshotSetup: () => void;
  onOpenWebSnapshotSettings: () => void;
  webSnapshotSetupOpen: boolean;
  webSnapshotStatus: 'error' | 'loaded' | 'loading';
  webSnapshotEnabled: boolean;
  onRequestWebSnapshotSetup: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <section className={exportPageContentSectionClassName}>
        <ExportPageContent
          controller={controller}
          onRequestWebCopySetup={onRequestWebSnapshotSetup}
          webSnapshotEnabled={webSnapshotEnabled}
        />
        <div className="mt-auto shrink-0 pt-3" data-ui="popup.export.actions">
          <ExportFooterActions {...footerProps} />
        </div>
      </section>
      {webSnapshotSetupOpen ? (
        <WebSnapshotSetupDialog
          onClose={onCloseWebSnapshotSetup}
          onOpenSettings={onOpenWebSnapshotSettings}
          status={webSnapshotStatus}
        />
      ) : null}
    </div>
  );
}

export function ExportPage({
  isActive,
  activeTabCapabilities,
  pageAccess = defaultPageAccessRuntime,
}: {
  isActive: boolean;
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccess?: PopupPageAccessRuntime;
}) {
  const controller = usePopupExportController({
    activeTabCapabilities,
    isActive,
    pageAccess,
  });
  const webSnapshotAvailability = useWebSnapshotAvailability();
  const [webSnapshotSetupOpen, setWebSnapshotSetupOpen] = useState(false);
  const restrictedPageFeaturesTitle = activeTabCapabilities.isRestrictedPage
    ? translate('popup.common.restrictedPageFeatures')
    : null;
  const exportDisabledTitle = controller.state.derived.canExport
    ? null
    : (restrictedPageFeaturesTitle ?? controller.state.derived.exportDisabledReason);
  const footerProps = getExportFooterProps({
    activeTabCapabilities,
    pageAccess,
    controller,
    exportDisabledTitle,
    onRequestExport: () => {
      if (controller.state.preferences.includeWebCopy && !webSnapshotAvailability.enabled) {
        setWebSnapshotSetupOpen(true);
        return;
      }
      void controller.actions.handleStartExport();
    },
    onRequestWebSnapshotSave: () => {
      if (webSnapshotAvailability.enabled) {
        void controller.actions.handleSaveWebSnapshot();
        return;
      }
      setWebSnapshotSetupOpen(true);
    },
  });

  return (
    <ExportPageLayout
      controller={controller}
      footerProps={footerProps}
      onCloseWebSnapshotSetup={() => setWebSnapshotSetupOpen(false)}
      onOpenWebSnapshotSettings={() => {
        void openSettingsPage({ route: { section: 'web-snapshots' } });
      }}
      onRequestWebSnapshotSetup={() => setWebSnapshotSetupOpen(true)}
      webSnapshotEnabled={webSnapshotAvailability.enabled}
      webSnapshotSetupOpen={webSnapshotSetupOpen}
      webSnapshotStatus={webSnapshotAvailability.status}
    />
  );
}

const defaultPageAccessRuntime: PopupPageAccessRuntime = {
  disabledReason: null,
  error: null,
  handleRequest: async () => undefined,
  loading: false,
  pendingOperation: null,
  status: null,
};
