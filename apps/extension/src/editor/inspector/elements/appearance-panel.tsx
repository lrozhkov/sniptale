import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Sun, X } from 'lucide-react';
import './appearance-panel.css';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { InspectorSurface } from '../../../ui/compact-inspector-controls/layout';
import { SegmentedRow } from '../../../ui/compact-inspector-controls';
import { translate } from '../../../platform/i18n';
import { EditorIconButton, NumericRow, ColorField } from '../../chrome/ui';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  createEditorIconAppearance,
  getEditorVectorPresentation,
  type EditorIconAppearance,
} from './presentation';

const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);

function useAppearancePanelLifecycle(
  anchor: RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  const panelWidth = 340;
  const [bounds, setBounds] = useState({ left: 12, top: 72, width: panelWidth, maxHeight: 480 });
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const theme = useResolvedPortalTheme(anchor.current);
  useLayoutEffect(() => {
    const inspector = anchor.current?.closest('[data-ui="editor.floating.layers-panel"]');
    const update = () => {
      const rect = inspector?.getBoundingClientRect();
      const edge = rect?.left ?? window.innerWidth - 376;
      const width = Math.min(panelWidth, Math.max(180, edge - 24));
      const maxHeight = Math.max(120, window.innerHeight - 96);
      setBounds({
        left: Math.max(12, edge - width - 12),
        top: Math.max(
          72,
          Math.min(rect?.top ?? 72, window.innerHeight - Math.min(480, maxHeight) - 12)
        ),
        width,
        maxHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (inspector) observer.observe(inspector);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);
  useEffect(() => {
    const trigger = document.activeElement;
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="listbox"], [role="menu"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return { bounds, panel, theme };
}

function AppearanceParameters({
  draft,
  definition,
  patch,
  onPreset,
}: {
  draft: EditorIconAppearance;
  definition: EditorVectorDefinition | undefined;
  patch(value: Partial<EditorIconAppearance>): void;
  onPreset(value: EditorIconAppearance): void;
}) {
  const isPreset = (dark: boolean) => {
    const preset = createEditorIconAppearance(dark);
    return (
      draft.background === preset.background &&
      draft.ink === preset.ink &&
      draft.opacity === preset.opacity &&
      draft.strokeScale === preset.strokeScale &&
      Object.keys(draft.colors).length === 0
    );
  };
  const colors = definition?.slots ?? [];
  const presentation = definition ? getEditorVectorPresentation(definition, draft) : null;
  return (
    <div
      className="min-h-0 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto p-2 [scrollbar-width:thin]"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <SegmentedRow
        ariaLabel={message('appearance')}
        columns={2}
        value={isPreset(false) ? 'light' : isPreset(true) ? 'dark' : ''}
        options={[
          { value: 'light', label: message('lightPreset') },
          { value: 'dark', label: message('darkPreset') },
        ]}
        onChange={(preset) => onPreset(createEditorIconAppearance(preset === 'dark'))}
      />
      <div
        className={[
          'flex h-24 items-center justify-center rounded-[4px] border',
          'border-[var(--sniptale-color-border-soft)]',
        ].join(' ')}
        style={{ backgroundColor: draft.background }}
      >
        {presentation ? (
          <img src={presentation.previewUrl} alt="" className="h-16 w-16 object-contain" />
        ) : (
          <Sun
            size={36}
            style={{
              color: draft.ink,
              opacity: draft.opacity,
              strokeWidth: 2 * draft.strokeScale,
            }}
          />
        )}
      </div>
      <InspectorSurface className="space-y-1">
        <ColorField
          label={message('previewBackground')}
          title={message('previewBackground')}
          value={draft.background}
          allowTransparent={false}
          paletteInPicker
          onChange={(background) => patch({ background })}
        />
        <ColorField
          label={message('iconInk')}
          title={message('iconInk')}
          value={draft.ink}
          allowTransparent={false}
          paletteInPicker
          onChange={(ink) => patch({ ink })}
        />
        {colors.length > 1
          ? colors.map((slot, index) => (
              <ColorField
                key={slot.id}
                label={message('paletteSlot').replace('{index}', String(index + 1))}
                title={message('paletteSlot').replace('{index}', String(index + 1))}
                value={
                  draft.colors[slot.originalColor] ??
                  presentation?.colors[slot.id] ??
                  slot.originalColor
                }
                allowTransparent={false}
                paletteInPicker
                onChange={(color) =>
                  patch({ colors: { ...draft.colors, [slot.originalColor]: color } })
                }
              />
            ))
          : null}
        <NumericRow
          appearance="plain"
          rangePresentation="field"
          label={message('opacity')}
          value={draft.opacity * 100}
          min={0}
          max={100}
          precision={0}
          unit="%"
          enterBehavior="blur"
          scrub={{ min: 0, max: 100, step: 1 }}
          onPreviewValue={(value) => patch({ opacity: value / 100 })}
          onCommitValue={(value) => patch({ opacity: value / 100 })}
        />
        <NumericRow
          appearance="plain"
          label={message('strokeScale')}
          disabled={Boolean(definition && !definition.capabilities.strokeScale)}
          value={draft.strokeScale}
          min={0.01}
          max={100}
          precision={2}
          step={0.1}
          unit="x"
          enterBehavior="blur"
          onPreviewValue={(strokeScale) => patch({ strokeScale })}
          onCommitValue={(strokeScale) => patch({ strokeScale })}
        />
      </InspectorSurface>
    </div>
  );
}

/** A disposable appearance draft never changes artwork or document history before Apply. */
export function EditorIconAppearancePanel(props: {
  anchor: RefObject<HTMLDivElement | null>;
  value: EditorIconAppearance;
  definition: EditorVectorDefinition | undefined;
  onApply(value: EditorIconAppearance): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(props.value);
  const { bounds, panel, theme } = useAppearancePanelLifecycle(props.anchor, props.onClose);
  const patch = (value: Partial<EditorIconAppearance>) =>
    setDraft((previous) => ({ ...previous, ...value }));
  return createPortal(
    <FloatingChromePanel
      ref={panel}
      role="region"
      tabIndex={-1}
      aria-label={message('appearance')}
      dataUi="editor.elements.appearance"
      data-floating-ui-root="true"
      data-theme={theme ?? undefined}
      className={[
        'editor-icon-appearance sniptale-compact-workspace sniptale-image-workspace',
        'fixed z-30 flex min-h-0 flex-col overflow-hidden',
        'text-[var(--sniptale-color-text-primary)] outline-none',
      ].join(' ')}
      style={bounds}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--sniptale-color-border-soft)] p-2">
        <span className="min-w-0 flex-1 text-xs font-medium">{message('appearance')}</span>
        <EditorIconButton
          className="!h-8 !w-8"
          title={message('close')}
          aria-label={message('close')}
          onClick={props.onClose}
        >
          <X size={16} />
        </EditorIconButton>
      </div>
      <AppearanceParameters
        draft={draft}
        definition={props.definition}
        patch={patch}
        onPreset={setDraft}
      />
      <div
        className={[
          'flex shrink-0 justify-between gap-2 border-t',
          'border-[var(--sniptale-color-border-soft)] p-2',
        ].join(' ')}
      >
        <ProductActionButton
          compact
          tone="secondary"
          className="!h-8 !min-h-8 !rounded-[4px] !px-2 !text-xs"
          onClick={props.onClose}
        >
          {message('cancel')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          className="!h-8 !min-h-8 !rounded-[4px] !px-2 !text-xs"
          onClick={() => props.onApply(draft)}
        >
          {message('applyAppearance')}
        </ProductActionButton>
      </div>
    </FloatingChromePanel>,
    resolveThemeSafePortalTarget(props.anchor.current)
  );
}
