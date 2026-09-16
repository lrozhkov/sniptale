import { useEffect, useRef, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import type { Ref } from 'react';
import { exportGuideMarkdown } from './runtime/markdown-export';

/** UI owns only a disposable export command and cancellation; file effects have one runtime owner. */
export function GuideHtmlExport({
  project,
  t,
  onOpenHtml,
  htmlRef,
}: {
  project: GuideProject;
  t: Translate;
  onOpenHtml: () => void;
  htmlRef?: Ref<HTMLButtonElement>;
}) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'history-failed' | 'failed'>(
    'idle'
  );
  const job = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    []
  );
  const save = async () => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setStatus('pending');
    try {
      const args = {
        project,
        t,
        signal: controller.signal,
      };
      const result = await exportGuideMarkdown(args);
      if (job.current === controller) setStatus(result);
    } catch (error) {
      if (job.current === controller)
        setStatus(
          controller.signal.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
            ? 'idle'
            : 'failed'
        );
    } finally {
      if (job.current === controller) job.current = null;
    }
  };
  return (
    <div className="guide-html-export">
      <ContentToolbarButton
        className="guide-labeled-action"
        title={t('scenario.editor.guideHtmlExport')}
        disabled={status === 'pending'}
        ref={htmlRef}
        onClick={onOpenHtml}
      >
        <Download size={16} aria-hidden="true" />
        <span>{t('scenario.editor.guideHtmlFormat')}</span>
      </ContentToolbarButton>
      <ContentToolbarButton
        className="guide-labeled-action"
        title={t('scenario.editor.guideMarkdownExport')}
        disabled={status === 'pending'}
        onClick={() => void save()}
      >
        <FileText size={16} aria-hidden="true" />
        <span>{t('scenario.editor.guideMarkdownFormat')}</span>
      </ContentToolbarButton>
      {status === 'pending' && (
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('common.actions.cancel')}
          onClick={() => job.current?.abort()}
        >
          <X size={16} aria-hidden="true" />
          <span>{t('common.actions.cancel')}</span>
        </ContentToolbarButton>
      )}
      {status !== 'idle' && (
        <span role="status">
          {t(
            status === 'pending'
              ? 'scenario.editor.guideMarkdownPreparing'
              : status === 'saved'
                ? 'scenario.editor.guideMarkdownSaved'
                : status === 'history-failed'
                  ? 'scenario.editor.guideHtmlHistoryFailed'
                  : 'scenario.editor.guideMarkdownFailed'
          )}
        </span>
      )}
    </div>
  );
}
