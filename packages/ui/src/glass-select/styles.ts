function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

const GLASS_SELECT_POPUP_TRIGGER_SURFACE_CLASS_NAME = [
  'bg-[linear-gradient(180deg,',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,var(--sniptale-color-surface-canvas)_2%),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,var(--sniptale-color-surface-canvas)_6%))]',
].join('');

const GLASS_SELECT_PANEL_TRIGGER_SURFACE_CLASS_NAME = [
  'bg-[linear-gradient(180deg,',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_99%,var(--sniptale-color-surface-canvas)_1%),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%))]',
].join('');

const GLASS_SELECT_ACCENT_RING_CLASS_NAME =
  'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_20%,transparent)]';

const GLASS_SELECT_MENU_POPUP_SURFACE_CLASS_NAME = [
  'bg-[linear-gradient(180deg,',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_99%,var(--sniptale-color-surface-canvas)_1%),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)),',
  'var(--sniptale-color-surface-canvas)]',
].join('');

const GLASS_SELECT_MENU_PANEL_SURFACE_CLASS_NAME = [
  'bg-[linear-gradient(180deg,',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_100%,var(--sniptale-color-surface-canvas)_0%),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_97%,var(--sniptale-color-surface-canvas)_3%)),',
  'var(--sniptale-color-surface-canvas)]',
].join('');

const GLASS_SELECT_MENU_PANEL_SHADOW_CLASS_NAME = [
  'shadow-[0_20px_32px_color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent),',
  'var(--sniptale-shadow-sm),',
  'inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_74%,transparent)]',
].join('');

const GLASS_SELECT_MENU_SELECTED_POPUP_CLASS_NAME = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_70%,var(--sniptale-color-surface-panel)_30%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_20%,transparent)]',
].join(' ');

const GLASS_SELECT_MENU_HOVER_POPUP_CLASS_NAME =
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_82%,var(--sniptale-color-surface-panel)_18%)]';

const GLASS_SELECT_MENU_HOVER_PANEL_CLASS_NAME =
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_84%,var(--sniptale-color-surface-panel)_16%)]';
const GLASS_SELECT_POPUP_ACCENT_BORDER_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,',
  'var(--sniptale-color-accent)_18%,',
  'var(--sniptale-color-border-soft)_82%)]',
].join('');
const GLASS_SELECT_POPUP_FOCUS_BORDER_CLASS_NAME = [
  'focus-visible:border-[color:color-mix(in_srgb,',
  'var(--sniptale-color-accent)_18%,',
  'var(--sniptale-color-border-soft)_82%)]',
].join('');

export const GLASS_SELECT_ANIMATION_CSS = `
  @keyframes glassSelectIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .animate-glassSelectIn {
    animation: glassSelectIn 0.15s ease-out;
  }
`;

function getPopupTriggerClassName(disabled: boolean, isOpen: boolean, sizeClasses: string) {
  return joinClassNames(
    'w-full flex items-center justify-between rounded-[12px]',
    'text-left outline-none transition-all',
    'border border-[color:transparent] bg-[color:transparent] shadow-none',
    sizeClasses,
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : joinClassNames(
          'cursor-pointer',
          'hover:border-[var(--sniptale-color-border-soft)]',
          'hover:border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
          `hover:${GLASS_SELECT_POPUP_TRIGGER_SURFACE_CLASS_NAME}`,
          [
            'hover:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary)_5%,transparent),',
            '0_10px_24px_color-mix(in_srgb,var(--sniptale-color-overlay)_10%,transparent)]',
          ].join(''),
          `focus-visible:${GLASS_SELECT_POPUP_TRIGGER_SURFACE_CLASS_NAME}`,
          [
            'focus-visible:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary)_5%,transparent),',
            '0_10px_24px_color-mix(in_srgb,var(--sniptale-color-overlay)_10%,transparent),',
            '0_0_0_3px_color-mix(in_srgb,var(--sniptale-color-accent)_6%,transparent)]',
          ].join(''),
          GLASS_SELECT_POPUP_FOCUS_BORDER_CLASS_NAME,
          'focus-visible:border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]'
        ),
    isOpen
      ? joinClassNames(
          GLASS_SELECT_POPUP_TRIGGER_SURFACE_CLASS_NAME,
          GLASS_SELECT_POPUP_ACCENT_BORDER_CLASS_NAME,
          'border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
          [
            'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary)_5%,transparent),',
            '0_10px_24px_color-mix(in_srgb,var(--sniptale-color-overlay)_10%,transparent),',
            '0_0_0_3px_color-mix(in_srgb,var(--sniptale-color-accent)_6%,transparent)]',
          ].join('')
        )
      : ''
  );
}

