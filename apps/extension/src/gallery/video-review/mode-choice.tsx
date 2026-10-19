import { ArrowLeft, ArrowRight, Layers, Scissors } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import { translate } from '../../platform/i18n';

type EditingMode = 'basic' | 'advanced';

function ModeChoiceButton({
  mode,
  onSelect,
}: {
  mode: EditingMode;
  onSelect(mode: EditingMode): void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const press = useCommandPress({
    onClick: () => {
      button.current?.closest('dialog')?.focus({ preventScroll: true });
      onSelect(mode);
    },
  });
  useEffect(() => {
    if (mode === 'basic') button.current?.focus({ preventScroll: true });
  }, [mode]);
  const Icon = mode === 'basic' ? Scissors : Layers;
  return (
    <button
      ref={button}
      type="button"
      {...press.props}
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
      data-ui={`gallery.videoReview.modeChoice.${mode}`}
      aria-labelledby={`review-mode-${mode}-title`}
      aria-describedby={`review-mode-${mode}-description`}
      className="group flex min-h-52 min-w-0 flex-col items-start gap-4 rounded-[var(--sniptale-radius-lg)]
        border border-[var(--sniptale-color-border-soft)] bg-transparent p-5 text-left
        text-[var(--sniptale-color-text-primary)] outline-none
        hover:bg-[var(--sniptale-color-surface-hover)]
        focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]"
    >
      <span className="flex w-full items-center gap-3">
        <Icon
          size={22}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
        />
        <span id={`review-mode-${mode}-title`} className="flex-1 text-base font-medium">
          {translate(
            mode === 'basic'
              ? 'gallery.videoReview.modeChoiceBasic'
              : 'gallery.videoReview.advancedEditing'
          )}
        </span>
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
        />
      </span>
      <span
        id={`review-mode-${mode}-description`}
        className="text-sm leading-relaxed text-[var(--sniptale-color-text-secondary)]"
      >
        {translate(
          mode === 'basic'
            ? 'gallery.videoReview.modeChoiceBasicDescription'
            : 'gallery.videoReview.modeChoiceAdvancedDescription'
        )}
      </span>
    </button>
  );
}

export function ReviewModeChoice({
  filename,
  onSelect,
  onBack,
}: {
  filename: string;
  onSelect(mode: EditingMode): void;
  onBack(): void;
}) {
  return (
    <section
      data-ui="gallery.videoReview.modeChoice"
      aria-labelledby="review-mode-choice-title"
      className="flex h-full min-h-0 flex-col select-none"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--sniptale-color-border-soft)] p-3">
        <ContentToolbarButton
          tone="utility"
          size="compact"
          title={translate('gallery.videoReview.back')}
          aria-label={translate('gallery.videoReview.back')}
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </ContentToolbarButton>
        <span
          title={filename}
          className="min-w-0 truncate text-sm text-[var(--sniptale-color-text-secondary)]"
        >
          {filename}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
        <div className="m-auto w-full max-w-3xl py-4">
          <h1 id="review-mode-choice-title" className="mb-6 text-2xl font-medium">
            {translate('gallery.videoReview.modeChoiceTitle')}
          </h1>
          <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2">
            <ModeChoiceButton mode="basic" onSelect={onSelect} />
            <ModeChoiceButton mode="advanced" onSelect={onSelect} />
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.videoReview.modeChoiceSwitchHint')}
          </p>
        </div>
      </div>
    </section>
  );
}
