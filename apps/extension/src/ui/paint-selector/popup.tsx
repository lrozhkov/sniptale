import { createPortal } from 'react-dom';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type KeyboardEvent,
} from 'react';
import { BookmarkPlus, Undo2 } from 'lucide-react';
import {
  createSolidPaint,
  updateGradientStop,
  type GradientType,
  type Paint,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { useEyedropper } from '@sniptale/ui/color-selector/popover-state';
import {
  ColorSelectorFloatingLayer,
  useColorSelectorLayerStyle,
} from '@sniptale/ui/color-selector/floating-layer';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import type { GradientTemplateResources } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { PickerFooter } from '../color-selector/picker-sections';
import { resolvePaintSelectorLayerStyle } from './lifecycle';
import { PaintModeSelector } from './mode-selector';
import { PaintSelectorEditorContent } from './editor-content';
import { GradientTemplatePanel } from './template-panel';
import { GradientTemplateSave } from './template-save';
import type { usePaintHistory } from './history';

const utilityClass = [
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'disabled:opacity-40 focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

type PaintSelectorPopupProps = {
  resources: GradientTemplateResources;
  nameField?: ReactNode;
  allowedModes?: readonly ('solid' | GradientType)[];
  apply: () => void;
  cancel: () => void;
  createId: PaintStopIdFactory;
  draft: Paint;
  original: Paint;
  compact: boolean;
  onToggleCompact: () => void;
  history: ReturnType<typeof usePaintHistory>;
  formatMode: ColorSelectorFormatMode;
  onCycleFormatMode: () => void;
  onEyedropperStateChange: (active: boolean) => void;
  onModeChange: (mode: 'solid' | GradientType) => void;
  palette: readonly string[];
  preview: (paint: Paint) => void;
  recentColors: readonly string[];
  showGradientAdvancedControls?: boolean;
  selectedStopId: string | null;
  selectStop: (id: string | null) => void;
  title: string;
};
type PaintSelectorSection = 'paint' | 'templates';
type LayerProps = PaintSelectorPopupProps & {
  layerRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  ownerId: string;
  rootRef: RefObject<HTMLDivElement | null>;
};

export function PaintSelectorPortal(props: LayerProps) {
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(props.rootRef.current);
  if (!props.open || !portalTarget) return null;
  return createPortal(<PaintSelectorLayer {...props} />, portalTarget);
}

function PaintSelectorLayer(props: LayerProps) {
  const [section, setSection] = useState<PaintSelectorSection>('paint');
  const theme = useResolvedPortalTheme(props.rootRef.current);
  const width = props.draft.kind === 'gradient' ? 620 : 300;
  const layerStyle = resolvePaintSelectorLayerStyle(
    useColorSelectorLayerStyle(
      props.rootRef.current,
      props.open,
      'auto',
      null,
      props.layerRef,
      'palette',
      560
    ),
    props.rootRef.current,
    width
  );
  return (
    <ColorSelectorFloatingLayer
      layerRef={props.layerRef}
      ownerId={props.ownerId}
      portalTheme={theme}
      ui="shared.ui.paint-selector.layer"
      style={layerStyle}
    >
      <PaintSelectorPopup {...props} section={section} setSection={setSection} />
    </ColorSelectorFloatingLayer>
  );
}

function useOriginalStopColors(original: Paint, draft: Paint) {
  const colors = useRef(new Map<string, string>());
  for (const paint of [original, draft]) {
    if (paint.kind !== 'gradient') continue;
    // Keep new-stop creation colors stable across edits, selection, and local Undo.
    for (const stop of paint.gradient.stops) {
      if (!colors.current.has(stop.id)) colors.current.set(stop.id, stop.color);
    }
  }
  return colors.current;
}

function applyValidPaint(apply: () => void, root: HTMLDivElement | null) {
  const invalid = root?.querySelector<HTMLElement>('[aria-invalid="true"], :invalid');
  if (invalid) invalid.focus();
  else apply();
}

function handlePaintHistoryKey(
  event: KeyboardEvent<HTMLDivElement>,
  history: ReturnType<typeof usePaintHistory>
) {
  const text =
    event.target instanceof Element &&
    event.target.closest('input, textarea, [contenteditable="true"]');
  if (text || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  event.stopPropagation();
  if (event.shiftKey) history.redo();
  else history.undo();
}

function PaintTemplateSelection({
  popup,
  onEdit,
}: {
  popup: PaintSelectorPopupProps;
  onEdit: () => void;
}) {
  const select = (gradient: Extract<Paint, { kind: 'gradient' }>['gradient']) => {
    popup.preview({ kind: 'gradient', gradient });
    popup.selectStop(gradient.stops[0]?.id ?? null);
  };
  return (
    <GradientTemplatePanel
      resources={popup.resources}
      {...(popup.allowedModes === undefined ? {} : { allowedModes: popup.allowedModes })}
      {...(popup.draft.kind === 'gradient' ? { activeGradient: popup.draft.gradient } : {})}
      onSelect={select}
      onCopy={(gradient) => {
        select(gradient);
        onEdit();
      }}
    />
  );
}

function PaintPopupFooter(props: {
  popup: PaintSelectorPopupProps;
  root: RefObject<HTMLDivElement | null>;
  onSaved: (id: string) => void;
  context: string;
}) {
  const [saving, setSaving] = useState(false);
  const saveAnchor = useRef<HTMLButtonElement>(null);
  useEffect(() => setSaving(false), [props.context]);
  return (
    <>
      {saving && props.popup.draft.kind === 'gradient' && (
        <GradientTemplateSave
          anchor={saveAnchor.current}
          gradient={props.popup.draft.gradient}
          resources={props.popup.resources}
          onClose={() => setSaving(false)}
          onSaved={props.onSaved}
        />
      )}
      <div className="shrink-0" data-picker-footer="true">
        <PickerFooter
          variant="paint"
          onApply={() => applyValidPaint(props.popup.apply, props.root.current)}
          onCancel={props.popup.cancel}
          compact={props.popup.compact}
          onToggleCompact={props.popup.onToggleCompact}
          utilities={
            props.popup.draft.kind === 'gradient' ? (
              <>
                <button
                  type="button"
                  className={utilityClass}
                  disabled={!props.popup.history.canUndo}
                  aria-label={translate('highlighter.paintPicker.undo')}
                  title={translate('highlighter.paintPicker.undo')}
                  onClick={props.popup.history.undo}
                >
                  <Undo2 size={16} strokeWidth={1.75} />
                </button>
                <button
                  ref={saveAnchor}
                  type="button"
                  className={utilityClass}
                  aria-expanded={saving}
                  aria-label={translate('highlighter.paintPicker.saveTemplate')}
                  title={translate('highlighter.paintPicker.saveTemplate')}
                  onClick={() => setSaving(!saving)}
                >
                  <BookmarkPlus size={16} strokeWidth={1.75} />
                </button>
              </>
            ) : undefined
          }
        />
      </div>
    </>
  );
}

export function PaintSelectorPopup(
  props: PaintSelectorPopupProps & {
    section: PaintSelectorSection;
    setSection: (section: PaintSelectorSection) => void;
  }
) {
  const body = useRef<HTMLDivElement>(null);
  const catalogHeight = useRef(340);
  const popup = useRef<HTMLDivElement>(null);
  const originalStopColors = useOriginalStopColors(props.original, props.draft);
  const selected =
    props.draft.kind === 'gradient'
      ? (props.draft.gradient.stops.find((stop) => stop.id === props.selectedStopId) ??
        props.draft.gradient.stops[0])
      : null;
  const mode = props.draft.kind === 'solid' ? 'solid' : props.draft.gradient.type;
  const changeColor = (color: string) => {
    if (props.draft.kind === 'solid') props.preview(createSolidPaint(color));
    else if (selected)
      props.preview({
        kind: 'gradient',
        gradient: updateGradientStop(props.draft.gradient, selected.id, { color }),
      });
  };
  const eyedropper = useEyedropper(changeColor, props.onEyedropperStateChange);
  const showTemplates = (id?: string) => {
    catalogHeight.current = body.current?.clientHeight || 340;
    props.setSection('templates');
    if (id)
      requestAnimationFrame(() => {
        popup.current
          ?.querySelector<HTMLElement>(`[data-preset-id="${CSS.escape(id)}"] button`)
          ?.focus();
      });
  };
  return (
    <div
      ref={popup}
      role="dialog"
      aria-label={props.title}
      tabIndex={-1}
      className={[
        'sniptale-picker-root flex max-h-[inherit] min-h-0 flex-col overflow-hidden rounded-[4px]',
        'bg-[var(--sniptale-color-surface-panel)] p-2.5 text-[13px] leading-[18px]',
        'text-[var(--sniptale-color-text-primary)] shadow-[0_8px_32px_#0002] outline-none',
        '[font-family:var(--sniptale-font-interface)]',
      ].join(' ')}
      data-ui="shared.ui.paint-selector.popup"
      data-density={props.compact ? 'compact' : 'full'}
      onPointerDownCapture={(event) => {
        event.currentTarget.dataset['keyboard'] = 'false';
        if (event.target instanceof Element && !event.target.closest('[data-picker-footer]'))
          props.history.begin();
      }}
      onKeyDownCapture={(event) => {
        event.currentTarget.dataset['keyboard'] = 'true';
      }}
      onPointerUpCapture={props.history.end}
      onPointerCancelCapture={props.history.end}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement) props.history.begin();
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLInputElement) props.history.end();
      }}
      onKeyDown={(event) => handlePaintHistoryKey(event, props.history)}
    >
      <div className="mb-2 shrink-0">
        <PaintModeSelector
          {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
          activeSection={props.section}
          mode={mode}
          onChange={(next) => {
            props.setSection('paint');
            props.onModeChange(next);
          }}
          onShowTemplates={() => showTemplates()}
        />
      </div>
      <div
        ref={body}
        className={[
          'min-h-0',
          props.section === 'templates'
            ? 'flex flex-col overflow-hidden'
            : 'overflow-y-auto overscroll-contain pr-2.5',
        ].join(' ')}
        style={props.section === 'templates' ? { height: catalogHeight.current } : undefined}
      >
        {props.section === 'templates' ? (
          <PaintTemplateSelection popup={props} onEdit={() => props.setSection('paint')} />
        ) : (
          <PaintSelectorEditorContent
            changeColor={changeColor}
            eyedropper={eyedropper}
            popup={props}
            selected={selected ?? null}
            originalStopColors={originalStopColors}
          />
        )}
      </div>
      <PaintPopupFooter
        context={`${props.section}-${mode}`}
        popup={props}
        root={popup}
        onSaved={showTemplates}
      />
    </div>
  );
}
