import { useEffect } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { TextRewriteSettings } from '../../../../../ui/video-text/rewrite/settings';
import { TextRewriteProposal } from '../../../../../ui/video-text/rewrite/proposal';
import {
  TextRewriteButton,
  TextRewriteDetails,
} from '../../../../../ui/video-text/rewrite/controls';
import { translate } from '../../../../../platform/i18n';
import type { VideoProjectTextRewriteController } from '../../../../runtime/session/text-rewrite';

/** Montage supplies its target and command lifetime; both editors share settings and proposal views. */
export function ProjectTextRewritePanel(props: {
  project: VideoProject;
  operation: VideoProjectTextRewriteController;
  scopeLabel: string;
  onClose(): void;
}) {
  const { operation } = props;
  const { loadModels } = operation;
  useEffect(() => {
    void loadModels();
  }, [loadModels]);
  const target = operation.target;
  if (!target) return null;
  const context = operation.preview?.basis.context ?? operation.disclosure?.basis.context;
  const error = operation.error ?? (operation.preview ? null : operation.disclosureError);
  return (
    <section
      data-ui="video-editor.text-rewrite.panel"
      className="min-w-0 sniptale-parameter-stack"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <TextRewriteButton
          autoFocus
          label={translate('gallery.videoReview.textVoiceBack')}
          disabled={operation.running}
          onClick={props.onClose}
        >
          <ArrowLeft size={14} aria-hidden="true" />
        </TextRewriteButton>
        <span className="text-xs font-medium">
          {translate('gallery.videoReview.textRewriteTitle')}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 break-words text-[var(--sniptale-color-text-muted)]">
          {props.scopeLabel}
        </span>
        <span>
          {translate(
            target.wholeDocument
              ? 'gallery.videoReview.textRewriteAllScope'
              : 'gallery.videoReview.textRewriteSelectedScope'
          ).replace('{count}', String(target.ids.length))}
        </span>
      </div>
      <TextRewriteSettings
        options={operation.options}
        catalog={operation.catalog}
        modelId={operation.modelId}
        locked={operation.running || !!operation.preview}
        wholeDocument={target.wholeDocument}
        windowFallback={context?.window}
        resultDuration={operation.resultDuration}
        catalogError={operation.catalogError}
        selectionPending={operation.selectionPending}
        selectionUnavailable={operation.selectionUnavailable}
        selectionFailed={operation.selectionFailed}
        onOptionsChange={(change) => operation.setOptions((value) => ({ ...value, ...change }))}
        onModelChange={operation.setModelId}
        onReloadModels={operation.loadModels}
      />
      <RewriteDisclosure {...props} />
      {error ? (
        <p role="alert" className="text-xs">
          {rewriteErrorLabel(error)}
        </p>
      ) : null}
      <RewriteRequestStatus operation={operation} />
      {operation.preview?.receipt && !operation.accepted ? (
        <p className="text-xs">{translate('videoEditor.sidebar.recognitionSaveRetry')}</p>
      ) : null}
      {operation.preview?.proposal ? (
        <TextRewriteProposal
          context={operation.preview.basis.context}
          proposal={operation.preview.proposal}
          running={operation.running}
          accepted={operation.accepted}
          receiptMode={operation.preview.receipt?.mode}
          onEdit={operation.edit}
          onApply={operation.apply}
          onDiscard={operation.discard}
        />
      ) : null}
    </section>
  );
}

function RewriteDisclosure({
  project,
  operation,
}: {
  project: VideoProject;
  operation: VideoProjectTextRewriteController;
}) {
  const entry = project.textDocuments?.find(
    (document) => document.id === operation.target?.documentId
  );
  const binding = operation.preview?.basis.binding ?? entry?.binding;
  const context = operation.preview?.basis.context ?? operation.disclosure?.basis.context;
  const model = operation.catalog?.models.find((model) => model.id === operation.modelId);
  const provider = operation.catalog?.providers.find(
    (provider) => provider.id === model?.providerId
  );
  return (
    <>
      {provider ? (
        <p className="break-words text-xs">
          {translate('gallery.videoReview.textRewriteDestination').replace(
            '{provider}',
            provider.name
          )}
        </p>
      ) : null}
      <p className="text-xs">{translate('gallery.videoReview.textRewriteDisclosure')}</p>
      <p className="text-xs">{translate('videoEditor.sidebar.textRewriteSaveDisclosure')}</p>
      {binding?.kind === 'source' && operation.options.changeIntervals ? (
        <p className="text-xs">{translate('videoEditor.sidebar.textRewriteProjectTiming')}</p>
      ) : null}
      {binding || context ? (
        <TextRewriteDetails
          label={translate('videoEditor.sidebar.textRewriteScopeDetails')}
          preferenceId="project-text-rewrite-outbound"
          variant="information"
        >
          {binding ? (
            <p className="text-xs">
              {translate(
                binding.kind === 'source'
                  ? 'videoEditor.sidebar.textRewriteSourceScope'
                  : 'videoEditor.sidebar.textRewriteProjectScope'
              )}
            </p>
          ) : null}
          {context?.fragments.some((fragment) => fragment.ranges && fragment.ranges.length > 1) ? (
            <p className="text-xs">{translate('videoEditor.sidebar.textRewritePlacements')}</p>
          ) : null}
          {context ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(context, null, 2)}
            </pre>
          ) : null}
        </TextRewriteDetails>
      ) : null}
    </>
  );
}

function RewriteRequestStatus({ operation }: { operation: VideoProjectTextRewriteController }) {
  if (operation.running)
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        {translate('gallery.videoReview.textRewriteWaiting').replace(
          '{seconds}',
          String(operation.elapsed)
        )}
        {!operation.applying ? (
          <TextRewriteButton
            label={translate('common.actions.cancel')}
            onClick={operation.cancel}
          />
        ) : null}
      </div>
    );
  if (operation.preview) return null;
  return (
    <TextRewriteButton
      label={translate('gallery.videoReview.textRewriteStart')}
      disabled={!operation.disclosure || !operation.modelId || operation.selectionPending}
      onClick={operation.start}
    />
  );
}

function rewriteErrorLabel(code: string) {
  switch (code) {
    case 'stale':
      return translate('videoEditor.sidebar.textRewriteStale');
    case 'too-large':
      return translate('gallery.videoReview.textRewriteBudget');
    case 'invalid':
    case 'invalid-request':
    case 'invalid-response':
      return translate('gallery.videoReview.textRewriteInvalid');
    case 'model-unavailable':
      return translate('gallery.videoReview.speechMissingModel');
    default:
      return translate('videoEditor.sidebar.recognitionFailed');
  }
}
