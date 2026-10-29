import photoUrl from '../fixtures/image-compression/earthrise.jpg?url';

export type EncodingFixture = 'text' | 'photo' | 'mixed' | 'tall' | 'alpha' | 'tall-alpha';

/** Deterministic web, photographic and transparent rasters for the native codec proof. */
export async function createEncodingFixture(kind: EncodingFixture): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = kind === 'tall' || kind === 'tall-alpha' ? 18000 : 900;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Fixture canvas unavailable');
  if (kind !== 'alpha' && kind !== 'tall-alpha') {
    context.fillStyle = '#f8f6f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (kind === 'photo' || kind === 'mixed' || kind === 'tall') {
    const photo = new Image();
    photo.src = photoUrl;
    await photo.decode();
    if (kind === 'photo') context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    else for (let y = 70; y < canvas.height; y += 900) context.drawImage(photo, 700, y, 540, 500);
  }
  if (kind !== 'photo') {
    context.font = '22px sans-serif';
    for (let y = 40; y < canvas.height; y += 48) {
      context.fillStyle = y % 96 === 40 ? '#28252c' : '#435bc8';
      context.fillText('Sniptale: text, links, captions — 1234567890', 32, y);
      context.fillStyle = '#e0ded8';
      context.fillRect(32, y + 12, 620, 1);
    }
  }
  if (kind === 'alpha' || kind === 'tall-alpha') {
    const gradient = context.createLinearGradient(700, 0, 1280, 0);
    gradient.addColorStop(0, 'rgba(255,0,100,0)');
    gradient.addColorStop(1, 'rgba(0,120,255,0.8)');
    context.fillStyle = gradient;
    context.fillRect(700, 50, 580, 750);
  }
  return canvas;
}
