import { useState } from 'react';
import { translate } from '../../../../platform/i18n/popup';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import {
  openGalleryWebSnapshotsPage,
  openWebSnapshotViewerPage,
} from '../../../../platform/navigation/extension-pages';
import { ExportFooterActions } from '../footer/actions';
import { ExportPageContent } from './content';
import { type PopupExportController, usePopupExportController } from '../controller';
import { useWebCopyResourcePreferences } from './snapshot-availability';
import type { PopupPackageDestination } from '../data-type/package-controls';
import { savePopupLastExportDestination } from '../../../../composition/persistence/capture-settings/popup-startup';

type ExportController = PopupExportController;
type ExportFooterActionsProps = Parameters<typeof ExportFooterActions>[0];

function getLibraryResultAction(controller: ExportController) {
  const { result } = controller.state.session.transfer;
  const snapshotIds = result?.kind === 'webSnapshot' ? (result.snapshotIds ?? []) : [];
  if (result?.success !== true || snapshotIds.length === 0) {
    return {};
  }

  return snapshotIds.length === 1
    ? {
        onOpenLibraryResult: () => void openWebSnapshotViewerPage(snapshotIds[0]!),
        openLibraryResultTitle: translate('popup.export.openWebSnapshot'),
      }
    : {
        onOpenLibraryResult: () => void openGalleryWebSnapshotsPage(),
        openLibraryResultTitle: translate('popup.export.openWebSnapshotsGallery'),
      };
}

function getExportFooterCallbacks(args: {
  controller: ExportController;
  onRequestExport: () => void;
  onRequestWebSnapshotSave?: (() => void) | undefined;
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
    ...getLibraryResultAction(args.controller),
    onResetExportView: () => {
      void args.controller.actions.handleResetExportView();
    },
    onStartExport: () => {
      if (args.onRequestWebSnapshotSave) {
        args.onRequestWebSnapshotSave();
      } else {
        args.onRequestExport();
      }
    },
  };
}

function getExportFooterProps(args: {
  canExport?: boolean | undefined;
  controller: ExportController;
  exportDisabledTitle: string | null;
  onRequestExport: () => void;
  onRequestWebSnapshotSave?: (() => void) | undefined;
}) {
  const { derived, session } = args.controller.state;
  const isResultReady =
    Boolean(session.transfer.result) ||
    session.transfer.progress.phase === 'cancelled' ||
    session.transfer.progress.phase === 'error';

  return {
    canExport: args.canExport ?? derived.canExport,
    canCopyJson: derived.canCopyJson,
    canCopyMarkdown: derived.canCopyMarkdown,
    copiedFormat: session.copy.copiedFormat,
    copyJsonTitle: translate('popup.export.copyJsonCurrentTabTitle'),
    copyMarkdownTitle: translate('popup.export.copyMarkdownCurrentTabTitle'),
    isExporting: derived.isExporting,
    isResultReady,
    ...getExportFooterCallbacks({
      controller: args.controller,
      onRequestExport: args.onRequestExport,
      onRequestWebSnapshotSave: args.onRequestWebSnapshotSave,
    }),
    ...(derived.canExport || args.exportDisabledTitle === null
      ? {}
      : { disabledTitle: args.exportDisabledTitle }),
  };
}

const exportPageContentSectionClassName = [
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
  [
    'bg-[color:color-mix(',
    'in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
    ' p-3',
  ].join(''),
].join(' ');

function ExportPageLayout({
  controller,
  destination,
  footerProps,
  onDestinationChange,
  webCopyResources,
}: {
  controller: ExportController;
  destination: PopupPackageDestination;
  footerProps: ExportFooterActionsProps;
  onDestinationChange: (destination: PopupPackageDestination) => void;
  webCopyResources: ReturnType<typeof useWebCopyResourcePreferences>;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <section className={exportPageContentSectionClassName}>
        <ExportPageContent
          controller={controller}
          destination={destination}
          onDestinationChange={onDestinationChange}
          webCopyResources={webCopyResources}
        />
        <div className="mt-auto shrink-0 pt-3" data-ui="popup.export.actions">
          <ExportFooterActions {...footerProps} />
        </div>
      </section>
    </div>
  );
}

export function ExportPage({
  isActive,
  activeTabCapabilities,
  initialDestination = 'export',
  pageAccess = defaultPageAccessRuntime,
}: {
  isActive: boolean;
  activeTabCapabilities: ActiveTabCapabilities;
  initialDestination?: PopupPackageDestination;
  pageAccess?: PopupPageAccessRuntime;
}) {
  const controller = usePopupExportController({
    activeTabCapabilities,
    isActive,
    pageAccess,
  });
  const webCopyResources = useWebCopyResourcePreferences();
  const [destination, setDestination] = useState<PopupPackageDestination>(initialDestination);
  const restrictedPageFeaturesTitle = activeTabCapabilities.isRestrictedPage
    ? translate('popup.common.restrictedPageFeatures')
    : null;
  const canExport =
    destination === 'save'
      ? controller.state.preferences.hasLoadedPreferences &&
        controller.state.tabs.selectedCount > 0 &&
        controller.state.derived.exportDisabledReason === null &&
        !controller.state.derived.isExporting
      : controller.state.derived.canExport;
  const exportDisabledTitle = canExport
    ? null
    : (restrictedPageFeaturesTitle ?? controller.state.derived.exportDisabledReason);
  const footerProps = getExportFooterProps({
    canExport,
    controller,
    exportDisabledTitle,
    onRequestExport: () => void controller.actions.handleStartExport(),
    ...(destination === 'save'
      ? { onRequestWebSnapshotSave: () => void controller.actions.handleSaveWebSnapshot() }
      : {}),
  });

  return (
    <ExportPageLayout
      controller={controller}
      destination={destination}
      footerProps={footerProps}
      onDestinationChange={(nextDestination) => {
        setDestination(nextDestination);
        void savePopupLastExportDestination(nextDestination);
      }}
      webCopyResources={webCopyResources}
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
