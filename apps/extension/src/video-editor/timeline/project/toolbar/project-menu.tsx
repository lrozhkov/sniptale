import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, Copy, FilePlus2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductDropdownMenu,
  ProductDropdownItem,
  ProductDropdownDivider,
} from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectLayout } from '@sniptale/ui/glass-select/layout';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { isComposedEventWithinElement } from '@sniptale/ui/dom-events';
import { translate } from '../../../../platform/i18n';
import { useVideoEditorProjectMenuController } from '../../../runtime/controller/composition/hooks';
import { useProjectTransitionPending } from '../../../runtime/commands/project-transition';
import { toolbarIconButtonClassName } from './sections/constants/button';
import { ProjectNameDialog } from './project-dialog';

export function ProjectMenu(props: { projectName: string; onExport: () => void }) {
  const commands = useVideoEditorProjectMenuController();
  const pending = useProjectTransitionPending();
  const [mode, setMode] = useState<'new' | 'copy' | null>(null);
  const { open, setOpen, root, trigger, menu, portalStyle, theme, close } = useProjectMenuPopup();
  const choose = (next: 'new' | 'copy') => {
    close();
    setMode(next);
  };
  return (
    <div ref={root}>
      <ContentToolbarButton
        ref={trigger}
        className={toolbarIconButtonClassName}
        title={translate('videoEditor.app.projectMenu')}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={pending}
        onClick={() => setOpen(!open)}
        dataUi="video-editor.timeline.toolbar.project-menu"
        menuIndicator
      >
        <Clapperboard aria-hidden="true" />
      </ContentToolbarButton>
      {open
        ? createPortal(
            <div ref={menu} style={portalStyle} data-theme={theme ?? undefined}>
              <ProductDropdownMenu
                style={{ position: 'relative', top: 'auto', left: 'auto', width: '100%' }}
              >
                <ProductDropdownItem onClick={() => choose('new')}>
                  <FilePlus2 size={16} />
                  {translate('videoEditor.app.newProjectAction')}
                </ProductDropdownItem>
                <ProductDropdownItem onClick={() => choose('copy')}>
                  <Copy size={16} />
                  {translate('videoEditor.app.copyProjectAction')}
                </ProductDropdownItem>
                <ProductDropdownDivider />
                <ProductDropdownItem
                  onClick={() => {
                    close();
                    props.onExport();
                  }}
                >
                  <Clapperboard size={16} />
                  {translate('videoEditor.app.exportButton')}
                </ProductDropdownItem>
              </ProductDropdownMenu>
            </div>,
            resolveThemeSafePortalTarget(trigger.current)
          )
        : null}
      {mode
        ? createPortal(
            <ProjectNameDialog
              copy={mode === 'copy'}
              projectName={props.projectName}
              onCreate={commands.onCreateProject}
              onVisibilityChange={commands.onDialogVisibilityChange}
              onClose={() => {
                setMode(null);
                trigger.current?.focus();
              }}
            />,
            resolveThemeSafePortalTarget(trigger.current)
          )
        : null}
    </div>
  );
}

function useProjectMenuPopup() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { portalStyle } = useGlassSelectLayout({
    portal: true,
    isOpen: open,
    containerRef: root,
    menuRef: menu,
    menuWidth: 240,
  });
  const theme = useResolvedPortalTheme(trigger.current);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !isComposedEventWithinElement(event, root.current) &&
        !isComposedEventWithinElement(event, menu.current)
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = [...(menu.current?.querySelectorAll('button') ?? [])];
        const index = buttons.findIndex((button) => button === document.activeElement);
        event.preventDefault();
        const next =
          index < 0
            ? 0
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return { open, setOpen, root, trigger, menu, portalStyle, theme, close };
}
