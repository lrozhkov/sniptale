import { ImagePreviewRaster, type ImageComparisonMode } from './preview-raster';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Blend, Columns2, X } from 'lucide-react';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import type { ImageRaster } from '../../contracts/ai/image';
import type { ImageEditorSession, ImageSessionState } from './session';
import { useEditorController } from '../application/controller-context';
import { ImageResults } from './results';
import { ImageGenerationDetails } from './generation-details';
import { prepareImageEditorResult, type ImageResultFitting } from '../controller/ai-image/apply';

type PreviewKind = 'source' | 'result' | 'attachment';
type ResultView = 'result' | 'raw' | 'original';
type ComparisonMode = ImageComparisonMode;
type PreviewActions = {
  openSource(trigger: HTMLElement): void;
  openResult(trigger: HTMLElement): void;
  openAttachment(image: ImageRaster, trigger: HTMLElement): void;
};
const PreviewContext = createContext<PreviewActions | null>(null);

/** Opens the inspector's single disposable image viewer without changing the document. */
export function useImagePreview(): PreviewActions {
  const context = useContext(PreviewContext);
  if (!context) throw new Error('Image preview workspace is missing');
  return context;
}

/** Owns one non-modal preview and its focus lifetime for this mounted inspector. */
export function ImagePreviewWorkspace(
  props: PropsWithChildren<{
    session: ImageEditorSession;
    state: ImageSessionState;
    hidden?: boolean;
    onFinish(): void;
  }>
) {
  const controller = useEditorController();
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const previousSelection = useRef(props.state.selected);
  const [kind, setKind] = useState<PreviewKind | null>(() =>
    props.state.selected ? 'result' : null
  );
  const [attachment, setAttachment] = useState<ImageRaster | null>(null);
  const step = props.state.steps.find((entry) => entry.id === props.state.selected?.stepId);
  const result = props.session.getSelectedVariant();
  const [fitting, setFitting] = useState<ImageResultFitting>('exact');
  const [view, setView] = useState<ResultView>('result');
  const [comparison, setComparison] = useState<ComparisonMode>('none');
  const [prepared, setPrepared] = useState<{
    result: typeof result;
    fitting: ImageResultFitting;
    image: ImageRaster;
    original: ImageRaster | null;
  } | null>(null);
  const [preparationFailed, setPreparationFailed] = useState<'size-mismatch' | 'prepare' | null>(
    null
  );
  useEffect(() => {
    setFitting('exact');
    setView('result');
    setComparison('none');
  }, [step?.id]);
  useEffect(() => {
    let current = true;
    setPreparationFailed(null);
    if (!step || !result || kind !== 'result') {
      setPrepared(null);
      return;
    }
    const original = step.context.images.find((image) => image.role === 'source');
    Promise.all([
      prepareImageEditorResult(step.snapshot, result.image, true, fitting),
      original && step.snapshot.intention !== 'new-image'
        ? prepareImageEditorResult(step.snapshot, original, true, 'exact')
        : Promise.resolve(original ?? null),
    ])
      .then(([image, original]) => {
        if (current) setPrepared({ result, fitting, image, original });
      })
      .catch((error: unknown) => {
        if (current) {
          setPrepared(null);
          setPreparationFailed(
            error instanceof Error && error.message === 'size-mismatch'
              ? 'size-mismatch'
              : 'prepare'
          );
        }
      });
    return () => {
      current = false;
    };
  }, [step, result, fitting, kind]);
  const ready = prepared?.result === result && prepared?.fitting === fitting;

  useEffect(() => {
    if (previousSelection.current === props.state.selected) return;
    previousSelection.current = props.state.selected;
    trigger.current = null;
    setKind(props.state.selected ? 'result' : null);
  }, [props.state.selected]);
  useEffect(() => {
    if (attachment && !props.state.draft.references.includes(attachment)) {
      setAttachment(null);
      if (kind === 'attachment') {
        setKind(null);
        if (panel.current?.contains(document.activeElement))
          anchor.current?.querySelector<HTMLElement>('[data-ui="editor.ai.prompt"]')?.focus();
      }
    }
    if (kind === 'source' && !props.state.source) setKind(null);
  }, [attachment, kind, props.state.draft.references, props.state.source]);
  const close = () => {
    const ownsFocus = panel.current?.contains(document.activeElement);
    setKind(null);
    if (ownsFocus) {
      const target = trigger.current?.isConnected
        ? trigger.current
        : anchor.current?.querySelector<HTMLElement>('[data-ui="editor.ai.prompt"]');
      target?.focus();
    }
  };
  const source = kind === 'source' ? props.state.source : step?.snapshot;
  const image =
    kind === 'attachment'
      ? attachment
      : kind === 'source'
        ? source?.raster
        : ready && view !== 'raw'
          ? view === 'original' && prepared.original
            ? prepared.original
            : prepared.image
          : result?.image;
  return (
    <PreviewContext.Provider
      value={{
        openAttachment: (image, element) => {
          trigger.current = element;
          setAttachment(image);
          setKind('attachment');
        },
        openSource: (element) => {
          trigger.current = element;
          setKind('source');
        },
        openResult: (element) => {
          trigger.current = element;
          setKind('result');
        },
      }}
    >
      <div ref={anchor} className="contents">
        {props.children}
      </div>
      {!props.hidden && kind && image ? (
        <ImagePreviewPanel
          anchor={anchor}
          panel={panel}
          image={image}
          original={kind === 'result' && ready ? prepared.original : null}
          resultView={kind === 'result' ? view : null}
          onView={(next) => {
            setView(next);
            setComparison('none');
          }}
          details={
            kind === 'result' ? (
              <ImageGenerationDetails step={step} variant={props.state.selected?.variant} />
            ) : null
          }
          compareFrame={
            kind === 'result' && step?.snapshot.intention !== 'new-image'
              ? step?.snapshot.targetBounds
              : undefined
          }
          imageKey={`${kind}:${source?.id}:${step?.id}:${props.state.selected?.variant}`}
          title={translate(
            kind === 'attachment'
              ? 'editor.ai.references'
              : kind === 'source'
                ? 'editor.ai.sourcePreview'
                : 'editor.ai.preview'
          )}
          onClose={close}
          comparison={kind === 'result' ? comparison : 'none'}
        >
          {kind === 'result' ? (
            <div className="shrink-0 space-y-1 border-t border-[var(--sniptale-color-border-soft)] p-2 text-xs">
              <div className="flex items-center gap-2" data-ui="editor.ai.preview.placement">
                <EditorIconButton
                  title={translate(
                    ready && prepared.original
                      ? 'editor.ai.compareImages'
                      : 'editor.ai.compareUnavailable'
                  )}
                  data-ui="editor.ai.preview.compare"
                  aria-pressed={comparison === 'split'}
                  disabled={!ready || !prepared.original}
                  className={[
                    '!border-transparent',
                    comparison === 'split'
                      ? '!bg-[var(--sniptale-color-surface-hover)]'
                      : '!bg-transparent',
                    comparison === 'split'
                      ? '!text-[var(--sniptale-color-text-primary-strong)]'
                      : 'hover:!text-[var(--sniptale-color-text-primary-strong)]',
                  ].join(' ')}
                  onClick={() => {
                    setComparison(comparison === 'split' ? 'none' : 'split');
                    setView('result');
                  }}
                >
                  <Columns2 size={16} />
                </EditorIconButton>
                <EditorIconButton
                  title={translate(
                    ready && prepared.original
                      ? 'editor.ai.blendImages'
                      : 'editor.ai.compareUnavailable'
                  )}
                  data-ui="editor.ai.preview.blend"
                  aria-pressed={comparison === 'opacity'}
                  disabled={!ready || !prepared.original}
                  className={[
                    '!border-transparent',
                    comparison === 'opacity'
                      ? '!bg-[var(--sniptale-color-surface-hover)]'
                      : '!bg-transparent',
                    comparison === 'opacity'
                      ? '!text-[var(--sniptale-color-text-primary-strong)]'
                      : 'hover:!text-[var(--sniptale-color-text-primary-strong)]',
                  ].join(' ')}
                  onClick={() => {
                    setComparison(comparison === 'opacity' ? 'none' : 'opacity');
                    setView('result');
                  }}
                >
                  <Blend size={16} />
                </EditorIconButton>
                {step?.snapshot.intention === 'source' ? (
                  <div
                    className="flex min-w-0 flex-1 flex-wrap justify-end gap-1"
                    role="group"
                    aria-label={translate('editor.ai.resultPlacement')}
                  >
                    {(
                      [
                        'exact',
                        'cover',
                        ...(step?.snapshot.intention === 'source' ? [] : ['free']),
                      ] as const
                    ).map((value) => (
                      <ProductActionButton
                        key={value}
                        compact
                        tone="toggle"
                        active={fitting === value}
                        aria-pressed={fitting === value}
                        disabled={props.state.status !== 'idle'}
                        className="!h-8 !min-h-8 !rounded-[4px] !px-2 !text-xs"
                        onClick={() => {
                          if (value === 'exact' || value === 'cover' || value === 'free')
                            setFitting(value);
                        }}
                      >
                        {translate(
                          value === 'exact'
                            ? 'editor.ai.fitExact'
                            : value === 'cover'
                              ? 'editor.ai.fitCover'
                              : 'editor.ai.fitFree'
                        )}
                      </ProductActionButton>
                    ))}
                  </div>
                ) : step?.snapshot.intention === 'region' ||
                  step?.snapshot.intention === 'layers' ? (
                  <span className="ml-auto text-right text-xs text-[var(--sniptale-color-text-secondary)]">
                    {step.snapshot.targetBounds.width} × {step.snapshot.targetBounds.height} ·{' '}
                    {translate('editor.ai.fitExact')}
                  </span>
                ) : null}
              </div>
              {!ready ? (
                <p role={preparationFailed ? 'alert' : 'status'}>
                  {translate(
                    preparationFailed === 'size-mismatch'
                      ? 'editor.ai.sizeMismatch'
                      : preparationFailed
                        ? 'editor.ai.resultPreparationFailed'
                        : 'editor.ai.resultPreparing'
                  )}
                </p>
              ) : null}
              {preparationFailed && step ? (
                <ProductActionButton
                  compact
                  tone="secondary"
                  disabled={props.state.status !== 'idle'}
                  onClick={() => {
                    props.session.useOriginal();
                    props.session.setDraft({ prompt: step.context.prompt });
                    anchor.current
                      ?.querySelector<HTMLElement>('[data-ui="editor.ai.prompt"]')
                      ?.focus();
                  }}
                >
                  {translate('editor.ai.restorePrompt')}
                </ProductActionButton>
              ) : null}
            </div>
          ) : null}
          <ImagePreviewVariants
            step={kind === 'result' ? step : undefined}
            selected={props.state.selected?.variant}
            disabled={props.state.status !== 'idle'}
            onChoose={(index) => {
              if (step) props.session.chooseVariant(step.id, index);
            }}
          />
          {kind === 'result' ? (
            <ImageResults
              session={props.session}
              state={props.state}
              controller={controller.getPublicApiAdapter()}
              fitting={fitting}
              ready={ready}
              onFinish={props.onFinish}
            />
          ) : null}
        </ImagePreviewPanel>
      ) : null}
    </PreviewContext.Provider>
  );
}

