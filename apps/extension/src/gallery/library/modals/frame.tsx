import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

const modalBackdropClassName =
  'fixed inset-0 z-50 flex items-center justify-center ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_68%,black_18%)] ' +
  'px-5';

const modalPanelBaseClassName =
  'border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] ' +
  'p-6 text-[var(--sniptale-color-text-primary)] shadow-sm';

const modalBadgeBaseClassName =
  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]';

const modalCloseButtonClassName =
  'rounded-full border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] ' +
  'p-2 text-[var(--sniptale-color-text-muted)] transition hover:border-[var(--sniptale-color-border-strong)] ' +
  'hover:text-[var(--sniptale-color-text-primary)]';

interface GalleryModalFrameProps {
  badgeIcon: LucideIcon;
  badgeLabel: string;
  badgeClassName: string;
  title: string;
  description: string;
  maxWidthClassName: string;
  panelClassName?: string;
  titleClassName?: string;
  onClose: () => void;
  children: ReactNode;
}

export function GalleryModalFrame({
  badgeIcon: BadgeIcon,
  badgeLabel,
  badgeClassName,
  title,
  description,
  maxWidthClassName,
  panelClassName,
  titleClassName,
  onClose,
  children,
}: GalleryModalFrameProps) {
  return (
    <div className={modalBackdropClassName}>
      <div
        className={`w-full ${maxWidthClassName} ${modalPanelBaseClassName} ${panelClassName ?? 'rounded-[16px]'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`${modalBadgeBaseClassName} ${badgeClassName}`}>
              <BadgeIcon className="h-3.5 w-3.5" />
              {badgeLabel}
            </div>
            <h2 className={`mt-3 font-semibold ${titleClassName ?? 'text-3xl'}`}>{title}</h2>
            <p className="mt-2 text-sm text-[var(--sniptale-color-text-secondary)]">
              {description}
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClassName}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
