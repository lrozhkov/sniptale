import type { ComponentProps } from 'react';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Image } from 'lucide-react';
import { GuideImageUpload } from '../image-upload';
import { TourStage } from './stage';
import { TourGeneration } from './generation';
import type { TourView } from './view-controls';
import type { SelectedTourProps } from './workspace-contracts';

type TourCanvasProps = SelectedTourProps & {
  view: TourView;
  previewKey: number;
  previewOrigin: 'selection' | 'beginning';
  generating: boolean;
  onGenerationChange: (value: boolean) => void;
  onUpload: (file: File, signal: AbortSignal) => Promise<boolean>;
};

/** Canvas mode chooses generation, the selected scene or acquisition without owning selection. */
export function TourCanvas(props: TourCanvasProps) {
  const {
    project,
    disabled,
    importDisabled = disabled,
    t,
    onChange,
    state,
    generating,
    onGenerationChange: setGenerating,
    onUpload: upload,
  } = props;
  return (
    <div
      className="tour-canvas"
      data-tour-drop-slide={state.slide?.id}
      tabIndex={0}
      aria-label={t('scenario.editor.tourMode')}
    >
      {generating ? (
        <TourGeneration
          disabled={disabled}
          project={project}
          onChange={onChange}
          onClose={() => setGenerating(false)}
          t={t}
        />
      ) : project.tour && state.selection ? (
        <TourSelectedCanvas {...props} />
      ) : (
        <TourEmptyCanvas
          disabled={importDisabled}
          canGenerate={!disabled && Boolean(project.items.length)}
          onUpload={upload}
          onGenerate={() => setGenerating(true)}
          t={t}
        />
      )}
    </div>
  );
}

/** Scene geometry and missing-image replacement publish only through canonical workspace callbacks. */
function TourSelectedCanvas({
  project,
  panels,
  images,
  disabled,
  importDisabled = disabled,
  t,
  onImport,
  state,
  onSelectObject: selectObject,
  view,
  previewKey,
  previewOrigin,
}: Pick<
  TourCanvasProps,
  | 'project'
  | 'panels'
  | 'images'
  | 'disabled'
  | 'importDisabled'
  | 't'
  | 'onImport'
  | 'state'
  | 'onSelectObject'
  | 'view'
  | 'previewKey'
  | 'previewOrigin'
>) {
  if (!project.tour || !state.selection) return null;
  return (
    <>
      <div className="tour-camera-editor">
        <TourStage
          disabled={disabled}
          key={t('scenario.editor.tourMode')}
          tour={project.tour}
          images={images}
          selection={state.selection}
          t={t}
          view={view}
          previewKey={previewKey}
          previewOrigin={previewOrigin}
          onSelectObject={selectObject}
          onNavigateSelection={(selection) => {
            state.select(selection);
            panels.selectRightScope('selection');
          }}
          {...tourGeometryHandlers(
            state.slide?.kind === 'image' ? state.slide : null,
            state.changeSlide,
            state.selection?.kind === 'slide' ? state.selection.objectId : null
          )}
        />
      </div>
      {state.slide?.kind === 'image' && !state.slide.image && (
        <div className="tour-empty-image">
          <GuideImageUpload
            placement={{ kind: 'tour-image', slideId: state.slide.id }}
            disabled={importDisabled}
            t={t}
            onUpload={(file, signal) =>
              onImport({
                sources: [{ kind: 'file', file }],
                placement: { kind: 'tour-image', slideId: state.slide!.id },
                signal,
              })
            }
          />
        </div>
      )}
    </>
  );
}

/** Geometry inputs transform the selected image slide and commit through its existing history owner. */
function tourGeometryHandlers(
  slide: Extract<TourSlide, { kind: 'image' }> | null,
  changeSlide: SelectedTourProps['state']['changeSlide'],
  objectId: string | null
): Pick<ComponentProps<typeof TourStage>, 'onFrameCamera' | 'onResizeObject' | 'onMoveObject'> {
  return {
    onFrameCamera(camera) {
      if (slide) {
        const selected = slide.actions.find((entry) => entry.object.id === objectId);
        const nextCamera = {
          ...(selected?.object.camera ?? slide.camera),
          ...camera,
          mode: 'manual' as const,
        };
        changeSlide(
          selected
            ? {
                ...slide,
                actions: slide.actions.map((entry) =>
                  entry.object.id !== objectId
                    ? entry
                    : entry.type === 'hotspot'
                      ? { type: 'hotspot', object: { ...entry.object, camera: nextCamera } }
                      : { type: 'annotation', object: { ...entry.object, camera: nextCamera } }
                ),
              }
            : { ...slide, camera: nextCamera }
        );
      }
    },
    onResizeObject(id, rect) {
      if (slide)
        changeSlide({
          ...slide,
          masks: slide.masks.map((mask) => (mask.id === id ? { ...mask, rect } : mask)),
          actions: slide.actions.map((entry) =>
            entry.type === 'hotspot' &&
            entry.object.id === id &&
            entry.object.visual.kind !== 'point'
              ? {
                  type: 'hotspot',
                  object: {
                    ...entry.object,
                    visual: { ...entry.object.visual, rect },
                    point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
                  },
                }
              : entry
          ),
        });
    },
    onMoveObject(id, point) {
      if (slide)
        changeSlide({
          ...slide,
          masks: slide.masks.map((mask) =>
            mask.id === id ? { ...mask, rect: { ...mask.rect, ...point } } : mask
          ),
          actions: slide.actions.map((entry) => {
            if (entry.type !== 'hotspot' || entry.object.id !== id) return entry;
            const visual = entry.object.visual;
            return {
              type: 'hotspot',
              object: {
                ...entry.object,
                point:
                  visual.kind === 'point'
                    ? point
                    : { x: point.x + visual.rect.width / 2, y: point.y + visual.rect.height / 2 },
                visual:
                  visual.kind === 'point'
                    ? visual
                    : { ...visual, rect: { ...visual.rect, ...point } },
              },
            };
          }),
        });
    },
  };
}

/** Empty-canvas acquisition offers media upload or guide generation before a scene exists. */
function TourEmptyCanvas({
  disabled,
  canGenerate,
  onUpload: upload,
  onGenerate,
  t,
}: {
  disabled: boolean;
  canGenerate: boolean;
  onUpload: (file: File, signal: AbortSignal) => Promise<boolean>;
  onGenerate: () => void;
  t: SelectedTourProps['t'];
}) {
  return (
    <div className="tour-empty">
      <Image size={36} />
      <h2>{t('scenario.editor.tourEmpty')}</h2>
      <p>{t('scenario.editor.tourEmptyHint')}</p>
      <GuideImageUpload
        compact
        placement={{ kind: 'tour-slides' }}
        disabled={disabled}
        onUpload={upload}
        t={t}
      />
      <ProductActionButton compact tone="secondary" disabled={!canGenerate} onClick={onGenerate}>
        {t('scenario.editor.tourGenerate')}
      </ProductActionButton>
    </div>
  );
}
