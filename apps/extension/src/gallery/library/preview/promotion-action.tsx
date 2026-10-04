import { Save } from 'lucide-react';
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
        title={translate('gallery.preview.saveToLibrary')}
        aria-label={translate('gallery.preview.saveToLibrary')}
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
        <Save className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{translate('gallery.preview.saveToLibrary')}</span>
      </button>
      {state === 'error' ? (
        <p role="alert" className="col-span-full text-xs text-[var(--sniptale-color-danger)]">
          {translate('gallery.preview.saveToLibraryError')}
        </p>
      ) : null}
      {state === 'multiple-editors' ? (
        <p role="alert" className="col-span-full text-xs text-[var(--sniptale-color-danger)]">
          {translate('gallery.preview.saveToLibraryMultipleEditors')}
        </p>
      ) : null}
    </>
  );
}
