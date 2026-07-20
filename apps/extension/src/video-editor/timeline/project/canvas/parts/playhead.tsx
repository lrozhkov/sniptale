export function ProjectTimelinePlayhead(props: { height: number; left: number }) {
  return (
    <div
      className={[
        'pointer-events-none absolute top-0 z-30 w-px bg-[var(--sniptale-color-accent-emphasis)]',
        'shadow-[0_0_12px_color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_65%,transparent)]',
      ].join(' ')}
      style={{ left: props.left, height: props.height }}
    />
  );
}
