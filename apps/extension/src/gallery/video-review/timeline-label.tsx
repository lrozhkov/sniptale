import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type LabelMode = 'full' | 'compact' | 'value' | 'ellipsis';

/** Whole-value fitting shared by source, focus, audio and action timeline objects. */
export function ReviewTimelineLabel(props: {
  icon: ReactNode;
  name?: string | undefined;
  value?: string | undefined;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<LabelMode>('full');
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const available = node.clientWidth;
      if (available <= 0) return;
      const iconWidth = icon.current?.getBoundingClientRect().width ?? 0;
      const nameWidth = name.current?.getBoundingClientRect().width ?? 0;
      const valueWidth = value.current?.getBoundingClientRect().width ?? 0;
      const gap = Number.parseFloat(getComputedStyle(node).columnGap) || 0;
      const widths = [iconWidth, nameWidth, valueWidth].filter((width) => width > 0);
      const full =
        widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
      const compact = iconWidth + valueWidth + (iconWidth && valueWidth ? gap : 0);
      setMode(
        full <= available
          ? 'full'
          : compact <= available
            ? 'compact'
            : valueWidth > 0 && valueWidth <= available
              ? 'value'
              : 'ellipsis'
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const part of [node, icon.current, name.current, value.current])
      if (part) observer?.observe(part);
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) measure();
    });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [props.name, props.value]);
  const hidden = 'absolute invisible';
  return (
    <span
      ref={root}
      aria-hidden="true"
      data-ui="gallery.videoReview.timelineLabel"
      data-mode={mode}
      className="pointer-events-none relative flex h-full w-full min-w-0
        items-center justify-center gap-1 overflow-hidden text-[var(--sniptale-color-text-secondary)]"
    >
      <span
        ref={icon}
        data-label-part="icon"
        className={`inline-flex w-max shrink-0 items-center gap-1
          ${mode === 'full' || mode === 'compact' ? '' : hidden}`}
      >
        {props.icon}
      </span>
      {props.name ? (
        <span
          ref={name}
          data-label-part="name"
          className={`w-max shrink-0 whitespace-nowrap ${mode === 'full' ? '' : hidden}`}
        >
          {props.name}
        </span>
      ) : null}
      {props.value ? (
        <span
          ref={value}
          data-label-part="value"
          className={`w-max shrink-0 whitespace-nowrap tabular-nums ${mode !== 'ellipsis' ? '' : hidden}`}
        >
          {props.value}
        </span>
      ) : null}
      {mode === 'ellipsis' ? <span className="shrink-0">…</span> : null}
    </span>
  );
}
