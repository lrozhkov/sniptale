import { useEffect, useRef, type ReactNode } from 'react';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { translate } from '../../../platform/i18n';
import {
  useVideoEditorHeaderController,
  useVideoEditorHistoryController,
} from '../../runtime/controller/composition/hooks';
import type { VideoEditorHeaderController } from '../../runtime/controller/contracts/header';
import { useVideoEditorHistoryPort } from '../../runtime/controller/store';
import type { VideoEditorProjectHistoryTransactionLease } from '../../contracts/commands/history';

const DOCUMENT_BAR_CLASS_NAME = 'flex min-w-0 flex-1 items-center justify-start gap-2';

const PROJECT_TITLE_CLASS_NAME = [
  'h-8 min-w-0 w-full rounded-[4px] border border-transparent bg-transparent',
  'pl-2 pr-8 text-left text-[13px] leading-[18px] font-medium',
  'text-[var(--sniptale-color-text-primary)] outline-none transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
  'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_70%,transparent)]',
].join(' ');

type VideoEditorDocumentBarProps = {
  header: VideoEditorHeaderController;
  history: ReturnType<typeof useVideoEditorHistoryController>;
};

function VideoEditorProjectTitle({
  onRenameProject,
  projectName,
}: Pick<VideoEditorDocumentBarProps['header'], 'onRenameProject' | 'projectName'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lease = useRef<VideoEditorProjectHistoryTransactionLease | null>(null);
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
    current: port.isProjectHistoryTransactionCurrent,
  }));
  const endHistory = history.end;
  useEffect(
    () => () => {
      const current = lease.current;
      lease.current = null;
      if (current) endHistory(current);
    },
    [endHistory]
  );
  const finish = (outcome?: 'cancel') => {
    const current = lease.current;
    lease.current = null;
    if (current) history.end(current, outcome);
  };
  return (
    <label
      className={[
        'relative grid min-w-[6rem] max-w-full shrink items-center',
        'focus-within:flex-1',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-pre border',
          'border-transparent pl-2 pr-8 text-[13px] leading-[18px] font-medium',
        ].join(' ')}
      >
        {projectName || ' '}
      </span>
      <input
        ref={inputRef}
        aria-label={translate('videoEditor.app.title')}
        value={projectName}
        onChange={(event) => {
          if (lease.current && !history.current(lease.current)) lease.current = null;
          lease.current ??= history.begin({ onlyIfIdle: true });
          if (lease.current) onRenameProject(event.currentTarget.value);
        }}
        onBlur={() => finish()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.preventDefault();
          if (event.key === 'Escape') finish('cancel');
          event.currentTarget.blur();
        }}
        className={`${PROJECT_TITLE_CLASS_NAME} col-start-1 row-start-1 text-ellipsis focus:text-clip`}
      />
      {projectName ? (
        <InspectorFieldClear label={translate('videoEditor.app.title')} target={inputRef} />
      ) : null}
    </label>
  );
}

export function VideoEditorFloatingDocumentBar({ children }: { children?: ReactNode } = {}) {
  const header = useVideoEditorHeaderController();
  const history = useVideoEditorHistoryController();
  if (!header) return null;
  return (
    <div data-ui="video-editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      {children}
      {!children && (
        <VideoEditorProjectTitle
          projectName={header.projectName}
          onRenameProject={header.onRenameProject}
        />
      )}
      {history.error && (
        <span role="alert">
          <ValueBadge className="text-[var(--sniptale-color-danger)]">
            {translate('videoEditor.app.historyError')}
          </ValueBadge>
        </span>
      )}
    </div>
  );
}
