import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { FabricImage, Group, Point, util, type Canvas, type FabricObject } from 'fabric';
import type { EditorRasterEffect } from '../../features/editor/document/effects';
import {
  EDITOR_RASTER_BINARY_FIELDS,
  hasEditorRasterMetadata,
  parseEditorRasterMetadata,
  type EditorRasterMetadata,
} from '../../features/editor/document/raster-state';
import type { EditorFrameSettings } from '../../features/editor/document/types';
import { readImageSettingsFromObject } from '../objects/image-style';
import { getEditorObjectTypeLabel } from '../document/model';
import { isManagedBackgroundObject } from '../controller/background/identity';
import { findRasterContentObject } from '../controller/document/layers';
import {
  prepareEditorBackgroundLayer,
  type BackgroundRasterCandidate,
} from '../controller/background/sync';
import { resolveBackgroundRasterSize } from '../controller/background/raster';
import { applyEditorRasterEffects } from '../controller/layer-effects/raster-effects';
import type { FrameSceneMutationOptions } from '../controller/public-actions/scene/resize/types';
import { createBackgroundRasterGeometry, createNativeRasterGeometry } from './coordinates';
import type { PixelBounds, RasterSourceGeometry, SelectionMask } from './contracts';
import {
  decodeEditorRasterPixels,
  encodeEditorRasterPixels,
  createEditorRasterMetadata,
  RasterImageResourceLimitError,
} from './image-state';

export type RasterTarget = {
  identity: FabricObject;
  id: string;
  metadata: EditorRasterMetadata;
  geometry: RasterSourceGeometry;
  permission: 'allowed' | 'blocked';
  kind: 'source' | 'image' | 'background';
  label: string;
  revision: string;
};
export type RasterPublication = { metadata: EditorRasterMetadata; visibleFullDataUrl: string };
export type RasterTargetAdapterOptions = {
  canvas: () => Canvas | null;
  frame: () => EditorFrameSettings;
  documentBounds: () => PixelBounds;
  prepareObject: (object: FabricObject) => void;
  commitNative: (object: FabricObject) => void;
  publishBackground: (
    candidate: BackgroundRasterCandidate,
    options: FrameSceneMutationOptions
  ) => Promise<boolean>;
  flipObject: (id: string, axis: 'horizontal' | 'vertical') => Promise<void>;
};

function originalSize(image: { getOriginalSize: () => unknown }): {
  width: number;
  height: number;
} {
  const value: unknown = image.getOriginalSize();
  if (
    !value ||
    typeof value !== 'object' ||
    !('width' in value) ||
    !('height' in value) ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number'
  )
    throw new Error('Raster source dimensions are unavailable');
  return { width: value.width, height: value.height };
}

function findTarget(objects: FabricObject[], id: string): FabricObject | undefined {
  for (const object of objects) {
    if (object.sniptaleId === id) return object;
    if (object instanceof Group) {
      const found = findTarget(object.getObjects(), id);
      if (found) return found;
    }
  }
  return undefined;
}

const targetRevisions = new WeakMap<FabricObject, { inputs: readonly unknown[]; value: string }>();
let nextTargetRevision = 0;
function revision(object: FabricObject): string {
  const inputs = [
    object.sniptaleContentLocked,
    object.sniptaleLocked,
    object.visible,
    object.opacity,
    JSON.stringify(readImageSettingsFromObject(object)),
    JSON.stringify(object.sniptaleRasterState),
    object.sniptaleRasterOriginalData,
    object.sniptaleRasterColorData,
    object.sniptaleRasterVisibilityData,
    object.sniptaleRasterKeyData,
    JSON.stringify(object.sniptaleEffects),
    JSON.stringify(object.calcTransformMatrix()),
    object.width,
    object.height,
    object instanceof FabricImage ? object.cropX : undefined,
    object instanceof FabricImage ? object.cropY : undefined,
    object instanceof FabricImage ? object.getSrc() : object.sniptaleBackgroundImageData,
  ];
  const previous = targetRevisions.get(object);
  if (previous && inputs.every((value, index) => value === previous.inputs[index]))
    return previous.value;
  const value = String(++nextTargetRevision);
  targetRevisions.set(object, { inputs, value });
  return value;
}

