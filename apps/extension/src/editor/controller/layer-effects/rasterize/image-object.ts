import { FabricImage } from 'fabric';

export async function createRasterizedEditorImage(options: {
  dataUrl: string;
  id: string;
  name: string;
  left: number;
  locked: boolean;
  role: 'annotation' | 'source';
  top: number;
  type: 'image' | 'source-image';
  visible: boolean;
}): Promise<FabricImage> {
  const image = await FabricImage.fromURL(options.dataUrl);

  image.set({
    left: options.left,
    top: options.top,
    originX: 'left',
    originY: 'top',
    visible: options.visible,
  });
  image.sniptaleId = options.id;
  image.sniptaleLabel = options.name;
  image.sniptaleLocked = options.locked;
  image.sniptaleRole = options.role;
  image.sniptaleType = options.type;
  image.sniptaleEffects = [];

  return image;
}
