import { clampNumber, cx, type CompactInspectorUnit } from './shared';

export interface MiniScrubberProps {
  active?: boolean | undefined;
  max: number;
  min: number;
  unit?: CompactInspectorUnit;
  value: number;
}

export function MiniScrubber({ active, max, min, unit = '', value }: MiniScrubberProps) {
  void unit;
  const range = Math.max(1, max - min);
  const ratio = ((clampNumber(value, min, max) - min) / range) * 100;

  return (
    <div
      data-ui="shared.ui.compact-inspector.mini-scrubber"
      className={cx(
        'pointer-events-none absolute inset-x-2 bottom-1 h-2.5 opacity-0 transition-opacity',
        'peer-hover/scrub:opacity-100 peer-focus-visible/scrub:opacity-100',
        active && 'opacity-100'
      )}
    >
      <div
        className={[
          'absolute inset-x-0 bottom-0 h-1 rounded-full',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
        ].join(' ')}
      >
        <div
          className="h-full rounded-full bg-[color:var(--sniptale-color-accent)]"
          style={{ width: `${ratio}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className={cx(
          'absolute bottom-[-4px] h-3 w-3 -translate-x-1/2 rounded-full',
          'border border-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent)]',
          'bg-[color:var(--sniptale-color-accent)]',
          'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]'
        )}
        style={{ left: `${ratio}%` }}
      />
    </div>
  );
}
