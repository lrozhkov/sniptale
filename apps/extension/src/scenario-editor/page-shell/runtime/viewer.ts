import {
  readScenarioViewingAsset,
  readScenarioViewingSnapshot,
} from '../../../composition/persistence/scenario/projects/viewing';
import type { Translate } from '../../../platform/i18n';
import { prepareGuideHtml } from './html-export';
import { prepareTourHtml } from './tour-html';
import { tourPlayerLabels } from '../tour/labels';
import { readScenarioHtmlArtifact } from '../../../composition/persistence/scenario/export-artifacts';

/** A missing view belongs to the editor; malformed view routes never mount editing. */
export function readScenarioViewRoute(search: string) {
  const params = new URLSearchParams(search);
  if (!params.has('view')) return null;
  const mode = params.get('view');
  const projectId = params.get('projectId');
  if (mode === 'export') {
    const exportId = params.get('exportId');
    if (
      !exportId ||
      params.getAll('exportId').length !== 1 ||
      params.getAll('view').length !== 1 ||
      params.has('projectId') ||
      params.has('stepId')
    )
      return { mode: 'invalid' } as const;
    return { mode, exportId } as const;
  }
  if (
    (mode !== 'guide' && mode !== 'tour') ||
    !projectId ||
    params.getAll('view').length !== 1 ||
    params.getAll('projectId').length !== 1 ||
    params.has('exportId')
  )
    return { mode: 'invalid' } as const;
  return { mode, projectId } as const;
}

/** Detaches one committed revision; viewing cannot invoke the editor or export ledger. */
export async function prepareScenarioView(
  args: (
    | {
        projectId: string;
        mode: 'guide' | 'tour';
      }
    | { exportId: string; mode: 'export' }
  ) & {
    t: Translate;
    theme: 'light' | 'dark';
    signal: AbortSignal;
  }
) {
  args.signal.throwIfAborted();
  if (args.mode === 'export') {
    const artifact = await readScenarioHtmlArtifact(args.exportId);
    args.signal.throwIfAborted();
    if (!artifact?.entry.html) return { status: 'missing-file' } as const;
    const mode = artifact.entry.html.mode;
    const scriptHash =
      mode === 'guide'
        ? await (await import('../html-document')).getGuideHtmlRuntimeHash()
        : await (
            await import('../../../features/scenario/tour-player/document')
          ).getTourPlayerRuntimeHash();
    args.signal.throwIfAborted();
    return {
      status: 'ready',
      blob: artifact.blob,
      name: artifact.entry.filename,
      revision: artifact.entry.createdAt,
      mode,
      scriptHash,
    } as const;
  }
  const snapshot = await readScenarioViewingSnapshot(args.projectId);
  args.signal.throwIfAborted();
  if (!snapshot) return { status: 'unavailable' } as const;
  const { project, revision } = snapshot;
  if (args.mode === 'guide' ? !project.items.length : !project.tour?.slides.length)
    return { status: 'empty', name: project.name } as const;
  const readAsset = (id: string) => readScenarioViewingAsset(project.id, id);
  const blob =
    args.mode === 'guide'
      ? await prepareGuideHtml({ ...args, project, readAsset })
      : (
          await prepareTourHtml({
            project,
            readAsset,
            labels: tourPlayerLabels(args.t),
            options: { optimize: false, maxEdge: 1920, quality: 0.85 },
            signal: args.signal,
          })
        ).blob;
  args.signal.throwIfAborted();
  return { status: 'ready', blob, name: project.name, revision, mode: args.mode } as const;
}
