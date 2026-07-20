import React from 'react';

export function MockSegmentedSelector(props: Record<string, unknown>) {
  return (
    <div
      aria-label={String(props['ariaLabel'])}
      className={`grid ${props['columns'] === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}
      role="group"
    >
      {((props['options'] as Array<{ label: string; value: string }>) ?? []).map((option) => (
        <button
          key={option.value}
          data-testid={`segmented-${String(props['ariaLabel'])}-${option.value}`}
          aria-pressed={option.value === props['value']}
          onClick={() => (props['onChange'] as (value: string) => void)?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MockPreviewTileGrid(props: Record<string, unknown>) {
  return (
    <div
      aria-label={String(props['ariaLabel'])}
      className={`grid ${props['columns'] === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}
      role="group"
    >
      {((props['options'] as Array<{ label: string; value: string }>) ?? []).map((option) => (
        <button
          key={option.value}
          aria-label={option.label}
          data-preview-option={option.value}
          onClick={() => (props['onChange'] as (value: string) => void)?.(option.value)}
        >
          {(
            props['renderPreview'] as (option: { label: string; value: string }) => React.ReactNode
          )?.(option)}
        </button>
      ))}
    </div>
  );
}

export function MockEditorColorControl(props: Record<string, unknown>) {
  return (
    <div>
      <button
        data-testid={`color-${String(props['title'])}`}
        onClick={() => {
          (props['onChange'] as (value: string) => void)?.('#654321');
        }}
      >
        color
      </button>
      <button
        data-testid={`preview-${String(props['title'])}`}
        onClick={() => {
          (props['onPreviewChange'] as ((value: string) => void) | undefined)?.('#345678');
        }}
      >
        preview
      </button>
    </div>
  );
}

export function MockCompactInput({ onValueCommit, ...props }: Record<string, unknown>) {
  return (
    <input
      data-testid={`input-${String(props['aria-label'])}`}
      {...props}
      onBlur={() => (onValueCommit as (() => void) | undefined)?.()}
    />
  );
}

export function MockCompactRange({ onValueCommit, ...props }: Record<string, unknown>) {
  return (
    <input
      data-testid={`range-${String(props['aria-label'])}`}
      {...props}
      onBlur={() => (onValueCommit as (() => void) | undefined)?.()}
    />
  );
}

export function MockCompactSelect(props: Record<string, unknown>) {
  return (
    <div aria-label={String(props['aria-label'])} role="listbox">
      {((props['options'] as Array<{ label: string; value: string }>) ?? []).map((option) => (
        <button
          key={option.value}
          data-testid={`select-${String(props['aria-label'])}-${option.value}`}
          onClick={() => (props['onChange'] as (value: string) => void)?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MockNumericRow({
  onCommitValue,
  onPreviewValue,
  ...props
}: Record<string, unknown>) {
  return (
    <input
      data-testid={`range-${String(props['label'])}`}
      value={String(props['value'] ?? '')}
      onChange={(event) =>
        (onPreviewValue as ((value: number) => void) | undefined)?.(
          Number(event.currentTarget.value)
        )
      }
      onBlur={(event) =>
        (onCommitValue as ((value: number) => void) | undefined)?.(
          Number(event.currentTarget.value)
        )
      }
      readOnly={false}
    />
  );
}

export function MockSelectField(props: Record<string, unknown>) {
  return (
    <div aria-label={String(props['label'])} role="listbox">
      {((props['options'] as Array<{ label: string; value: string }>) ?? []).map((option) => (
        <button
          key={option.value}
          data-testid={`select-${String(props['label'])}-${option.value}`}
          onClick={() => (props['onChange'] as (value: string) => void)?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MockToggleGrid(props: Record<string, unknown>) {
  const options =
    (props['options'] as Array<{ active: boolean; label: string; onToggle: () => void }>) ?? [];
  return (
    <div aria-label={String(props['ariaLabel'])} role="group">
      {options.map((option) => (
        <button
          key={option.label}
          aria-label={option.label}
          aria-pressed={option.active}
          onClick={option.onToggle}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MockEditorIconButton(props: React.PropsWithChildren<Record<string, unknown>>) {
  return (
    <button
      data-testid={`icon-${String(props['title'])}`}
      onMouseDown={props['onMouseDown'] as React.MouseEventHandler<HTMLButtonElement>}
      onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}
    >
      {props.children}
    </button>
  );
}
