import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createNeutralPresentationSettings,
  parseQuickEditPresentationSettings,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import type { ReviewOperation } from '../../features/video/review/types';
import { createReviewPresentationAttachment } from '../../workflows/video-review/presentation-attachment';
import { ReviewPresentationAdmissionError } from '../../workflows/video-review/presentation-admission';
import { StaticLogoError } from '../../workflows/background-images/static-logo';
import { translate } from '../../platform/i18n';
import {
  admitPresentationSelection,
  attachedPresentationSettings,
  type ReviewPresentationPicker as Picker,
  type ReviewPresentationSelection as Selection,
} from './presentation-selection';

type Settings = QuickEditPresentationSettings;
type SlotName = 'intro' | 'outro';
type Session = {
  getSnapshot(): {
    document: { advancedContent: QuickEditAdvancedContent };
    snapshot: { workspace: { aggregateId: string } };
  };
  commitDurable(operation: ReviewOperation): Promise<unknown>;
  reload(): Promise<unknown>;
};
type Arguments = {
  session: Session;
  settings: Settings | undefined;
  flushAdvanced(): Promise<void>;
  allowed(): boolean;
  pause(): void;
};
type Retry =
  | { kind: 'settings'; settings: Settings | undefined }
  | { kind: 'selection'; selection: Selection };
type View = {
  draft: Settings | null;
  modes: Partial<Record<SlotName, Settings[SlotName]['mode']>>;
  picker: Picker | null;
  pending: boolean;
  error: string | null;
  audioUnsupported: boolean;
  canRetry: boolean;
};
const emptyView = (): View => ({
  draft: null,
  modes: {},
  picker: null,
  pending: false,
  error: null,
  audioUnsupported: false,
  canRetry: false,
});

/** React binding for one session's disposable gestures, selection and retained attachment lifetime. */
export function useReviewPresentation(args: Arguments) {
  const current = useRef(args);
  current.current = args;
  const controller = useMemo(
    () => new PresentationController(args.session, () => current.current),
    [args.session]
  );
  const neutral = useMemo(createNeutralPresentationSettings, []);
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => controller.restore(args.settings), [controller, args.settings]);
  return {
    settings: view.draft ?? args.settings ?? neutral,
    slotModes: {
      intro: view.modes.intro ?? args.settings?.intro.mode ?? 'none',
      outro: view.modes.outro ?? args.settings?.outro.mode ?? 'none',
    },
    picker: view.picker,
    pending: view.pending,
    error: view.error,
    canRetry: view.canRetry,
    audioUnsupported: view.audioUnsupported,
    preview: (value: Settings | null) => controller.preview(value),
    change: (value: Settings | undefined) => controller.change(value),
    reset: () => controller.change(undefined),
    mode: (slot: SlotName, mode: Settings[SlotName]['mode']) => controller.mode(slot, mode),
    choose: (slot: SlotName, kind: Picker['kind'], source: Picker['source']) =>
      controller.choose(slot, kind, source),
    selectComputer: (request: Picker, file: File) =>
      request.source === 'computer' ? controller.select(request, { file }) : Promise.resolve(false),
    selectLibrary: (request: Picker, mediaId: string) =>
      request.source === 'library'
        ? controller.select(request, { mediaId })
        : Promise.resolve(false),
    retry: () => controller.retry(),
    retryMuted: () => controller.retryMuted(),
    cancel: () => controller.cancel(),
  };
}