function getPanelTriggerClassName(disabled: boolean, isOpen: boolean, sizeClasses: string) {
  return joinClassNames(
    'w-full flex items-center justify-between',
    'border border-[color:transparent] bg-[color:transparent] shadow-none',
    'rounded-md',
    'text-left transition-all outline-none',
    sizeClasses,
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : joinClassNames(
          'cursor-pointer',
          'hover:border-[var(--sniptale-color-border-strong)]',
          'hover:border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
          `hover:${GLASS_SELECT_PANEL_TRIGGER_SURFACE_CLASS_NAME}`,
          GLASS_SELECT_MENU_HOVER_PANEL_CLASS_NAME
        ),
    joinClassNames(
      'focus-visible:border-[var(--sniptale-color-border-accent-strong)]',
      'focus-visible:border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
      `focus-visible:${GLASS_SELECT_PANEL_TRIGGER_SURFACE_CLASS_NAME}`,
      GLASS_SELECT_ACCENT_RING_CLASS_NAME,
      [
        'focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_55%,transparent),',
        '0_10px_24px_color-mix(in_srgb,var(--sniptale-color-overlay)_8%,transparent)]',
      ].join(' ')
    ),
    isOpen
      ? joinClassNames(
          GLASS_SELECT_PANEL_TRIGGER_SURFACE_CLASS_NAME,
          'border-[var(--sniptale-color-border-accent-strong)]',
          'border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
          'ring-2',
          'ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_20%,transparent)]',
          [
            'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_55%,transparent),',
            '0_10px_24px_color-mix(in_srgb,var(--sniptale-color-overlay)_8%,transparent)]',
          ].join(' ')
        )
      : ''
  );
}

export function getGlassSelectTriggerClassName({
  disabled,
  isOpen,
  isPopupFlat,
  sizeClasses,
}: {
  disabled: boolean;
  isOpen: boolean;
  isPopupFlat: boolean;
  sizeClasses: string;
}) {
  if (isPopupFlat) {
    return getPopupTriggerClassName(disabled, isOpen, sizeClasses);
  }

  return getPanelTriggerClassName(disabled, isOpen, sizeClasses);
}

export function getGlassSelectMenuSurfaceClassName(isPopupFlat: boolean) {
  return isPopupFlat
    ? joinClassNames(
        GLASS_SELECT_MENU_POPUP_SURFACE_CLASS_NAME,
        'border border-[var(--sniptale-color-border-soft)] rounded-[12px]',
        'border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
        'backdrop-blur-[18px]',
        'overflow-hidden',
        [
          'shadow-[0_20px_32px_color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent),',
          'var(--sniptale-shadow-sm),',
          'inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_60%,transparent)]',
        ].join('')
      )
    : joinClassNames(
        GLASS_SELECT_MENU_PANEL_SURFACE_CLASS_NAME,
        'border border-[var(--sniptale-color-border-soft)]',
        'border-t-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,white_30%)]',
        'backdrop-blur-[18px]',
        'rounded-lg',
        GLASS_SELECT_MENU_PANEL_SHADOW_CLASS_NAME
      );
}

export function getGlassSelectChevronClassName(isOpen: boolean) {
  return joinClassNames(
    'absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2',
    'text-[var(--sniptale-color-text-dim)] transition-transform duration-200',
    isOpen ? 'rotate-180' : ''
  );
}

export function getGlassSelectMenuClassName({
  isPopupFlat,
  isSelected,
  isDisabled,
  isFirst,
  isLast,
  size,
}: {
  isPopupFlat: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  size: 'sm' | 'md';
}) {
  return joinClassNames(
    [
      'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left',
      'transition-colors duration-100',
    ].join(' '),
    size === 'sm' ? 'min-h-10 py-2 text-xs' : 'min-h-11 text-sm',
    isFirst ? (isPopupFlat ? 'rounded-t-[11px]' : 'rounded-t-md') : '',
    isLast ? (isPopupFlat ? 'rounded-b-[11px]' : 'rounded-b-md') : '',
    isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
    isPopupFlat
      ? isSelected
        ? joinClassNames(
            GLASS_SELECT_MENU_SELECTED_POPUP_CLASS_NAME,
            'text-[var(--sniptale-color-text-primary-strong)]'
          )
        : joinClassNames(
            'text-[var(--sniptale-color-text-primary)]',
            GLASS_SELECT_MENU_HOVER_POPUP_CLASS_NAME,
            'hover:text-[var(--sniptale-color-text-primary-strong)]'
          )
      : isSelected
        ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent-emphasis)]'
        : joinClassNames(
            'text-[var(--sniptale-color-text-primary)]',
            GLASS_SELECT_MENU_HOVER_PANEL_CLASS_NAME,
            'hover:text-[var(--sniptale-color-text-primary-strong)]'
          )
  );
}

export function getGlassSelectCheckClassName(isPopupFlat: boolean) {
  return isPopupFlat
    ? 'h-4 w-4 flex-shrink-0 text-[var(--sniptale-color-text-primary)]'
    : 'h-4 w-4 flex-shrink-0 text-[var(--sniptale-color-accent)]';
}
