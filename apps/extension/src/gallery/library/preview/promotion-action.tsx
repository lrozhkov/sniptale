import { useState } from 'react';
import { translate } from '../../../platform/i18n';

type PromotionActionProps = {
  className: string;
  onPromote?: () => Promise<void>;
  visible: boolean;
};

export function PromotionAction({ className, onPromote, visible }: PromotionActionProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'multiple-editors'>('idle');

  if (!visible || !onPromote) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        disabled={state === 'saving'}
        onClick={async () => {
          setState('saving');
          try {
            await onPromote();
            setState('idle');
          } catch (error) {
            setState(
              error instanceof Error && error.message.includes('multiple editor tabs')
                ? 'multiple-editors'
                : 'error'
            );
          }
        }}
        className={className}
      >
        {translate('gallery.preview.saveToLibrary')}
      </button>
      {state === 'error' ? (
        <p role="alert">{translate('gallery.preview.saveToLibraryError')}</p>
      ) : null}
      {state === 'multiple-editors' ? (
        <p role="alert">{translate('gallery.preview.saveToLibraryMultipleEditors')}</p>
      ) : null}
    </>
  );
}
