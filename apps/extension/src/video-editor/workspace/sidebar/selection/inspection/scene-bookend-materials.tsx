import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, Image, Plus } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownMenu, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';

/** One material menu owns placement, focus, dismissal and theme for both insertion contexts. */
export function SceneBookendMaterials(props: {
  project: VideoProject;
  label: string;
  kind?: 'image' | 'video';
  onChoose(assetId: string): void;
}) {
  const [openedProject, setOpenedProject] = useState<VideoProject | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<'first' | 'last'>('first');
  const id = useId();
  const open = openedProject === props.project;
  const assets = props.project.assets.filter((asset) =>
    props.kind === 'image'
      ? asset.type === 'IMAGE'
      : props.kind === 'video'
        ? asset.type === 'VIDEO' || asset.type === 'RECORDING'
        : asset.type !== 'AUDIO'
  );
  const label = props.label;
  const setVisible = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const visible = typeof next === 'function' ? next(open) : next;
      if (!visible && menu.current?.contains(document.activeElement))
        trigger.current?.focus({ preventScroll: true });
      setOpenedProject(visible ? props.project : null);
    },
    [open, props.project]
  );
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: setVisible,
    containerRef: root,
    menuRef: menu,
    menuWidth: 280,
  });
  const theme = useResolvedPortalTheme(trigger.current);
  useEffect(() => {
    if (!open) return;
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    const target = firstFocus.current === 'last' ? buttons?.[buttons.length - 1] : buttons?.[0];
    target?.focus({ preventScroll: true });
  }, [open]);
  return (
    <div ref={root} className="min-w-0" data-ui="video-editor.scene-bookends.picker">
      <ContentToolbarButton
        ref={trigger}
        type="button"
        tone="outline"
        size="compact"
        className="flex max-w-full items-center gap-1.5"
        aria-label={label}
        title={assets.length ? label : translate('videoEditor.sidebar.bookendNoMaterials')}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        disabled={!assets.length}
        onClick={() => {
          firstFocus.current = 'first';
          setVisible(!open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
          setVisible(true);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {label}
      </ContentToolbarButton>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="sniptale-compact-workspace sniptale-extension-surface"
            id={id}
            data-theme={theme ?? undefined}
            style={portalStyle}
            data-ui="video-editor.scene-bookends.materials"
            onKeyDown={(event) => {
              if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                }
                setVisible(false);
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const buttons = [
                ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
              ];
              const index = buttons.findIndex((button) => button === document.activeElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }}
          >
            <BookendMaterialsMenu
              assets={assets}
              label={label}
              onChoose={(assetId) => {
                setVisible(false);
                props.onChoose(assetId);
              }}
            />
          </div>,
          resolveThemeSafePortalTarget(trigger.current)
        )}
    </div>
  );
}

function BookendMaterialsMenu(props: {
  assets: VideoProject['assets'];
  label: string;
  onChoose: (assetId: string) => void;
}) {
  return (
    <ProductDropdownMenu
      role="menu"
      aria-label={props.label}
      className={[
        '!relative !inset-auto !m-0 !w-full !min-w-0',
        '!max-h-[min(320px,calc(100vh-32px))] !rounded-[4px] !p-[5px]',
        'grid gap-0.5 overflow-y-auto',
      ].join(' ')}
    >
      {props.assets.map((asset) => {
        const Icon = asset.type === 'IMAGE' ? Image : Film;
        return (
          <ProductDropdownItem
            key={asset.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="min-w-0 w-full !min-h-8 !rounded-[4px] !px-2 !py-1.5"
            title={asset.name}
            onClick={() => props.onChoose(asset.id)}
          >
            <Icon size={16} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 truncate">{asset.name}</span>
          </ProductDropdownItem>
        );
      })}
    </ProductDropdownMenu>
  );
}
