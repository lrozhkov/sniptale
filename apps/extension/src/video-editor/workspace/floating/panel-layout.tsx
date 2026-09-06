import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { startWindowPointerSession } from '../../interaction/pointer-session';

type PanelSide = 'materials' | 'inspector';
const PANEL_WIDTHS = {
  materials: { min: 200 },
  inspector: { min: 280 },
};

export interface WorkspacePanelResize {
  width: number;
  min: number;
  max: number;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  onDoubleClick: () => void;
}

/** Disposable pane dimensions share a width budget that keeps the HD viewer usable. */
export function useWorkspacePanelSizes(materialsOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [frameWidth, setFrameWidth] = useState(1280);
  const [widths, setWidths] = useState<Record<PanelSide, number | null>>({
    materials: null,
    inspector: null,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setFrameWidth(Math.max(1280, container.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
      cleanupRef.current?.();
    };
  }, []);
  const extraWidth = Math.min(120, Math.max(0, frameWidth - 1280) / 8);
  const defaults = { materials: Math.min(360, 240 + extraWidth), inspector: 320 + extraWidth };
  const materialsMax = Math.min(360, frameWidth - 40 - 640 - 280);
  const materialsWidth = Math.min(widths.materials ?? defaults.materials, materialsMax);
  const inspectorMax = Math.min(520, frameWidth - 40 - 640 - (materialsOpen ? materialsWidth : 0));
  const dimension = (side: PanelSide): WorkspacePanelResize => {
    const limits = PANEL_WIDTHS[side];
    const max = side === 'inspector' ? inspectorMax : materialsMax;
    const clamp = (value: number) => Math.max(limits.min, Math.min(max, value));
    const width = clamp(widths[side] ?? defaults[side]);
    const update = (value: number) =>
      setWidths((current) => ({ ...current, [side]: clamp(value) }));
    const direction = side === 'materials' ? 1 : -1;
    const reset = () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setWidths((current) => ({ ...current, [side]: null }));
    };
    return {
      width,
      min: limits.min,
      max,
      onDoubleClick: reset,
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        cleanupRef.current?.();
        const startX = event.clientX;
        cleanupRef.current = startWindowPointerSession({
          onMove: (move) => update(width + (move.clientX - startX) * direction),
          onCancel: () => setWidths((current) => ({ ...current, [side]: widths[side] })),
          onEnd: () => {
            cleanupRef.current = null;
          },
        });
      },
      onKeyDown: (event) => {
        if (event.key === 'Home') {
          event.preventDefault();
          reset();
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        update(width + (event.key === 'ArrowRight' ? 24 : -24) * direction);
      },
    };
  };
  return { containerRef, materials: dimension('materials'), inspector: dimension('inspector') };
}

export function WorkspacePanelResizeHandle(props: {
  resize: WorkspacePanelResize;
  label: string;
  dataUi: string;
}) {
  return (
    <div
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      aria-valuemin={props.resize.min}
      aria-valuemax={props.resize.max}
      aria-valuenow={props.resize.width}
      tabIndex={0}
      data-ui={props.dataUi}
      className={[
        'w-2 shrink-0 cursor-col-resize focus-visible:outline',
        'focus-visible:outline-1',
        'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      onPointerDown={props.resize.onPointerDown}
      onKeyDown={props.resize.onKeyDown}
      onDoubleClick={props.resize.onDoubleClick}
    />
  );
}

export function WorkspacePanelDockToggle(props: {
  fullHeight: boolean;
  onToggle: () => void;
  dataUi: string;
}) {
  const label = translate(
    props.fullHeight ? 'videoEditor.app.panelRestoreHeight' : 'videoEditor.app.panelFullHeight'
  );
  const Icon = props.fullHeight ? ChevronsDownUp : ChevronsUpDown;
  return (
    <ContentToolbarButton
      type="button"
      className="!h-6 !w-6 !min-w-6 !px-0 text-[var(--sniptale-color-text-muted)]"
      aria-label={label}
      title={label}
      aria-pressed={props.fullHeight}
      onClick={props.onToggle}
      dataUi={props.dataUi}
    >
      <Icon size={14} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
