import { useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';

/** Shared entry action for a card and its preview; imports through the material owner. */
export function LibraryMediaAdd(props: {
  itemId: string;
  ready?: boolean;
  compact?: boolean;
  onAddMedia: (mediaId: string) => Promise<void>;
}) {
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'pending' | 'added' | 'failed'>('idle');
  const label = translate(
    state === 'pending'
      ? 'common.states.loading'
      : state === 'added'
        ? 'videoEditor.sidebar.libraryAddedMaterials'
        : 'videoEditor.sidebar.addToTimeline'
  );
  const add = async () => {
    if (busy.current || state === 'added') return;
    busy.current = true;
    setState('pending');
    try {
      await props.onAddMedia(props.itemId);
      setState('added');
    } catch {
      setState('failed');
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <ContentToolbarButton
        className={props.compact ? '!h-7 !w-7 !p-0' : 'shrink-0 !w-auto gap-1.5 !px-2'}
        dataUi="video-editor.library.add-material"
        title={label}
        aria-label={label}
        disabled={props.ready === false || state === 'pending' || state === 'added'}
        onClick={() => void add()}
      >
        {state === 'added' ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
        {!props.compact && <span className="whitespace-nowrap text-xs">{label}</span>}
      </ContentToolbarButton>
      {state === 'failed' && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-primary)]">
          {translate('videoEditor.app.materialsImportFailed')}
        </p>
      )}
    </div>
  );
}
