import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewDeleteButtonClassName } from './controls';
import { ReviewHistoryResetChoices } from './history-reset-choices';

/** Choice, confirmation and submission share one disposable UI owner. */
export function ReviewResetControl(props: {
  busy: boolean;
  cursor: number;
  autosaveEnabled: boolean;
  onStart(): Promise<unknown>;
  onReset(): Promise<unknown>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const target = anchor?.closest('dialog') ?? anchor?.parentElement;
  const close = () => {
    if (!submitting.current) {
      setAnchor(null);
      setConfirming(false);
    }
  };
  const submit = async (action: () => Promise<unknown>) => {
    if (submitting.current || props.busy) return;
    submitting.current = true;
    setPending(true);
    try {
      if ((await action()) !== false) {
        setAnchor(null);
        setConfirming(false);
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.historyReset')}
        toolbarLabel={translate('gallery.videoReview.historyReset')}
        toolbarPriority={1}
        className={`${reviewDeleteButtonClassName} ml-2`}
        disabled={props.busy}
        onClick={(event) => (anchor ? close() : setAnchor(event.currentTarget))}
      >
        <RotateCcw size={16} aria-hidden="true" />
      </ReviewButton>
      {anchor && target && !confirming ? (
        <ReviewHistoryResetChoices
          anchor={anchor}
          target={target}
          canStart={props.cursor > 0}
          pending={pending || props.busy}
          onClose={close}
          onStart={() => void submit(props.onStart)}
          onOriginal={() => setConfirming(true)}
        />
      ) : null}
      {anchor && target && confirming
        ? createPortal(
            <div onKeyDown={(event) => event.stopPropagation()}>
              <ProductConfirmDialog
                title={translate('gallery.videoReview.resetOriginal')}
                message={
                  <>
                    {translate('gallery.videoReview.resetOriginalWarning')}
                    {!props.autosaveEnabled ? (
                      <p className="mt-2">
                        {translate('gallery.videoReview.resetOriginalLocalWarning')}
                      </p>
                    ) : null}
                  </>
                }
                confirmText={translate('gallery.videoReview.resetOriginal')}
                cancelText={translate('gallery.videoReview.resetCancel')}
                onCancel={() => {
                  if (!submitting.current) setConfirming(false);
                }}
                onConfirm={() => submit(props.onReset)}
              />
            </div>,
            target
          )
        : null}
    </>
  );
}
