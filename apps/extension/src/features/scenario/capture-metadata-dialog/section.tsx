import { useContext } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { ScenarioMetadataSection } from './types';

export function ScenarioMetadataSectionView(props: ScenarioMetadataSection) {
  const adopted = useContext(CommandPressScope);
  if (adopted)
    return (
      <section className="grid gap-2 rounded-[4px] border border-[var(--sniptale-color-border-soft)] p-3">
        <h2 className="m-0 text-[14px] leading-5 font-semibold">{props.title}</h2>
        <dl className="m-0 grid gap-1">
          {props.items.map((item) => (
            <div
              key={`${props.title}-${item.label}`}
              className="grid min-h-8 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-2 py-1.5
              text-[13px] leading-[18px] font-medium"
            >
              <dt className="text-[var(--sniptale-color-text-secondary)]">{item.label}</dt>
              <dd className="m-0 !select-text [overflow-wrap:anywhere] text-[var(--sniptale-color-text-primary)]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
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
