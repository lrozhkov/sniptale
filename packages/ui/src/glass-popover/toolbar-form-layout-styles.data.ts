export const glassPopoverToolbarFormLayoutStyles = `
.sniptale-glass-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  pointer-events: auto;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--sniptale-color-text-inverse) 8%, transparent),
      transparent 18%
    ),
    color-mix(in srgb, var(--sniptale-color-surface-panel) 96%, var(--sniptale-color-surface-canvas));
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 92%, transparent);
  border-top-color: color-mix(in srgb, var(--sniptale-color-text-inverse) 22%, transparent);
  border-radius: 12px;
  box-shadow:
    0 8px 20px color-mix(in srgb, var(--sniptale-color-shadow-strong) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-text-inverse) 6%, transparent);
  user-select: none;
  -webkit-user-select: none;
}

.sniptale-glass-toolbar-button {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 56%, transparent);
  border-top-color: color-mix(in srgb, var(--sniptale-color-text-inverse) 5%, transparent);
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 10%,
    var(--sniptale-color-surface-panel) 90%
  );
  color: var(--sniptale-color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sniptale-glass-toolbar-button:hover {
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 20%,
    var(--sniptale-color-surface-panel) 80%
  );
  border-color: color-mix(in srgb, var(--sniptale-color-border-strong) 68%, transparent);
  color: var(--sniptale-color-text-inverse);
}

.sniptale-glass-toolbar-button:active { transform: translateY(1px); }

.sniptale-glass-toolbar-button--active {
  border-color: color-mix(in srgb, var(--sniptale-color-accent) 55%, transparent);
  color: var(--sniptale-color-accent);
  background: color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);
}

.sniptale-glass-toolbar-button--active:hover {
  border-color: color-mix(in srgb, var(--sniptale-color-accent) 55%, transparent);
  color: var(--sniptale-color-accent-emphasis);
  background: color-mix(in srgb, var(--sniptale-color-accent) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);
}

.sniptale-glass-toolbar-button--danger:hover {
  border-color: color-mix(in srgb, var(--sniptale-color-danger) 45%, transparent);
  background: color-mix(in srgb, var(--sniptale-color-danger) 14%, transparent);
  color: color-mix(in srgb, var(--sniptale-color-danger) 32%, white 68%);
}

.sniptale-glass-toolbar-divider {
  width: 1px;
  align-self: stretch;
  margin: 3px 3px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--sniptale-color-text-inverse) 2%, transparent),
      color-mix(in srgb, var(--sniptale-color-text-inverse) 10%, transparent),
      color-mix(in srgb, var(--sniptale-color-text-inverse) 2%, transparent)
    );
}

.sniptale-glass-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sniptale-glass-toggle-copy { display: flex; flex-direction: column; gap: 2px; }
.sniptale-glass-toggle-title { font-size: 12px; color: var(--sniptale-color-text-primary); }
.sniptale-glass-toggle-hint { font-size: 12px; color: var(--sniptale-color-text-dim); }
`;
