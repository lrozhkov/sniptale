import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { Ref } from 'react';

export function SettingsSubpageTabs(props: {
  activeId: string;
  ariaLabel: string;
  disabled?: boolean;
  items: readonly { id: string; label: string }[];
  navRef?: Ref<HTMLElement>;
  onChange?: ((id: string) => void) | undefined;
  placement?: 'inline' | 'sticky';
}) {
  const sticky = props.placement !== 'inline';
  return (
    <nav
      ref={props.navRef}
      aria-label={props.ariaLabel}
      data-ui="settings.subpage-tabs"
      data-sticky={sticky ? 'true' : undefined}
      className={[
        'flex flex-nowrap gap-1 overflow-x-auto',
        sticky
          ? [
              'sticky z-20 border-b border-[var(--sniptale-color-border-soft)]',
              '-top-[var(--settings-scroll-inset-top,0px)]',
              '-mt-[var(--settings-scroll-inset-top,0px)]',
              'pt-[var(--settings-scroll-inset-top,0px)]',
              '-mx-[var(--settings-scroll-inset-x,0px)]',
              'px-[var(--settings-scroll-inset-x,0px)]',
            ].join(' ')
          : '',
      ].join(' ')}
      style={
        sticky
          ? {
              backgroundColor: 'var(--sniptale-color-surface-canvas)',
              backgroundImage:
                'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
            }
          : undefined
      }
    >
      {props.items.map((item) => {
        const active = props.activeId === item.id;
        return (
          <ContentToolbarButton
            tone="outline"
            active={active}
            title={item.label}
            key={item.id}
            type="button"
            disabled={props.disabled}
            aria-current={active ? 'page' : undefined}
            onClick={() => props.onChange?.(item.id)}
            className={[
              'relative !h-8 min-h-8 !w-auto flex-none whitespace-nowrap rounded-[4px] !px-3 !py-1',
              '!border-transparent !bg-transparent text-[13px] leading-[18px] font-normal',
              'transition-colors',
              'focus-visible:outline-none focus-visible:text-[var(--sniptale-color-text-primary)]',
              active
                ? [
                    'font-medium text-[var(--sniptale-color-text-primary)]',
                    '[--sniptale-control-font-weight:var(--sniptale-control-font-weight-active)]',
                    '[--sniptale-control-font-weight-hover:var(--sniptale-control-font-weight-active)]',
                    "after:!block after:!content-[''] after:pointer-events-none",
                    'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
                    'after:bg-[var(--sniptale-color-accent)]',
                  ].join(' ')
                : [
                    'text-[var(--sniptale-color-text-secondary)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' '),
            ].join(' ')}
          >
            {item.label}
          </ContentToolbarButton>
        );
      })}
    </nav>
  );
}
