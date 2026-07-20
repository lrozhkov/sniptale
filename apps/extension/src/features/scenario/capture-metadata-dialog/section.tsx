import type { ScenarioMetadataSection } from './types';

export function ScenarioMetadataSectionView(props: ScenarioMetadataSection) {
  return (
    <section className="grid gap-2 rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
        {props.title}
      </div>
      <div className="grid gap-2">
        {props.items.map((item) => (
          <div key={`${props.title}-${item.label}`} className="grid gap-0.5">
            <div className="text-[11px] text-[var(--sniptale-color-text-muted)]">{item.label}</div>
            <div className="break-all text-sm text-[var(--sniptale-color-text-primary)]">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
