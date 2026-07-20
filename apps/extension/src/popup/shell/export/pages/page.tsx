import { translate } from '../../../../platform/i18n';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import {
  openGalleryWebSnapshotsPage,
  openWebSnapshotViewerPage,
} from '../../../../platform/navigation/extension-pages';
import { ExportFooterActions } from '../footer/actions';
import { ExportPageContent } from './content';
import { type PopupExportController, usePopupExportController } from '../controller';
import { IDLE_PROGRESS } from '../selection/utils';
import { WebSnapshotConfirmationDialog, type WebSnapshotDisclosure } from './snapshot-confirmation';
import { useWebSnapshotConfirmationState } from './snapshot-confirmation-state';

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
  webSnapshotDisclosure: WebSnapshotDisclosure;
  onRequestWebSnapshotConfirmation: () => void;
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
      args.controller.state.session.actions.setProgress(IDLE_PROGRESS);
      args.controller.state.session.actions.setResult(null);
    },
    onSaveWebSnapshot: () => {
      if (args.webSnapshotDisclosure.requiresConfirmation) {
        args.onRequestWebSnapshotConfirmation();
        return;
      }
      void args.controller.actions.handleSaveWebSnapshot();
    },
    onStartExport: () => {
      void args.controller.actions.handleStartExport();
    },
  };
}

function getExportFooterProps(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccess: PopupPageAccessRuntime;
  controller: ExportController;
  exportDisabledTitle: string | null;
  onRequestWebSnapshotConfirmation: () => void;
  webSnapshotDisclosure: WebSnapshotDisclosure;
}) {
  const { derived, session } = args.controller.state;
  const isResultReady =
    Boolean(session.transfer.result) || session.transfer.progress.phase === 'error';

  return {
    canExport: derived.canExport,
    canCopyJson: derived.canCopyJson,
    canCopyMarkdown: derived.canCopyMarkdown,
    canSaveWebSnapshot:
      !args.activeTabCapabilities.export.reason &&
      !args.pageAccess.disabledReason &&
      !derived.isExporting,
    copiedFormat: session.copy.copiedFormat,
    copyJsonTitle: translate('popup.export.copyJsonCurrentTabTitle'),
    copyMarkdownTitle: translate('popup.export.copyMarkdownCurrentTabTitle'),
    isExporting: derived.isExporting,
    isSavingWebSnapshot:
      session.transfer.progress.message === translate('popup.export.webSnapshotSaving'),
    isResultReady,
    ...getExportFooterCallbacks({
      controller: args.controller,
      onRequestWebSnapshotConfirmation: args.onRequestWebSnapshotConfirmation,
      webSnapshotDisclosure: args.webSnapshotDisclosure,
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
    ' p-3 pr-2',
  ].join(''),
].join(' ');

function ExportPageLayout({
  controller,
  footerProps,
  onCancelWebSnapshotConfirmation,
  onConfirmWebSnapshotConfirmation,
  onRememberWebSnapshotChoiceChange,
  preferenceError,
  rememberWebSnapshotChoice,
  savingPreference,
  webSnapshotConfirmation,
}: {
  controller: ExportController;
  footerProps: ExportFooterActionsProps;
  onCancelWebSnapshotConfirmation: () => void;
  onConfirmWebSnapshotConfirmation: () => void;
  onRememberWebSnapshotChoiceChange: (rememberChoice: boolean) => void;
  preferenceError: string | null;
  rememberWebSnapshotChoice: boolean;
  savingPreference: boolean;
  webSnapshotConfirmation: WebSnapshotDisclosure | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <section className={exportPageContentSectionClassName}>
        <ExportPageContent controller={controller} />
      </section>

      <ExportFooterActions {...footerProps} />
      {webSnapshotConfirmation ? (
        <WebSnapshotConfirmationDialog
          disclosure={webSnapshotConfirmation}
          isSavingPreference={savingPreference}
          onCancel={onCancelWebSnapshotConfirmation}
          onConfirm={onConfirmWebSnapshotConfirmation}
          onRememberChoiceChange={onRememberWebSnapshotChoiceChange}
          preferenceError={preferenceError}
          rememberChoice={rememberWebSnapshotChoice}
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
  const webSnapshotConfirmation = useWebSnapshotConfirmationState(controller);
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
    onRequestWebSnapshotConfirmation: webSnapshotConfirmation.requestConfirmation,
    webSnapshotDisclosure: webSnapshotConfirmation.disclosure,
  });

  return (
    <ExportPageLayout
      controller={controller}
      footerProps={footerProps}
      onCancelWebSnapshotConfirmation={webSnapshotConfirmation.cancelConfirmation}
      onConfirmWebSnapshotConfirmation={webSnapshotConfirmation.confirm}
      onRememberWebSnapshotChoiceChange={webSnapshotConfirmation.setRememberChoice}
      preferenceError={webSnapshotConfirmation.preferenceError}
      rememberWebSnapshotChoice={webSnapshotConfirmation.rememberChoice}
      savingPreference={webSnapshotConfirmation.preferenceSaving}
      webSnapshotConfirmation={webSnapshotConfirmation.confirmation}
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
