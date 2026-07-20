export function ScenarioQuickEditNumberField(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="rounded-[14px] border border-[var(--sniptale-color-border-soft)] px-3 py-2"
      />
    </label>
  );
}

export function ScenarioQuickEditPointFields(props: {
  x: number;
  y: number;
  onXChange: (value: number) => void;
  onYChange: (value: number) => void;
}) {
  return (
    <>
      <ScenarioQuickEditNumberField label="X" value={props.x} onChange={props.onXChange} />
      <ScenarioQuickEditNumberField label="Y" value={props.y} onChange={props.onYChange} />
    </>
  );
}

export function ScenarioQuickEditTextField(props: {
  label: string;
  multiline?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      {props.multiline ? (
        <textarea
          rows={4}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="resize-none rounded-[14px] border border-[var(--sniptale-color-border-soft)] px-3 py-2"
        />
      ) : (
        <input
          type="text"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="rounded-[14px] border border-[var(--sniptale-color-border-soft)] px-3 py-2"
        />
      )}
    </label>
  );
}

export function ScenarioQuickEditSelectField<TValue extends string>(props: {
  label: string;
  options: ReadonlyArray<{ label: string; value: TValue }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as TValue)}
        className="rounded-[14px] border border-[var(--sniptale-color-border-soft)] px-3 py-2"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
