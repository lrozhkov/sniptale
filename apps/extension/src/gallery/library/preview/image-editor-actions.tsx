import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { listImageProjectsForEditing } from '../../../composition/persistence/image-workspaces/read';
import { translate } from '../../../platform/i18n';
import { formatDate } from '../ui';

export function ImageEditorActions({
  mediaId,
  onOpenLegacy,
}: {
  mediaId: string;
  onOpenLegacy: () => void;
}) {
  const [choices, setChoices] = useState<Awaited<
    ReturnType<typeof listImageProjectsForEditing>
  > | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setFailed(false);
    try {
      await action();
    } catch {
      if (active.current) setFailed(true);
    } finally {
      running.current = false;
      if (active.current) setPending(false);
    }
  }

  async function openNewProject() {
    await browserTabs.create({
      url: buildEditorUrl({ assetId: createSecureRandomUuid(), originalId: mediaId }),
    });
  }

  async function showProjects() {
    const result = await listImageProjectsForEditing(mediaId);
    if (!active.current) return;
    if (result.projects.length) setChoices(result);
    else if (result.canCreateIndependentProject) await openNewProject();
    else onOpenLegacy();
  }

  return (
    <>
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        className="gallery-preview-action"
        disabled={pending}
        aria-expanded={choices !== null}
        aria-busy={pending}
        onClick={() => (choices ? setChoices(null) : void run(showProjects))}
      >
        <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        {translate('gallery.preview.openInEditor')}
      </ProductActionButton>
      {choices?.projects.map((project) => (
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          className="gallery-preview-related"
          key={project.id}
          disabled={pending}
          title={project.name}
          onClick={() =>
            void run(async () => {
              await browserTabs.create({ url: buildEditorUrl({ assetId: project.id }) });
            })
          }
        >
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{project.name}</span>
          <span className="shrink-0 text-xs">{formatDate(project.updatedAt)}</span>
        </ProductActionButton>
      ))}
      {choices?.canCreateIndependentProject ? (
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          className="gallery-preview-action"
          disabled={pending}
          onClick={() => void run(openNewProject)}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {translate('gallery.preview.newImageProject')}
        </ProductActionButton>
      ) : null}
      {pending ? <p role="status">{translate('gallery.preview.projectsLoading')}</p> : null}
      {failed ? <p role="alert">{translate('gallery.preview.projectsUnavailable')}</p> : null}
    </>
  );
}