/** Render corrections on the full source before deriving the retained visible crop. */
export async function prepareRasterSource(
  candidate: RasterPublication,
  effects: readonly EditorRasterEffect[],
  signal?: AbortSignal
): Promise<FabricImage> {
  signal?.throwIfAborted();
  if (!isImageDataUrl(candidate.visibleFullDataUrl)) throw new RasterImageResourceLimitError();
  const image = await FabricImage.fromURL(candidate.visibleFullDataUrl, signal ? { signal } : {});
  try {
    signal?.throwIfAborted();
    applyEditorRasterEffects(image, [...effects]);
    return image;
  } catch (error) {
    image.dispose();
    throw error;
  }
}

export function croppedSource(image: FabricImage, metadata: EditorRasterMetadata): string {
  const crop = metadata.sniptaleRasterState.crop;
  const source = image
    .toCanvasElement({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .toDataURL('image/png');
  if (!isImageDataUrl(source)) throw new RasterImageResourceLimitError();
  return source;
}

async function prepareCorrectedFragmentSource(
  target: RasterTarget,
  dataUrl: string,
  bounds: PixelBounds,
  selection: SelectionMask,
  signal?: AbortSignal
): Promise<string> {
  let source = dataUrl;
  if (target.identity.sniptaleEffects?.length) {
    const pixels = await decodeEditorRasterPixels(target.metadata, signal);
    const candidate = await encodeEditorRasterPixels(target.metadata, pixels, pixels, signal);
    const prepared = await prepareRasterSource(candidate, target.identity.sniptaleEffects, signal);
    try {
      const canvas = util.createCanvasElement();
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Raster pixel context is unavailable');
      context.drawImage(
        prepared.getElement(),
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height
      );
      if (selection) {
        const rgba = context.getImageData(0, 0, bounds.width, bounds.height);
        for (let y = 0; y < bounds.height; y++)
          for (let x = 0; x < bounds.width; x++)
            if (!selection[(bounds.y + y) * pixels.width + bounds.x + x])
              rgba.data.fill(0, (y * bounds.width + x) * 4, (y * bounds.width + x + 1) * 4);
        context.putImageData(rgba, 0, 0);
      }
      source = canvas.toDataURL('image/png');
    } finally {
      prepared.dispose();
    }
  }
  if (!isImageDataUrl(source)) throw new RasterImageResourceLimitError();
  return source;
}

function placeDetachedRasterFragment(
  copy: FabricImage,
  geometry: RasterSourceGeometry,
  bounds: PixelBounds
): void {
  const matrix = [...geometry.sourceToScene] as [number, number, number, number, number, number];
  const center = new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).transform(
    matrix
  );
  util.applyTransformToObject(copy, [
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    center.x,
    center.y,
  ]);
  copy.sniptaleId = crypto.randomUUID();
  copy.sniptaleRole = 'annotation';
  copy.sniptaleType = 'image';
  copy.sniptaleContentLocked = false;
}

/** Adapt accepted native targets; publication callbacks retain controller ownership. */
export function createRasterTargetAdapter(options: RasterTargetAdapterOptions) {
  const isCurrent = (target: RasterTarget) => {
    const canvas = options.canvas();
    const object = findRasterContentObject(canvas, target.id);
    return object === target.identity && revision(object) === target.revision;
  };
  const backgroundCandidate = async (
    target: RasterTarget,
    candidate: RasterPublication,
    signal?: AbortSignal
  ) => {
    const image = await prepareRasterSource(
      candidate,
      target.identity.sniptaleEffects ?? [],
      signal
    );
    try {
      return {
        isCurrent: () => isCurrent(target),
        targetId: target.id,
        expectedObject: target.identity,
        metadata: candidate.metadata,
        effects: target.identity.sniptaleEffects ?? [],
        derivedImageData: croppedSource(image, candidate.metadata),
        flipX: target.identity.flipX,
        flipY: target.identity.flipY,
      } satisfies BackgroundRasterCandidate;
    } finally {
      image.dispose();
    }
  };
  const hydrated = new WeakMap<FabricObject, { source: string; metadata: EditorRasterMetadata }>();
  const resolveObject = (object: FabricObject | undefined): RasterTarget | null => {
    const canvas = options.canvas();
    if (!object) return null;
    const background =
      isManagedBackgroundObject(object) && object.sniptaleBackgroundMode === 'image';
    if (
      !object.sniptaleId ||
      (!background &&
        (!(object instanceof FabricImage) ||
          (object.sniptaleType !== 'image' && object.sniptaleType !== 'source-image')))
    )
      return null;
    const source = background
      ? object.sniptaleBackgroundImageData
      : object instanceof FabricImage
        ? object.getSrc()
        : undefined;
    if (!source || !isImageDataUrl(source)) return null;
    const retained = parseEditorRasterMetadata(
      object,
      (value, kind): value is string =>
        isImageDataUrl(value) && (kind === 'image' || value.startsWith('data:image/png;'))
    );
    if (hasEditorRasterMetadata(object) && !retained) return null;
    const cached = hydrated.get(object);
    if (background && !retained && cached?.source !== source) return null;
    const metadata =
      retained ??
      (cached?.source === source ? cached.metadata : undefined) ??
      createEditorRasterMetadata(
        source,
        object instanceof FabricImage ? originalSize(object).width : 0,
        object instanceof FabricImage ? originalSize(object).height : 0,
        object instanceof FabricImage
          ? { x: object.cropX, y: object.cropY, width: object.width, height: object.height }
          : undefined
      );
    const size = metadata.sniptaleRasterState;
    const bounds = options.documentBounds();
    const geometry = background
      ? createBackgroundRasterGeometry({
          source: size,
          nativeObject: object,
          crop: size.crop,
          document: bounds,
          fit: options.frame().backgroundImageFit,
          ...(options.frame().backgroundBlurAmount
            ? { renderSize: resolveBackgroundRasterSize(bounds) }
            : {}),
          flipX: object.flipX,
          flipY: object.flipY,
        })
      : object instanceof FabricImage
        ? createNativeRasterGeometry(object, size, size.crop)
        : null;
    if (!geometry) return null;
    return {
      identity: object,
      id: object.sniptaleId,
      metadata,
      geometry,
      permission:
        findRasterContentObject(canvas, object.sniptaleId) === object ? 'allowed' : 'blocked',
      kind: background ? 'background' : object.sniptaleType === 'source-image' ? 'source' : 'image',
      label: object.sniptaleLabel ?? getEditorObjectTypeLabel(object.sniptaleType ?? 'image'),
      revision: revision(object),
    };
  };
  const prepareCorrectionPreview = async (
    target: RasterTarget,
    candidate: BackgroundRasterCandidate,
    signal?: AbortSignal
  ) => {
    const frame = { ...options.frame(), backgroundImageData: candidate.derivedImageData };
    const prepared = await prepareEditorBackgroundLayer({
      canvas: options.canvas(),
      canvasSize: options.documentBounds(),
      frame,
      candidate,
      prepareObject: options.prepareObject,
      isCurrent: () => isCurrent(target) && !signal?.aborted,
    });
    return prepared.previewObject
      ? { object: prepared.previewObject, dispose: prepared.dispose }
      : null;
  };
  return {
    async prepareBackgroundCorrection(
      target: RasterTarget,
      effects: readonly EditorRasterEffect[],
      signal?: AbortSignal
    ): Promise<BackgroundRasterCandidate> {
      const pixels = await decodeEditorRasterPixels(target.metadata, signal);
      const candidate = await encodeEditorRasterPixels(target.metadata, pixels, pixels, signal);
      const image = await prepareRasterSource(candidate, effects, signal);
      try {
        return {
          isCurrent: () => isCurrent(target),
          targetId: target.id,
          expectedObject: target.identity,
          metadata: target.metadata,
          effects,
          derivedImageData: croppedSource(image, target.metadata),
          flipX: target.identity.flipX,
          flipY: target.identity.flipY,
        };
      } finally {
        image.dispose();
      }
    },
    async prepareNativeCorrectionPreview(
      target: RasterTarget,
      effects: readonly EditorRasterEffect[],
      signal?: AbortSignal
    ) {
      if (!(target.identity instanceof FabricImage)) return null;
      const pixels = await decodeEditorRasterPixels(target.metadata, signal);
      const candidate = await encodeEditorRasterPixels(target.metadata, pixels, pixels, signal);
      const prepared = await prepareRasterSource(candidate, effects, signal);
      try {
        const snapshot: unknown = target.identity.toObject();
        if (!snapshot || typeof snapshot !== 'object')
          throw new Error('Raster preview properties are unavailable');
        const object = await FabricImage.fromObject({ ...snapshot, filters: [] });
        if (!isCurrent(target) || signal?.aborted) {
          object.dispose();
          return null;
        }
        const element = util.createCanvasElement();
        element.width = pixels.width;
        element.height = pixels.height;
        const context = element.getContext('2d');
        if (!context) {
          object.dispose();
          throw new Error('Raster pixel context is unavailable');
        }
        context.drawImage(prepared.getElement(), 0, 0);
        object.filters = [];
        object.setElement(element, {
          width: target.identity.width,
          height: target.identity.height,
        });
        util.applyTransformToObject(object, target.identity.calcOwnMatrix());
        return { object, dispose: () => object.dispose() };
      } finally {
        prepared.dispose();
      }
    },
    prepareCorrectionPreview,
    async publishCorrection(
      target: RasterTarget,
      candidate: BackgroundRasterCandidate,
      signal?: AbortSignal
    ): Promise<boolean> {
      if (!isCurrent(target)) return false;
      return options.publishBackground(candidate, { ...(signal ? { signal } : {}) });
    },
    async hydrateTarget(signal?: AbortSignal, id?: string): Promise<void> {
      const canvas = options.canvas();
      const selected = canvas?.getActiveObjects() ?? [];
      const object = id
        ? canvas?.getObjects().find((object) => object.sniptaleId === id)
        : selected.length === 1
          ? selected[0]
          : undefined;
      if (
        !object ||
        !isManagedBackgroundObject(object) ||
        object.sniptaleBackgroundMode !== 'image'
      )
        return;
      const source = object.sniptaleBackgroundImageData;
      if (!source || hydrated.get(object)?.source === source || object.sniptaleRasterState) return;
      const image = await FabricImage.fromURL(source, signal ? { signal } : {});
      try {
        if (
          options.canvas() === canvas &&
          object.sniptaleBackgroundImageData === source &&
          !signal?.aborted
        )
          hydrated.set(object, {
            source,
            metadata: createEditorRasterMetadata(source, image.width, image.height),
          });
      } finally {
        image.dispose();
      }
    },
    resolve(): RasterTarget | null {
      const selected = options.canvas()?.getActiveObjects() ?? [];
      return selected.length === 1 ? resolveObject(selected[0]) : null;
    },
    resolveById(id: string): RasterTarget | null {
      return resolveObject(findTarget(options.canvas()?.getObjects() ?? [], id));
    },
    isCurrent,
    async publish(
      target: RasterTarget,
      candidate: RasterPublication,
      signal?: AbortSignal,
      observeReplacement?: BackgroundRasterCandidate['observeReplacement']
    ): Promise<boolean> {
      if (!isCurrent(target)) return false;
      if (target.kind === 'background') {
        const prepared = await backgroundCandidate(target, candidate, signal);
        if (!isCurrent(target)) return false;
        return options.publishBackground(
          { ...prepared, ...(observeReplacement ? { observeReplacement } : {}) },
          { ...(signal ? { signal } : {}) }
        );
      }
      const prepared = await prepareRasterSource(
        candidate,
        target.identity.sniptaleEffects ?? [],
        signal
      );
      try {
        if (!isCurrent(target) || signal?.aborted || !(target.identity instanceof FabricImage))
          return false;
        const image = target.identity;
        const crop = candidate.metadata.sniptaleRasterState.crop;
        const element = await FabricImage.fromURL(
          candidate.visibleFullDataUrl,
          signal ? { signal } : {}
        );
        if (!isCurrent(target) || signal?.aborted) {
          element.dispose();
          return false;
        }
        const filtered = util.createCanvasElement();
        filtered.width = candidate.metadata.sniptaleRasterState.width;
        filtered.height = candidate.metadata.sniptaleRasterState.height;
        const context = filtered.getContext('2d');
        if (!context) {
          element.dispose();
          throw new Error('Raster pixel context is unavailable');
        }
        context.drawImage(prepared.getElement(), 0, 0);
        image.filters = [];
        image.setElement(filtered, { width: crop.width, height: crop.height });
        // Transfer prepared render data and raw source together; later corrections start from raw pixels.
        image._originalElement = element.getElement();
        image.filters = prepared.filters;
        image.set({ cropX: crop.x, cropY: crop.y });
        const center = new Point(crop.x + crop.width / 2, crop.y + crop.height / 2).transform([
          ...target.geometry.sourceToScene,
        ]);
        const parentCenter = image.group
          ? center.transform(util.invertTransform(image.group.calcTransformMatrix()))
          : center;
        const previousCrop = target.metadata.sniptaleRasterState.crop;
        if (
          crop.x !== previousCrop.x ||
          crop.y !== previousCrop.y ||
          crop.width !== previousCrop.width ||
          crop.height !== previousCrop.height
        )
          image.setPositionByOrigin(parentCenter, 'center', 'center');

        for (const field of EDITOR_RASTER_BINARY_FIELDS) Reflect.deleteProperty(image, field);
        Object.assign(image, candidate.metadata);
        image.setCoords();
        options.commitNative(image);
        return true;
      } finally {
        prepared.dispose();
      }
    },
    async preparePreview(target: RasterTarget, dataUrl: string, signal?: AbortSignal) {
      const candidate = await backgroundCandidate(
        target,
        { metadata: target.metadata, visibleFullDataUrl: dataUrl },
        signal
      );
      return prepareCorrectionPreview(target, candidate, signal);
    },
    async copy(
      target: RasterTarget,
      dataUrl: string,
      bounds: PixelBounds,
      signal?: AbortSignal,
      selection: SelectionMask = null
    ) {
      if (!isCurrent(target)) return false;
      const source = await prepareCorrectedFragmentSource(
        target,
        dataUrl,
        bounds,
        selection,
        signal
      );
      const copy = await FabricImage.fromURL(source, signal ? { signal } : {});
      if (!isCurrent(target) || signal?.aborted) {
        copy.dispose();
        return false;
      }
      placeDetachedRasterFragment(copy, target.geometry, bounds);
      options.prepareObject(copy);
      const canvas = options.canvas();
      if (!canvas) {
        copy.dispose();
        return false;
      }
      canvas.add(copy);
      canvas.setActiveObject(copy);
      options.commitNative(copy);
      return true;
    },
    allowContentEditing(target: RasterTarget): boolean {
      const object = target.identity;
      if (
        findTarget(options.canvas()?.getObjects() ?? [], target.id) !== object ||
        revision(object) !== target.revision
      )
        return false;
      object.sniptaleContentLocked = false;
      options.commitNative(object);
      return true;
    },
    async flip(target: RasterTarget, axis: 'horizontal' | 'vertical'): Promise<boolean> {
      if (!isCurrent(target)) return false;
      await options.flipObject(target.id, axis);
      return true;
    },
  };
}
export type RasterTargetAdapter = ReturnType<typeof createRasterTargetAdapter>;
