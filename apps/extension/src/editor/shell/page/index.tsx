import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EDITOR_BOOTSTRAP_EVENT } from '@sniptale/ui/branding';
import { isEditorBootstrapPayload } from '../../../features/editor/contracts/bootstrap';
import { readEditorEmbedMode } from '../../../features/editor/contracts/embed';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { EditorControllerProvider } from '../../application/controller-context';
import { EditorEmbedProvider } from '../../application/embed-context/context';
import {
  bootstrapEditorPageSession,
  createEditorPageServices,
  flushEditorAutosaveIfNeeded,
  loadEditorPageDefaults,
  openEditorBootstrapPayload,
  type EditorPageServices,
} from './runtime';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorPageEmbedProviderValue } from './embed';
import { EditorPageLayout } from './layout';
import { useEditorDrawingPreferencesSynchronization } from '../../drawing/preferences';

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
  const embedProps = createEditorPageEmbedProviderValue(embedMode, services.controller);

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });

  useEditorPageBootstrapEffects(hasImageRef, setPageTitle, services);
  useEditorDrawingPreferencesSynchronization();
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