function usePreviewPlacement(anchor: RefObject<HTMLDivElement | null>) {
  const [bounds, setBounds] = useState({ left: 12, top: 72, width: 640, height: 400 });
  useLayoutEffect(() => {
    const inspector = anchor.current?.closest<HTMLElement>(
      '[data-ui="editor.floating.layers-panel"]'
    );
    const update = () => {
      const inspectorBounds = inspector?.getBoundingClientRect();
      const edge = inspectorBounds?.left ?? window.innerWidth - 376;
      const available = Math.max(160, edge - 24);
      const width = Math.min(
        640,
        Math.max(300, available * 0.8),
        available,
        window.innerWidth - 24
      );
      const height = Math.min(600, Math.max(160, window.innerHeight - 96));
      setBounds({
        left: Math.max(12, edge - width - 12),
        top: Math.max(72, Math.min(inspectorBounds?.top ?? 72, window.innerHeight - height - 12)),
        width,
        height,
      });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (inspector) observer?.observe(inspector);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);
  return bounds;
}

function ImagePreviewPanel(
  props: PropsWithChildren<{
    anchor: RefObject<HTMLDivElement | null>;
    panel: RefObject<HTMLDivElement | null>;
    image: ImageRaster;
    original: ImageRaster | null;
    title: string;
    imageKey: string;
    resultView: ResultView | null;
    onView(value: ResultView): void;
    details: ReactNode;
    compareFrame: { width: number; height: number } | undefined;
    onClose(): void;
    comparison: ComparisonMode;
  }>
) {
  const { onClose } = props;
  const bounds = usePreviewPlacement(props.anchor);
  const theme = useResolvedPortalTheme(props.anchor.current);
  const [zoom, setZoom] = useState<number | null>(null);
  const image = props.image;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]')
      )
        return;
      onClose();
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  return createPortal(
    <FloatingChromePanel
      ref={props.panel}
      role="region"
      aria-label={props.title}
      dataUi="editor.ai.preview"
      data-theme={theme ?? undefined}
      className={[
        'sniptale-compact-workspace sniptale-image-workspace fixed z-30 flex min-h-0 flex-col overflow-hidden',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={bounds}
    >
      <ImagePreviewToolbar
        image={image}
        title={props.title}
        hasOriginal={Boolean(props.original)}
        view={props.resultView}
        onView={props.onView}
        details={props.details}
        zoom={zoom}
        onZoom={setZoom}
        onClose={onClose}
      />
      <ImagePreviewRaster
        image={image}
        zoom={zoom}
        onZoom={setZoom}
        label={props.title}
        original={props.original}
        comparison={props.comparison}
        frame={props.compareFrame}
        imageKey={props.imageKey}
      />
      {props.children}
    </FloatingChromePanel>,
    resolveThemeSafePortalTarget(props.anchor.current)
  );
}

function ImagePreviewVariants(props: {
  step: ImageSessionState['steps'][number] | undefined;
  selected: number | undefined;
  disabled: boolean;
  onChoose(index: number): void;
}) {
  const { step } = props;
  return step && step.variants.filter(Boolean).length > 1 ? (
    <div
      className="flex flex-wrap justify-center gap-2 border-t border-[var(--sniptale-color-border-soft)] p-2"
      role="group"
      aria-label={translate('editor.ai.resultVariants')}
    >
      {step.variants.map((variant, index) =>
        variant ? (
          <button
            key={index}
            type="button"
            disabled={props.disabled}
            aria-pressed={props.selected === index}
            aria-label={`${translate('editor.ai.variants')} ${index + 1}`}
            onClick={() => props.onChoose(index)}
            className={[
              'rounded-[4px] border p-0.5',
              props.selected === index
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            <img src={variant.image.dataUrl} alt="" className="h-12 w-16 object-contain" />
          </button>
        ) : null
      )}
    </div>
  ) : null;
}

function ImagePreviewToolbar(props: {
  image: ImageRaster;
  title: string;
  hasOriginal: boolean;
  view: ResultView | null;
  onView(value: ResultView): void;
  details: ReactNode;
  zoom: number | null;
  onZoom(value: number | null): void;
  onClose(): void;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--sniptale-color-border-soft)] p-2"
      data-ui="editor.ai.preview.header"
    >
      {props.view ? (
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={translate('editor.ai.previewView')}
        >
          {(['result', 'raw', ...(props.hasOriginal ? ['original'] : [])] as const).map((view) => (
            <ProductActionButton
              key={view}
              compact
              tone="toggle"
              active={props.view === view}
              aria-pressed={props.view === view}
              className="!h-8 !min-h-8 !rounded-[4px] !px-2 !text-xs"
              onClick={() => {
                if (view === 'result' || view === 'raw' || view === 'original') props.onView(view);
              }}
            >
              {translate(
                view === 'result'
                  ? 'editor.ai.result'
                  : view === 'raw'
                    ? 'editor.ai.rawResponse'
                    : 'editor.ai.original'
              )}
            </ProductActionButton>
          ))}
        </div>
      ) : (
        <span className="text-xs">{props.title}</span>
      )}
      <span className="ml-auto whitespace-nowrap text-xs tabular-nums">
        {props.image.width} × {props.image.height}
      </span>
      <ProductActionButton
        compact
        tone="secondary"
        className="!h-8 !min-h-8 !rounded-[4px] !px-2 hover:!shadow-none"
        title={translate(props.zoom !== null ? 'editor.ai.fitPreview' : 'editor.ai.nativePreview')}
        data-ui="editor.ai.preview.zoom"
        onClick={() => props.onZoom(props.zoom === null ? 1 : null)}
      >
        {props.zoom !== null
          ? `${Math.round(props.zoom * 100)}%`
          : translate('editor.ai.fitPreview')}
      </ProductActionButton>
      {props.details}
      <EditorIconButton
        title={translate('common.actions.close')}
        onClick={props.onClose}
        className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-accent)]"
        data-ui="editor.ai.preview.close"
      >
        <X size={14} />
      </EditorIconButton>
    </div>
  );
}
