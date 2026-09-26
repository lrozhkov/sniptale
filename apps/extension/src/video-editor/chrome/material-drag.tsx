import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { VideoProject } from '../../features/video/project/types';
import type { VideoEditorMaterialTarget } from '../contracts/insertion';
import { translate } from '../../platform/i18n';
import { placeMaterialWithTelemetry } from '../runtime/commands/material-placement';
import {
  getCurrentVideoEditorProjectSnapshot,
  useVideoEditorTimelineEditingPort,
} from '../runtime/controller/store';

const MATERIAL_MIME = 'application/x-sniptale-material';
interface MaterialDrag {
  assetId: string;
  project: VideoProject;
  token: string;
  source: HTMLElement;
}
const Context = createContext<{
  drag: MaterialDrag | null;
  pending: boolean;
  start(assetId: string, source: HTMLElement, transfer: DataTransfer): void;
  accepts(transfer: DataTransfer, dropping?: boolean): boolean;
  drop(target: VideoEditorMaterialTarget): void;
}>({
  drag: null,
  pending: false,
  start: () => undefined,
  accepts: () => false,
  drop: () => undefined,
});

/** Owns one local drag and its asynchronous placement, including cancellation and focus. */
export function MaterialDragProvider({ children }: { children: ReactNode }) {
  const place = useVideoEditorTimelineEditingPort((port) => port.placeMaterial);
  const [drag, setDrag] = useState<MaterialDrag | null>(null);
  const active = useRef<MaterialDrag | null>(null);
  const request = useRef<AbortController | null>(null);
  const pendingSource = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const end = () => {
      active.current?.source.focus();
      active.current = null;
      setDrag(null);
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!active.current && !request.current)) return;
      event.preventDefault();
      event.stopPropagation();
      request.current?.abort();
      request.current = null;
      pendingSource.current?.focus();
      pendingSource.current = null;
      setPending(false);
      end();
    };
    window.addEventListener('dragend', end, true);
    window.addEventListener('keydown', cancel, true);
    return () => {
      request.current?.abort();
      request.current = null;
      window.removeEventListener('dragend', end, true);
      window.removeEventListener('keydown', cancel, true);
    };
  }, []);
  const start = (assetId: string, source: HTMLElement, transfer: DataTransfer) => {
    const project = getCurrentVideoEditorProjectSnapshot();
    if (request.current || !project?.assets.some((asset) => asset.id === assetId)) return;
    const session = { assetId, project, source, token: crypto.randomUUID() };
    transfer.setData(MATERIAL_MIME, session.token);
    transfer.effectAllowed = 'copy';
    active.current = session;
    setDrag(session);
    setFailed(false);
  };
  const accepts = (transfer: DataTransfer, dropping = false) => {
    const session = active.current;
    return Boolean(
      session &&
      getCurrentVideoEditorProjectSnapshot() === session.project &&
      transfer.types.includes(MATERIAL_MIME) &&
      (!dropping || transfer.getData(MATERIAL_MIME) === session.token)
    );
  };
  const drop = async (target: VideoEditorMaterialTarget) => {
    const session = active.current;
    if (!session || request.current) return;
    active.current = null;
    setDrag(null);
    const controller = new AbortController();
    request.current = controller;
    pendingSource.current = session.source;
    setPending(true);
    try {
      const result = await placeMaterialWithTelemetry({
        assetId: session.assetId,
        signal: controller.signal,
        getProject: getCurrentVideoEditorProjectSnapshot,
        getCurrentTime: () => 0,
        place: (assetId, _range, telemetry) =>
          getCurrentVideoEditorProjectSnapshot() === session.project
            ? place(assetId, target, telemetry)
            : { status: 'rejected', reason: 'missing-material' },
      });
      if (!controller.signal.aborted) setFailed(result.status === 'rejected');
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        pendingSource.current = null;
        session.source.focus();
        setPending(false);
      }
    }
  };
  return (
    <Context.Provider
      value={{
        drag,
        pending,
        start,
        accepts,
        drop: (target) => {
          void drop(target);
        },
      }}
    >
      {children}
      {pending && <p role="status">{translate('common.states.loading')}</p>}
      {failed && <p role="alert">{translate('common.errors.actionFailed')}</p>}
    </Context.Provider>
  );
}

export function useMaterialDrag() {
  return useContext(Context);
}
