import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { formatDateTime, translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import { ImageGenerationDetails } from './generation-details';
import type { ImageEditorSession, ImageSessionState } from './session';

/** Shows session history inside the inspector without changing its session lifetime. */
export function ImageSessionHistory({
  session,
  state,
  busy,
  onBack,
}: {
  session: ImageEditorSession;
  state: ImageSessionState;
  busy: boolean;
  onBack(): void;
}) {
  const [confirm, setConfirm] = useState(false);
  const clear = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), []);
  return (
    <div ref={clear} className="space-y-3" data-ui="editor.ai.history">
      <div className="flex items-center gap-2">
        <EditorIconButton
          ref={back}
          title={translate('editor.ai.back')}
          onClick={onBack}
          className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-text-primary-strong)]"
        >
          <ArrowLeft size={16} />
        </EditorIconButton>
        <h2 className="min-w-0 flex-1 text-sm font-medium">{translate('editor.ai.history')}</h2>
        <EditorIconButton
          title={translate('editor.ai.clear')}
          data-ui="editor.ai.history.clear"
          className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-danger)]"
          disabled={busy || !state.steps.length}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} />
        </EditorIconButton>
      </div>
      {state.steps.length ? (
        <div className="space-y-3">
          {state.steps.map((step) => (
            <div
              key={step.id}
              className="space-y-2 rounded-[4px] p-1 text-xs"
              data-ui="editor.ai.history.step"
            >
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 break-words leading-[18px]">{step.context.prompt}</p>
                <time className="shrink-0 text-[var(--sniptale-color-text-secondary)] tabular-nums">
                  {formatDateTime(performance.timeOrigin + step.startedAt, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <ImageGenerationDetails step={step} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {step.variants.map((variant, i) =>
                  variant ? (
                    <button
                      key={i}
                      type="button"
                      disabled={busy}
                      aria-label={`${translate('editor.ai.variants')} ${i + 1}`}
                      aria-pressed={
                        state.selected?.stepId === step.id && state.selected.variant === i
                      }
                      className={[
                        'h-8 w-8 overflow-hidden rounded-[4px]',
                        state.selected?.stepId === step.id && state.selected.variant === i
                          ? 'bg-[var(--sniptale-color-surface-hover)]'
                          : 'hover:bg-[var(--sniptale-color-surface-hover)]',
                      ].join(' ')}
                      onClick={() => {
                        session.chooseVariant(step.id, i);
                        onBack();
                      }}
                    >
                      <img
                        src={variant.image.dataUrl}
                        alt=""
                        className="block h-8 w-8 rounded-[4px] object-cover"
                      />
                    </button>
                  ) : null
                )}
                {step.applied ? (
                  <Check
                    size={14}
                    aria-label={translate('editor.ai.applied')}
                    className="text-[var(--sniptale-color-text-secondary)]"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.historyEmpty')}
        </p>
      )}
      {confirm ? (
        <ProductConfirmDialog
          title={translate('editor.ai.clearTitle')}
          message={translate('editor.ai.clearMessage')}
          confirmText={translate('editor.ai.confirmClear')}
          cancelText={translate('editor.ai.cancel')}
          onConfirm={() => {
            session.clear();
            setConfirm(false);
          }}
          onCancel={() => {
            setConfirm(false);
            clear.current
              ?.querySelector<HTMLButtonElement>('[data-ui="editor.ai.history.clear"]')
              ?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
