import { useEffect, useRef, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { exportGuideHtml } from './runtime/html-export';
import { exportGuideMarkdown } from './runtime/markdown-export';

/** UI owns only a disposable export command and cancellation; file effects have one runtime owner. */
export function GuideHtmlExport({ project, t }: { project: GuideProject; t: Translate }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'history-failed' | 'failed'>(
    'idle'
  );
  const job = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<'html' | 'markdown'>('html');
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    []
  );
  const save = async (nextFormat: 'html' | 'markdown') => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setFormat(nextFormat);
    setStatus('pending');
    try {
      const args = {
        project,
        t,
        signal: controller.signal,
      };
      const result =
        nextFormat === 'markdown'
          ? await exportGuideMarkdown(args)
          : await exportGuideHtml({
              ...args,
              theme: document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light',
            });
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
        title={t('scenario.editor.guideHtmlExport')}
        disabled={status === 'pending'}
        onClick={() => void save('html')}
      >
        <Download size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={t('scenario.editor.guideMarkdownExport')}
        disabled={status === 'pending'}
        onClick={() => void save('markdown')}
      >
        <FileText size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {status === 'pending' && (
        <ContentToolbarButton
          title={t('common.actions.cancel')}
          onClick={() => job.current?.abort()}
        >
          <X size={16} aria-hidden="true" />
        </ContentToolbarButton>
      )}
      {status !== 'idle' && (
        <span role="status">
          {t(
            status === 'pending'
              ? format === 'html'
                ? 'scenario.editor.guideHtmlPreparing'
                : 'scenario.editor.guideMarkdownPreparing'
              : status === 'saved'
                ? format === 'html'
                  ? 'scenario.editor.guideHtmlSaved'
                  : 'scenario.editor.guideMarkdownSaved'
                : status === 'history-failed'
                  ? 'scenario.editor.guideHtmlHistoryFailed'
                  : format === 'html'
                    ? 'scenario.editor.guideHtmlFailed'
                    : 'scenario.editor.guideMarkdownFailed'
          )}
        </span>
      )}
    </div>
  );
}
