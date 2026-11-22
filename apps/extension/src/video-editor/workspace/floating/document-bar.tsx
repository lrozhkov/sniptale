import { ProductInput } from '@sniptale/ui/product-form-controls';
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
        'sniptale-text-value',
      ].join(' ')}
      data-framed
    >
      <span
        aria-hidden="true"
        className={[
          'invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-pre border',
          'border-transparent pl-2 pr-8 text-[13px] leading-[18px] font-normal',
        ].join(' ')}
      >
        {projectName || ' '}
      </span>
      <ProductInput
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
        className="col-start-1 row-start-1 pe-8! text-ellipsis focus:text-clip"
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
