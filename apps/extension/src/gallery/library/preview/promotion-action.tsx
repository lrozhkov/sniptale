import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../platform/i18n';

type PromotionActionProps = {
  className: string;
  onPromote?: () => Promise<void>;
  savesOriginal?: boolean;
  visible: boolean;
};

export function PromotionAction({
  className,
  onPromote,
  savesOriginal,
  visible,
}: PromotionActionProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'multiple-editors'>('idle');

  if (!visible || !onPromote) {
    return null;
  }
  const label = translate(
    savesOriginal ? 'gallery.preview.saveInOriginals' : 'gallery.preview.saveToLibrary'
  );

  return (
    <>
      <ProductActionButton
        compact
        tone="secondary"
        data-command-chrome="true"
        type="button"
        title={label}
        aria-label={label}
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
        <span className="sr-only">{label}</span>
      </ProductActionButton>
      {state === 'error' ? (
        <p role="alert" className="col-span-full text-xs text-[var(--sniptale-color-danger)]">
          {translate(
            savesOriginal
              ? 'gallery.preview.saveInOriginalsError'
              : 'gallery.preview.saveToLibraryError'
          )}
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
