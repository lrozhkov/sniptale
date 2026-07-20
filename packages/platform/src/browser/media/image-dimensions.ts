interface ImageDimensions {
  width: number;
  height: number;
}

export async function measureImageBlob(blob: Blob): Promise<ImageDimensions> {
  const bitmap = await createImageBitmap(blob);

  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}
