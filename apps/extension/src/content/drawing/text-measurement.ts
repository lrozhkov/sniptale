import {
  resolveDrawingTextInkLayout,
  measureDrawingTextWithTabs,
  type DrawingTextInkLayout,
  type DrawingFontFamily,
  resolveDrawingTextFontFamily,
  type DrawingTextMeasurementPort,
} from '../../features/drawing/public';

export const measureContentDrawingText: DrawingTextMeasurementPort = (args) => {
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!context?.measureText) return args.line.length * args.fontSize * 0.55;
  context.font = `${args.fontSize}px ${resolveDrawingTextFontFamily(args.fontFamily)}`;
  return measureDrawingTextWithTabs(args.line, (text) => context.measureText(text));
};

/** Uses the same ink/line policy as editor, capture, and recording renderers. */
export function measureContentDrawingTextLayout(args: {
  text: string;
  fontSize: number;
  wrapWidth: number;
  autoWidth?: boolean;
  editing?: boolean;
  fontFamily?: DrawingFontFamily;
  fontFamilyCss?: string;
}): DrawingTextInkLayout {
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (context)
    context.font = `${args.fontSize}px ${args.fontFamilyCss ?? resolveDrawingTextFontFamily(args.fontFamily)}`;
  return resolveDrawingTextInkLayout({
    ...args,
    measure: (text) =>
      measureDrawingTextWithTabs(
        text,
        (part) => context?.measureText?.(part) ?? { width: part.length * args.fontSize * 0.55 }
      ),
  });
}

/** Disposable geometry projection. Font completion cannot write or recreate authored objects. */
export class ContentDrawingTextProjection {
  private readonly cache = new WeakMap<
    import('../../features/drawing/public').DrawingObject,
    {
      ready: boolean;
      value: import('../../features/drawing/public').DrawingObject;
    }
  >();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private active = true;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly onChange?: () => void) {}
  capture(object: import('../../features/drawing/public').DrawingObject): void {
    this.resolve(object);
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requestFont(font: string, text: string): void {
    const fonts = document.fonts;
    if (!fonts || this.pending.has(font) || this.failed.has(font)) return;
    this.pending.add(font);
    void fonts
      .load(font, text)
      .then((faces) => {
        this.pending.delete(font);
        if (!faces.length) {
          this.failed.add(font);
          return;
        }
        if (this.active) {
          this.onChange?.();
          this.listeners.forEach((listener) => listener());
        }
      })
      .catch(() => {
        this.pending.delete(font);
        this.failed.add(font);
      });
  }

  resolve(
    object: import('../../features/drawing/public').DrawingObject
  ): import('../../features/drawing/public').DrawingObject {
    if (object.kind !== 'text' || typeof document === 'undefined') return object;
    const font = `${object.fontSize}px ${resolveDrawingTextFontFamily(object.fontFamily)}`;
    const ready = document.fonts?.check?.(font, object.text) ?? true;
    if (!ready && this.active) this.requestFont(font, object.text);
    const cached = this.cache.get(object);
    if (cached?.ready === ready) return cached.value;
    const layout = measureContentDrawingTextLayout({
      text: object.text,
      fontSize: object.fontSize,
      ...(object.fontFamily ? { fontFamily: object.fontFamily } : {}),
      wrapWidth: object.wrapWidth ?? object.bounds.width,
      autoWidth: object.autoWidth ?? false,
    });
    const value =
      Math.abs(object.bounds.width - layout.width) < 0.01 &&
      Math.abs(object.bounds.height - layout.height) < 0.01
        ? object
        : {
            ...object,
            wrapWidth: object.wrapWidth ?? object.bounds.width,
            bounds: { ...object.bounds, width: layout.width, height: layout.height },
          };
    this.cache.set(object, { ready, value });
    return value;
  }

  dispose(): void {
    this.active = false;
    this.pending.clear();
    this.listeners.clear();
  }
}
