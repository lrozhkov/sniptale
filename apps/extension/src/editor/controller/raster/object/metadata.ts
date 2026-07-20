import type { FabricImage, FabricObject } from 'fabric';

type RasterReplacementMetadataProp =
  | 'sniptaleBackgroundMode'
  | 'sniptaleBackgroundFit'
  | 'sniptaleBackgroundImageData'
  | 'sniptaleBackgroundColor'
  | 'sniptaleBackgroundGradientFrom'
  | 'sniptaleBackgroundGradientTo'
  | 'sniptaleBackgroundGradientStops'
  | 'sniptaleBackgroundGradientColorStops'
  | 'sniptaleBackgroundGradientAngle';
type RasterReplacementMetadata = {
  [Prop in RasterReplacementMetadataProp]: FabricObject[Prop] | undefined;
};

function readRasterReplacementMetadata(source: FabricObject): RasterReplacementMetadata {
  return {
    sniptaleBackgroundColor: source.sniptaleBackgroundColor,
    sniptaleBackgroundFit: source.sniptaleBackgroundFit,
    sniptaleBackgroundGradientAngle: source.sniptaleBackgroundGradientAngle,
    sniptaleBackgroundGradientColorStops: source.sniptaleBackgroundGradientColorStops,
    sniptaleBackgroundGradientFrom: source.sniptaleBackgroundGradientFrom,
    sniptaleBackgroundGradientStops: source.sniptaleBackgroundGradientStops,
    sniptaleBackgroundGradientTo: source.sniptaleBackgroundGradientTo,
    sniptaleBackgroundImageData: source.sniptaleBackgroundImageData,
    sniptaleBackgroundMode: source.sniptaleBackgroundMode,
  };
}

export function copyRasterReplacementMetadata(image: FabricImage, source: FabricObject): void {
  const metadata = readRasterReplacementMetadata(source);
  for (const [prop, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      Reflect.set(image, prop, value);
    }
  }
}
