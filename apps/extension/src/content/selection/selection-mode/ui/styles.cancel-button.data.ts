export const SELECTION_MODE_CANCEL_BUTTON_STYLE = `
  .sniptale-selection-cancel-button {
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .sniptale-selection-cancel-button:hover {
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 86%, transparent);
    border-color: color-mix(in srgb, var(--sniptale-color-accent) 26%, transparent);
    color: var(--sniptale-color-text-primary-strong);
  }

  .sniptale-selection-cancel-button:active {
    transform: translateY(1px);
    background: color-mix(in srgb, var(--sniptale-color-accent) 8%, var(--sniptale-color-surface-hover) 92%);
  }

  .sniptale-selection-cancel-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--sniptale-color-accent) 72%, transparent);
    outline-offset: 2px;
  }
`;
