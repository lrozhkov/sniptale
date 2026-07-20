import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { EditorEmbedMessage } from '../../../features/editor/contracts/embed';
import { isEditorEmbedMessage } from '../../../features/editor/contracts/embed';
import { translate } from '../../../platform/i18n';
import type { EmbeddedEditorState } from './ScenarioEmbeddedEditorHost.view';

export interface ScenarioEmbeddedEditorApplyPayload {
  dataUrl: string;
  document: EditorDocument;
}

interface ScenarioEmbeddedEditorRuntimeArgs {
  createIframeUrl: () => Promise<string>;
  onApply: (payload: ScenarioEmbeddedEditorApplyPayload) => Promise<void>;
  onClose: () => void;
}

function isOwnedEditorEmbedEvent(
  event: MessageEvent,
  iframeRef: RefObject<HTMLIFrameElement | null>
): event is MessageEvent<EditorEmbedMessage> {
  return (
    event.origin === window.location.origin &&
    Object.is(event.source, iframeRef.current?.contentWindow) &&
    isEditorEmbedMessage(event.data)
  );
}

function createInitialState(): EmbeddedEditorState {
  return {
    error: null,
    iframeUrl: null,
    loading: true,
    saving: false,
  };
}

function setEmbeddedEditorSaving(setState: Dispatch<SetStateAction<EmbeddedEditorState>>) {
  setState((current) => ({ ...current, error: null, saving: true }));
}

function setEmbeddedEditorSaveError(
  setState: Dispatch<SetStateAction<EmbeddedEditorState>>,
  error: unknown
) {
  setState((current) => ({
    ...current,
    error: error instanceof Error ? error.message : translate('editor.runtime.saveImageFailed'),
    saving: false,
  }));
}

function clearEmbeddedEditorSaving(setState: Dispatch<SetStateAction<EmbeddedEditorState>>) {
  setState((current) => ({ ...current, saving: false }));
}

function useScenarioEmbeddedEditorFrame(createIframeUrl: () => Promise<string>) {
  const [state, setState] = useState<EmbeddedEditorState>(createInitialState);

  useEffect(() => {
    let cancelled = false;

    setState(createInitialState());
    void createIframeUrl()
      .then((iframeUrl) => {
        if (!cancelled) {
          setState((current) => ({ ...current, iframeUrl, loading: false }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            error:
              error instanceof Error ? error.message : translate('shared.runtime.readBlobFailed'),
            iframeUrl: null,
            loading: false,
            saving: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [createIframeUrl]);

  return { setState, state };
}

function useScenarioEmbeddedEditorMessages(args: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onApply: (payload: ScenarioEmbeddedEditorApplyPayload) => Promise<void>;
  onClose: () => void;
  setState: Dispatch<SetStateAction<EmbeddedEditorState>>;
}) {
  const { iframeRef, onApply, onClose, setState } = args;

  useEffect(() => {
    let cancelled = false;
    const handleMessage = (event: MessageEvent) => {
      if (!isOwnedEditorEmbedEvent(event, iframeRef)) {
        return;
      }
      if (event.data.type === 'scenario-close') {
        onClose();
        return;
      }

      setEmbeddedEditorSaving(setState);
      void onApply({ dataUrl: event.data.dataUrl, document: event.data.document })
        .then(() => {
          if (!cancelled) {
            clearEmbeddedEditorSaving(setState);
            onClose();
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setEmbeddedEditorSaveError(setState, error);
          }
        });
    };

    window.addEventListener('message', handleMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', handleMessage);
    };
  }, [iframeRef, onApply, onClose, setState]);
}

export function useScenarioEmbeddedEditorRuntime(args: ScenarioEmbeddedEditorRuntimeArgs) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { setState, state } = useScenarioEmbeddedEditorFrame(args.createIframeUrl);

  useScenarioEmbeddedEditorMessages({
    iframeRef,
    onApply: args.onApply,
    onClose: args.onClose,
    setState,
  });

  return {
    assignIframeRef: (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
    },
    state,
  };
}
