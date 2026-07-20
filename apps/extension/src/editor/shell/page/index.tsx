import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EDITOR_BOOTSTRAP_EVENT } from '@sniptale/ui/branding';
import { isEditorBootstrapPayload } from '../../../features/editor/contracts/bootstrap';
import {
  createScenarioEditorEmbedCloseMessage,
  readEditorEmbedMode,
} from '../../../features/editor/contracts/embed';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { EditorControllerProvider } from '../../application/controller-context';
import { EditorCommandPalette } from '../command-palette';
import { CanvasWrapper } from '../../workspace/canvas';
import {
  EDITOR_CANVAS_CONTEXT_MENU_DATA_UI,
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
} from '../../workspace/canvas/context-menu/types';
import { EditorEmbedProvider } from '../../application/embed-context/context';
import { EditorFloatingWorkspace } from '../../workspace/floating';
import {
  bootstrapEditorPageSession,
  createEditorPageServices,
  flushEditorAutosaveIfNeeded,
  loadEditorPageDefaults,
  openEditorBootstrapPayload,
  type EditorPageServices,
} from './runtime';
import { useEditorStore } from '../../state/useEditorStore';
import { saveEditorRenderedImage } from '../../document/file-actions';

const EDITOR_PAGE_ROOT_CLASS_NAME = [
  'sniptale-extension-surface relative h-screen min-h-0 overflow-hidden',
  'bg-[var(--sniptale-color-surface-canvas)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const EDITOR_CANVAS_CONTEXT_MENU_SELECTOR = [
  `[data-ui="${EDITOR_CANVAS_CONTEXT_MENU_DATA_UI}"]`,
  `[data-ui="${EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI}"]`,
  `[data-ui="${EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI}"]`,
].join(', ');

function shouldAllowEditorPageContextMenu(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(EDITOR_CANVAS_CONTEXT_MENU_SELECTOR));
}

function handleEditorPageContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
  if (shouldAllowEditorPageContextMenu(event.target)) {
    return;
  }

  event.preventDefault();
}

function createEditorPageBootstrapLifecycle(args: {
  services: EditorPageServices;
  setPageTitle: (pageTitle: string) => void;
}) {
  let cancelled = false;
  const request = {
    isCancelled: () => cancelled,
    setPageTitle: args.setPageTitle,
  };
  const handleBootstrap = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const detail: unknown = event.detail;
    if (isEditorBootstrapPayload(detail)) {
      void openEditorBootstrapPayload(detail, request, args.services);
    }
  };

  return {
    handleBootstrap,
    request,
    cancel: () => {
      cancelled = true;
    },
  };
}

function useEditorPageBootstrapEffects(
  hasImageRef: React.MutableRefObject<boolean>,
  setPageTitle: (pageTitle: string) => void,
  services: EditorPageServices
) {
  useEffect(() => {
    const lifecycle = createEditorPageBootstrapLifecycle({ services, setPageTitle });

    window.addEventListener(EDITOR_BOOTSTRAP_EVENT, lifecycle.handleBootstrap);
    void bootstrapEditorPageSession(lifecycle.request, services);

    return () => {
      lifecycle.cancel();
      window.removeEventListener(EDITOR_BOOTSTRAP_EVENT, lifecycle.handleBootstrap);
    };
  }, [services, setPageTitle]);

  useEffect(() => {
    const handlePageHide = () => flushEditorAutosaveIfNeeded(services, () => hasImageRef.current);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushEditorAutosaveIfNeeded(services, () => hasImageRef.current);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasImageRef, services]);
}

function useEditorPageDefaultEffects(
  hydrateDefaults: Parameters<typeof loadEditorPageDefaults>[0],
  hydrateWorkspaceDefaults: Parameters<typeof loadEditorPageDefaults>[1]
) {
  useEffect(() => {
    loadEditorPageDefaults(hydrateDefaults, hydrateWorkspaceDefaults);
  }, [hydrateDefaults, hydrateWorkspaceDefaults]);
}

function useEditorPageStoreSelection() {
  return useEditorStore(
    useShallow((state) => ({
      imageData: state.imageData,
      hydrateDefaults: state.hydrateDefaults,
      hydrateWorkspaceDefaults: state.hydrateWorkspaceDefaults,
      setPageTitle: state.setPageTitle,
    }))
  );
}

function useEditorPageServiceDisposal(services: EditorPageServices) {
  useEffect(() => {
    return () => {
      services.autosaveService.dispose();
      services.controller.dispose();
    };
  }, [services]);
}

function useEditorEmbedProviderValue(
  embedMode: ReturnType<typeof readEditorEmbedMode>,
  services: EditorPageServices
) {
  if (embedMode !== 'scenario') {
    return {
      mode: null,
      onApply: null,
      onClose: null,
    };
  }

  return {
    mode: embedMode,
    onApply: async () => saveEditorRenderedImage(services.controller),
    onClose: () =>
      window.parent.postMessage(createScenarioEditorEmbedCloseMessage(), window.location.origin),
  };
}

function EditorPageLayout(props: {
  commandPaletteOpen: boolean;
  hasImage: boolean;
  onCloseCommandPalette: () => void;
  afterLayout?: React.ReactNode;
}) {
  return (
    <div
      data-ui="editor.page.root"
      className={EDITOR_PAGE_ROOT_CLASS_NAME}
      onContextMenuCapture={handleEditorPageContextMenuCapture}
    >
      <div className="absolute inset-0 min-h-0 min-w-0" data-ui="editor.canvas.layer">
        <CanvasWrapper hasImage={props.hasImage} />
      </div>
      <EditorFloatingWorkspace hasImage={props.hasImage} />
      <EditorCommandPalette
        hasImage={props.hasImage}
        isOpen={props.commandPaletteOpen}
        onClose={props.onCloseCommandPalette}
      />
      {props.afterLayout}
    </div>
  );
}

export const EditorPage: React.FC<{ afterLayout?: React.ReactNode }> = ({ afterLayout }) => {
  usePageLocaleMetadata('editor.page.documentTitle');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const servicesRef = useRef<EditorPageServices | null>(null);
  if (!servicesRef.current) {
    servicesRef.current = createEditorPageServices();
  }
  const services = servicesRef.current;

  const { imageData, hydrateDefaults, hydrateWorkspaceDefaults, setPageTitle } =
    useEditorPageStoreSelection();
  const hasImage = Boolean(imageData);
  const hasImageRef = useRef(hasImage);
  hasImageRef.current = hasImage;
  const embedMode = readEditorEmbedMode(window.location.search);
  const embedProps = useEditorEmbedProviderValue(embedMode, services);

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });

  useEditorPageBootstrapEffects(hasImageRef, setPageTitle, services);
  useEditorPageDefaultEffects(hydrateDefaults, hydrateWorkspaceDefaults);
  useEditorPageServiceDisposal(services);

  return (
    <EditorControllerProvider controller={services.controller}>
      <EditorEmbedProvider {...embedProps}>
        <EditorPageLayout
          afterLayout={afterLayout}
          commandPaletteOpen={commandPaletteOpen}
          hasImage={hasImage}
          onCloseCommandPalette={() => setCommandPaletteOpen(false)}
        />
      </EditorEmbedProvider>
    </EditorControllerProvider>
  );
};
