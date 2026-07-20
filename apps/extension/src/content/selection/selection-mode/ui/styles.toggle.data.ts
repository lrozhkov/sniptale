export const SELECTION_MODE_OVERLAY_TOGGLE_STYLE = `
  .sniptale-selection-size-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 82%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 44%, transparent);
    cursor: pointer;
  }
  .sniptale-selection-size-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 82%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-input) 92%, transparent);
    position: relative;
    transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .sniptale-selection-size-checkbox:hover {
    border-color: color-mix(in srgb, var(--sniptale-color-border-strong) 76%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 82%, transparent);
  }
  .sniptale-selection-size-checkbox:checked {
    border-color: color-mix(in srgb, var(--sniptale-color-accent) 24%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);
  }
  .sniptale-selection-size-checkbox:checked::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid var(--sniptale-color-accent);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .sniptale-selection-size-toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sniptale-selection-size-toggle-title {
    font-size: 12px;
    color: var(--sniptale-color-text-primary);
  }
  .sniptale-selection-size-toggle-hint {
    font-size: 12px;
    color: var(--sniptale-color-text-muted);
  }
`;