class PresentationController {
  private lifetime = new AbortController();
  private active: AbortController | null = null;
  private retained: {
    attachment: ReturnType<typeof createReviewPresentationAttachment>;
    attempt: { signal: AbortSignal };
  } | null = null;
  private retryRequest: Retry | null = null;
  private view = emptyView();
  private previousSettings: Settings | undefined;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly session: Session,
    private readonly current: () => Arguments
  ) {
    this.previousSettings = current().settings;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  activate() {
    // StrictMode repeats setup after cleanup; old attempts keep their aborted combined signal.
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
    this.update(emptyView());
  }
  dispose() {
    this.lifetime.abort();
  }
  restore(settings: Settings | undefined) {
    const modes = { ...this.view.modes };
    for (const slot of ['intro', 'outro'] as const)
      if (this.previousSettings?.[slot].mode !== settings?.[slot].mode) delete modes[slot];
    this.previousSettings = settings;
    this.update({ draft: null, modes });
  }
  private live() {
    return this.current().session === this.session && !this.lifetime.signal.aborted;
  }
  private available() {
    return this.live() && !this.active && this.current().allowed();
  }
  private hasRetained() {
    return this.retained?.attachment.hasRetainedAsset() ?? false;
  }
  private update(patch: Partial<View>) {
    if (!this.live()) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private assert(signal: AbortSignal) {
    signal.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    if (this.current().session !== this.session) throw new Error('Presentation session changed.');
  }
  private authored() {
    return parseQuickEditPresentationSettings(
      this.session.getSnapshot().document.advancedContent.presentation
    )!;
  }
  private assertAuthored(initial: Settings) {
    if (JSON.stringify(initial) !== JSON.stringify(this.authored()))
      throw new Error('Presentation selection changed.');
  }
  private async save(settings: Settings | undefined, signal: AbortSignal) {
    this.assert(signal);
    const initial = this.authored();
    await this.current().flushAdvanced();
    this.assert(signal);
    this.assertAuthored(initial);
    const before = this.session.getSnapshot().document.advancedContent;
    const previous =
      before.presentation === undefined
        ? undefined
        : parseQuickEditPresentationSettings(before.presentation);
    if (JSON.stringify(previous) === JSON.stringify(settings)) return;
    const { presentation: _previous, ...rest } = before;
    const after = settings ? { ...rest, presentation: settings } : rest;
    try {
      await this.session.commitDurable({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'advancedContent',
        before,
        after,
      });
    } catch (failure) {
      // A rejected response may follow a durable commit; reload before an explicit retry.
      if (this.live() && !signal.aborted) await this.session.reload().catch(() => undefined);
      throw failure;
    }
    this.assert(signal);
  }
  private async run(action: (signal: AbortSignal) => Promise<void>, retry: Retry) {
    if (!this.available()) return false;
    const attempt = new AbortController();
    this.active = attempt;
    this.retryRequest = retry;
    const signal = AbortSignal.any([this.lifetime.signal, attempt.signal]);
    this.update({ pending: true, error: null, audioUnsupported: false });
    this.current().pause();
    try {
      this.assert(signal);
      await action(signal);
      this.assert(signal);
      this.retryRequest = null;
      this.update({ picker: null, draft: null, canRetry: false });
      return true;
    } catch (failure) {
      if (!signal.aborted)
        this.update({
          error: failureMessage(failure, retry.kind),
          audioUnsupported:
            failure instanceof ReviewPresentationAdmissionError && failure.code === 'audio-decoder',
          canRetry: true,
        });
      return false;
    } finally {
      if (this.active === attempt) this.active = null;
      if (signal.aborted) {
        const retained = this.hasRetained();
        if (!retained) {
          this.retained = null;
          this.retryRequest = null;
        }
        this.update({ canRetry: retained });
      }
      this.update({ pending: false });
    }
  }
  change(value: Settings | undefined) {
    const parsed = value === undefined ? undefined : parseQuickEditPresentationSettings(value);
    if (parsed === null || this.hasRetained()) return Promise.resolve(false);
    return this.run((signal) => this.save(parsed, signal), { kind: 'settings', settings: parsed });
  }
  preview(value: Settings | null) {
    if (!this.available() || this.hasRetained()) return;
    const parsed = value === null ? null : parseQuickEditPresentationSettings(value);
    if (value !== null && !parsed) return;
    this.current().pause();
    this.update({ draft: parsed });
  }
  async mode(slot: SlotName, mode: Settings[SlotName]['mode']) {
    if (!this.available() || this.hasRetained()) return false;
    if (this.view.picker?.slot === slot) this.update({ picker: null });
    const settings = parseQuickEditPresentationSettings(this.current().settings)!;
    const next = parseQuickEditPresentationSettings({
      ...settings,
      [slot]: { ...settings[slot], mode },
    });
    if (!next) {
      this.update({ modes: { ...this.view.modes, [slot]: mode } });
      return true;
    }
    const saved = await this.change(next);
    if (saved) this.update({ modes: { ...this.view.modes, [slot]: mode } });
    return saved;
  }
  choose(slot: SlotName, kind: Picker['kind'], source: Picker['source']) {
    if (!this.available() || this.hasRetained()) return;
    this.retained = null;
    this.retryRequest = null;
    this.update({
      picker: { slot, kind, source },
      modes: kind === 'media' ? this.view.modes : { ...this.view.modes, [slot]: kind },
      error: null,
      canRetry: false,
      audioUnsupported: false,
    });
  }
  select(request: Picker, input: Selection['input']) {
    if (request !== this.view.picker || !this.available() || this.hasRetained())
      return Promise.resolve(false);
    this.retained = null;
    return this.acquire({ picker: request, input, muted: false });
  }
  private acquire(selection: Selection) {
    return this.run(
      async (signal) => {
        if (!this.retained) await this.prepare(selection, signal);
        const operation = this.retained!;
        operation.attempt.signal = signal;
        await operation.attachment.run();
        this.assert(signal);
        this.retained = null;
        this.update({
          modes: {},
        });
      },
      { kind: 'selection', selection }
    );
  }
  private async prepare(selection: Selection, signal: AbortSignal) {
    const initial = this.authored();
    const admitted = await admitPresentationSelection(selection, signal);
    this.assert(signal);
    this.assertAuthored(initial);
    const attempt = { signal };
    const attachment = createReviewPresentationAttachment({
      aggregateId: this.session.getSnapshot().snapshot.workspace.aggregateId,
      slot: selection.picker.slot,
      kind: admitted.media.kind,
      acquisition: admitted.acquisition,
      signal: this.lifetime.signal,
      assertCurrentTarget: () => this.assert(attempt.signal),
      attach: (assetId) => {
        this.assertAuthored(initial);
        return this.save(
          attachedPresentationSettings(initial, selection.picker.slot, admitted.media, assetId),
          attempt.signal
        );
      },
    });
    this.retained = { attachment, attempt };
  }
  retry() {
    if (!this.available() || !this.retryRequest) return Promise.resolve(false);
    return this.retryRequest.kind === 'settings'
      ? this.change(this.retryRequest.settings)
      : this.acquire(this.retryRequest.selection);
  }
  retryMuted() {
    if (
      !this.available() ||
      !this.view.audioUnsupported ||
      this.retryRequest?.kind !== 'selection' ||
      this.hasRetained()
    )
      return Promise.resolve(false);
    return this.acquire({ ...this.retryRequest.selection, muted: true });
  }
  cancel() {
    if (!this.live()) return;
    this.active?.abort();
    // Preparation may acquire a retained resource after cancellation; inspect only when settled.
    if (!this.active && !this.hasRetained()) {
      this.retained = null;
      this.retryRequest = null;
    }
    this.update({
      picker: null,
      draft: null,
      modes: {},
      error: null,
      audioUnsupported: false,
      canRetry: this.hasRetained(),
    });
  }
}

function failureMessage(failure: unknown, action: Retry['kind']) {
  if (failure instanceof ReviewPresentationAdmissionError && failure.code === 'audio-decoder')
    return translate('gallery.videoReview.presentationAudioUnsupported');
  if (failure instanceof StaticLogoError && failure.code === 'animated')
    return translate('gallery.videoReview.watermarkImageAnimated');
  if (
    failure instanceof StaticLogoError &&
    (failure.code === 'size' || failure.code === 'dimensions')
  )
    return translate('gallery.videoReview.watermarkImageSize');
  return translate(
    action === 'settings'
      ? 'gallery.videoReview.saveFailed'
      : 'gallery.videoReview.presentationAcquireFailed'
  );
}
