import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewDeleteButtonClassName } from './controls';

/** Confirmation stays inside the editor's native modal and owns shortcut isolation. */
export function ReviewResetControl(props: { busy: boolean; onReset(): Promise<unknown> }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const submitting = useRef(false);
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.resetOriginal')}
        toolbarLabel={translate('gallery.videoReview.resetOriginal')}
        toolbarPriority={1}
        className={`${reviewDeleteButtonClassName} ml-2`}
        disabled={props.busy}
        onClick={(event) =>
          setTarget(event.currentTarget.closest('dialog') ?? event.currentTarget.parentElement)
        }
      >
        <RotateCcw size={16} aria-hidden="true" />
      </ReviewButton>
      {target
        ? createPortal(
            <div onKeyDown={(event) => event.stopPropagation()}>
              <ProductConfirmDialog
                title={translate('gallery.videoReview.resetOriginal')}
                message={translate('gallery.videoReview.resetOriginalWarning')}
                confirmText={translate('gallery.videoReview.resetOriginal')}
                cancelText={translate('gallery.videoReview.resetCancel')}
                onCancel={() => {
                  if (!submitting.current) setTarget(null);
                }}
                onConfirm={async () => {
                  if (submitting.current || props.busy) return;
                  submitting.current = true;
                  try {
                    await props.onReset();
                  } finally {
                    submitting.current = false;
                    setTarget(null);
                  }
                }}
              />
            </div>,
            target
          )
        : null}
    </>
  );
}
