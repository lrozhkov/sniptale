import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image, LocateFixed, Maximize2, FileText } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type {
  GuideProject,
  GuideImageBlock,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { LibraryMediaPlayer } from '../../composition/library-preview/player';
import { GuideResourceDialog } from './resource-drawer';
import { GuideActionMenu } from './action-menu';
import { GUIDE_IMAGE_DRAG_TYPE } from './image-drop';
import './resource-list.css';

type ResourceUse = { item: GuideStep; block: GuideImageBlock };

/** Derived usage groups share the canonical asset identity, never compare or rewrite image bytes. */
function resourceGroups(project: GuideProject) {
  const groups = new Map<string, ResourceUse[]>();
  for (const item of project.items) {
    if (item.kind !== 'step') continue;
    for (const block of item.blocks) {
      if (block.kind !== 'image') continue;
      const uses = groups.get(block.assetId) ?? [];
      uses.push({ item, block });
      groups.set(block.assetId, uses);
    }
  }
  return [...groups].map(([assetId, uses]) => ({ assetId, uses, first: uses[0]! }));
}

/** Compact material rows own preview selection; images and project edits remain with the page. */
export function GuideResources({
  project,
  images,
  onSelect,
  disabled,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  onSelect: (id: string) => void;
  disabled: boolean;
  t: Translate;
}) {
  const groups = resourceGroups(project);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const theme = useResolvedPortalTheme(anchor.current);
  const preview = groups.find((group) => group.assetId === previewId);
  const name = (use: ResourceUse) =>
    use.block.caption || use.block.alt || use.item.title || t('scenario.editor.untitledStep');
  const showUse = ({ item, block }: ResourceUse) => {
    onSelect(item.id);
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-block-id]')].find(
        (node) => node.dataset['blockId'] === block.id
      );
      target?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    });
  };
  return (
    <div ref={anchor} className="guide-resource-list">
      {groups.length === 0 && (
        <p className="guide-inspector-hint">{t('scenario.editor.guideNoResources')}</p>
      )}
      {groups.map(({ assetId, first, uses }) => (
        <div key={assetId} className="guide-resource-row" data-resource-id={assetId}>
          <button
            type="button"
            className="guide-resource-main"
            title={name(first)}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(event) => {
              if (disabled) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(
                GUIDE_IMAGE_DRAG_TYPE,
                JSON.stringify({ projectId: project.id, blockId: first.block.id })
              );
            }}
            onClick={() => showUse(first)}
          >
            <span className="guide-resource-thumb">
              {images[assetId] ? (
                <img src={images[assetId] ?? undefined} alt="" draggable={false} />
              ) : (
                <Image size={18} aria-hidden="true" />
              )}
            </span>
            <span className="guide-resource-name">{name(first)}</span>
          </button>
          <ContentToolbarButton
            title={t('scenario.editor.guideResourcePreview')}
            disabled={!images[assetId]}
            onClick={() => setPreviewId(assetId)}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </ContentToolbarButton>
          <GuideActionMenu
            label={t('scenario.editor.guideResourceUses').replace('{count}', String(uses.length))}
            icon={<LocateFixed size={14} aria-hidden="true" />}
            disabled={disabled}
            items={uses.map((use, index) => ({
              label: `${use.item.title || t('scenario.editor.untitledStep')} · ${index + 1}`,
              icon: <FileText size={14} aria-hidden="true" />,
              onSelect: () => showUse(use),
            }))}
          />
        </div>
      ))}
      {preview &&
        images[preview.assetId] &&
        createPortal(
          <div className="sniptale-ai-modal-root" data-theme={theme ?? undefined}>
            <GuideResourceDialog
              t={t}
              title={name(preview.first)}
              id="guide-resource-preview"
              onClose={() => setPreviewId(null)}
            >
              <div className="guide-resource-full-preview">
                <LibraryMediaPlayer
                  kind="image"
                  src={images[preview.assetId] ?? null}
                  filename={name(preview.first)}
                >
                  <span role="status">{t('scenario.editor.loading')}</span>
                </LibraryMediaPlayer>
              </div>
            </GuideResourceDialog>
          </div>,
          resolveThemeSafePortalTarget(anchor.current)
        )}
    </div>
  );
}
