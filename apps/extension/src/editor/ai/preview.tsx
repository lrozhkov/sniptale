import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { annotatableImageCheckerboardStyle } from '@sniptale/ui/annotatable-image-surface';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import type { ImageRaster } from '../../contracts/ai/image';
import type { ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';

type PreviewKind = 'source' | 'result';
type PreviewActions = {
  openSource(trigger: HTMLElement): void;
  openResult(trigger: HTMLElement): void;
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
  }>
) {
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const previousSelection = useRef(props.state.selected);
  const [kind, setKind] = useState<PreviewKind | null>(null);
  const step = props.state.steps.find((entry) => entry.id === props.state.selected?.stepId);
  const result = props.session.getSelectedVariant();
  useEffect(() => {
    if (previousSelection.current === props.state.selected) return;
    previousSelection.current = props.state.selected;
    trigger.current = null;
    setKind(props.state.selected ? 'result' : null);
  }, [props.state.selected]);
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
  const image = kind === 'source' ? source?.raster : result?.image;
  return (
    <PreviewContext.Provider
      value={{
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
      {kind && image ? (
        <ImagePreviewPanel
          anchor={anchor}
          panel={panel}
          image={image}
          original={
            kind === 'result'
              ? (step?.context.images.find((image) => image.role === 'source') ?? null)
              : null
          }
          region={
            kind === 'source' && source
              ? {
                  left: source.targetBounds.left - source.inputBounds.left,
                  top: source.targetBounds.top - source.inputBounds.top,
                  width: source.targetBounds.width,
                  height: source.targetBounds.height,
                }
              : null
          }
          imageKey={`${kind}:${source?.id}:${step?.id}:${props.state.selected?.variant}`}
          title={translate(kind === 'source' ? 'editor.ai.sourcePreview' : 'editor.ai.preview')}
          onClose={close}
        >
          <ImagePreviewVariants
            step={kind === 'result' ? step : undefined}
            selected={props.state.selected?.variant}
            disabled={props.state.status !== 'idle'}
            onChoose={(index) => {
              if (step) props.session.chooseVariant(step.id, index);
            }}
          />
        </ImagePreviewPanel>
      ) : null}
    </PreviewContext.Provider>
  );
}

function usePreviewPlacement(anchor: RefObject<HTMLDivElement | null>) {
  const [bounds, setBounds] = useState({ left: 12, top: 72, width: 400, height: 400 });
  useLayoutEffect(() => {
    const inspector = anchor.current?.closest<HTMLElement>(
      '[data-ui="editor.floating.layers-panel"]'
    );
    const update = () => {
      const inspectorBounds = inspector?.getBoundingClientRect();
      const edge = inspectorBounds?.left ?? window.innerWidth - 376;
      const available = Math.max(160, edge - 24);
      const width = Math.min(400, Math.max(160, available * 0.45), window.innerWidth - 24);
      const height = Math.min(400, Math.max(160, window.innerHeight - 144));
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
    region: ImageBounds | null;
    title: string;
    imageKey: string;
    onClose(): void;
  }>
) {
  const { onClose } = props;
  const bounds = usePreviewPlacement(props.anchor);
  const theme = useResolvedPortalTheme(props.anchor.current);
  const [compare, setCompare] = useState(false);
  const [native, setNative] = useState(false);
  const image = compare && props.original ? props.original : props.image;
  useEffect(() => {
    setCompare(false);
  }, [props.image.dataUrl, props.imageKey]);
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
        'sniptale-compact-workspace fixed z-30 flex min-h-0 flex-col overflow-hidden',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={bounds}
    >
      <ImagePreviewToolbar
        image={image}
        title={props.title}
        hasOriginal={Boolean(props.original)}
        compare={compare}
        native={native}
        onCompare={setCompare}
        onNative={setNative}
        onClose={onClose}
      />
      <ImagePreviewRaster
        image={image}
        region={props.region}
        native={native}
        label={compare ? translate('editor.ai.original') : props.title}
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
  compare: boolean;
  native: boolean;
  onCompare(value: boolean): void;
  onNative(value: boolean): void;
  onClose(): void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--sniptale-color-border-soft)] p-2">
      {props.hasOriginal ? (
        <>
          <ProductActionButton
            compact
            tone="toggle"
            active={!props.compare}
            onClick={() => props.onCompare(false)}
          >
            {translate('editor.ai.result')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="toggle"
            active={props.compare}
            onClick={() => props.onCompare(true)}
          >
            {translate('editor.ai.original')}
          </ProductActionButton>
        </>
      ) : (
        <span className="text-xs">{props.title}</span>
      )}
      <span className="ml-auto text-xs tabular-nums">
        {props.image.width} × {props.image.height}
      </span>
      <ProductActionButton
        compact
        tone="toggle"
        active={!props.native}
        onClick={() => props.onNative(false)}
      >
        {translate('editor.ai.fitPreview')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="toggle"
        active={props.native}
        onClick={() => props.onNative(true)}
      >
        100%
      </ProductActionButton>
      <EditorIconButton title={translate('common.actions.close')} onClick={props.onClose}>
        <X size={14} />
      </EditorIconButton>
    </div>
  );
}

function ImagePreviewRaster(props: {
  image: ImageRaster;
  region: ImageBounds | null;
  native: boolean;
  label: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" style={annotatableImageCheckerboardStyle}>
      <svg
        role="img"
        aria-label={props.label}
        viewBox={`0 0 ${props.image.width} ${props.image.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        width={props.native ? props.image.width : '100%'}
        height={props.native ? props.image.height : '100%'}
      >
        <image
          href={props.image.dataUrl}
          width={props.image.width}
          height={props.image.height}
          data-ui="editor.ai.preview-image"
        />
        {props.region ? (
          <rect
            width={props.region.width}
            height={props.region.height}
            x={props.region.left}
            y={props.region.top}
            fill="none"
            stroke="var(--sniptale-color-accent)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            aria-label={translate('editor.ai.editArea')}
            role="img"
          />
        ) : null}
      </svg>
    </div>
  );
}
