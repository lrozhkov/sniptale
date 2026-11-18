import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Clapperboard, Plus } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { listImageProjectsForEditing } from '../../../composition/persistence/image-workspaces/read';
import { listVideoProjectsForEditing } from '../../../composition/persistence/review-workspaces/summaries';
import { translate, type TranslationKey } from '../../../platform/i18n';
import { formatDate } from '../ui';

interface ProjectChoice {
  id: string;
  name: string;
  updatedAt: number;
}

interface ProjectChoices {
  projects: ProjectChoice[];
  canCreateIndependentProject: boolean;
}

function ProjectActions(props: {
  label: TranslationKey;
  newLabel: TranslationKey;
  icon: ReactNode;
  dataUi?: string;
  load: () => Promise<ProjectChoices>;
  onOpenExisting: (id: string) => void | Promise<void>;
  onOpenNew: () => void | Promise<void>;
  onOpenLegacy?: () => void;
}) {
  const [choices, setChoices] = useState<ProjectChoices | null>(null);
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

  async function run(action: () => void | Promise<void>) {
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

  async function showProjects() {
    const result = await props.load();
    if (!active.current) return;
    if (result.projects.length) setChoices(result);
    else if (result.canCreateIndependentProject) await props.onOpenNew();
    else props.onOpenLegacy?.();
  }

  return (
    <>
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        data-ui={props.dataUi}
        className="gallery-preview-action"
        disabled={pending}
        aria-expanded={choices !== null}
        aria-busy={pending}
        onClick={() => (choices ? setChoices(null) : void run(showProjects))}
      >
        {props.icon}
        {translate(props.label)}
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
          onClick={() => void run(() => props.onOpenExisting(project.id))}
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
          onClick={() => void run(props.onOpenNew)}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {translate(props.newLabel)}
        </ProductActionButton>
      ) : null}
      {pending ? <p role="status">{translate('gallery.preview.projectsLoading')}</p> : null}
      {failed ? <p role="alert">{translate('gallery.preview.projectsUnavailable')}</p> : null}
    </>
  );
}

export function ImageEditorActions({
  mediaId,
  onOpenLegacy,
}: {
  mediaId: string;
  onOpenLegacy: () => void;
}) {
  return (
    <ProjectActions
      label="gallery.preview.openInEditor"
      newLabel="gallery.preview.newImageProject"
      icon={<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
      load={() => listImageProjectsForEditing(mediaId)}
      onOpenLegacy={onOpenLegacy}
      onOpenExisting={async (assetId) => {
        await browserTabs.create({ url: buildEditorUrl({ assetId }) });
      }}
      onOpenNew={async () => {
        await browserTabs.create({
          url: buildEditorUrl({ assetId: createSecureRandomUuid(), originalId: mediaId }),
        });
      }}
    />
  );
}

export function VideoReviewActions({
  mediaId,
  onOpen,
}: {
  mediaId: string;
  onOpen: (projectId?: string) => void;
}) {
  return (
    <ProjectActions
      label="gallery.videoReview.enter"
      newLabel="videoEditor.app.newProjectAction"
      dataUi="gallery.videoReview.enter"
      icon={<Clapperboard className="h-4 w-4 shrink-0" aria-hidden="true" />}
      load={async () => ({
        projects: (await listVideoProjectsForEditing(mediaId)).map((project) => ({
          id: project.aggregateId,
          name: project.name,
          updatedAt: project.updatedAt,
        })),
        canCreateIndependentProject: true,
      })}
      onOpenExisting={onOpen}
      onOpenNew={() => onOpen()}
    />
  );
}
