import { Point, type Textbox } from 'fabric';
import {
  resolveDrawingTextInkLayout,
  wrapDrawingTextLines,
  type DrawingTextInkLayout,
} from '../../../features/drawing/public';
import { EditorTextFontMetrics } from './text-font-metrics';

/** Adapts shared text geometry to Fabric's native edit and transform coordinates. */
export class EditorTextInkGeometry {
  private readonly nativeInit: Textbox['initDimensions'];
  private readonly nativeSplitByGrapheme: boolean;
  private readonly fonts: EditorTextFontMetrics;
  private layout: DrawingTextInkLayout | null = null;
  private measuring = false;

  constructor(private readonly textbox: Textbox) {
    this.nativeInit = textbox.initDimensions.bind(textbox);
    this.nativeSplitByGrapheme = textbox.splitByGrapheme;
    this.fonts = new EditorTextFontMetrics(textbox, () => {
      this.layout = null;
      this.initDimensions();
      textbox.setCoords();
      textbox.canvas?.requestRenderAll();
      textbox.renderCursorOrSelection();
    });
    const dispose = textbox.dispose.bind(textbox);
    textbox.dispose = () => {
      this.fonts.dispose();
      return dispose();
    };
  }

  measureChar(...args: Parameters<Textbox['_measureChar']>): ReturnType<Textbox['_measureChar']> {
    return this.fonts.measureChar(...args);
  }

  private supportsInkLayout(): boolean {
    const textbox = this.textbox;
    return (
      textbox.direction === 'ltr' &&
      !textbox.path &&
      !textbox.charSpacing &&
      textbox.textAlign === 'left' &&
      Object.keys(textbox.styles).every((line) => textbox.isEmptyStyles(Number(line)))
    );
  }

  wrapText(lines: string[], width: number): string[][] | null {
    if (!this.supportsInkLayout()) return null;
    return wrapDrawingTextLines(
      lines.join('\n'),
      Math.max(1, width - 12),
      (text) => this.fonts.measure(text).width
    ).map((line) => this.textbox.graphemeSplit(line));
  }

  private measureLayout(): DrawingTextInkLayout {
    const textbox = this.textbox;
    const wrapWidth = textbox.sniptaleDrawingTextAutoWidth
      ? Math.max(1, textbox.sniptaleDrawingTextMaxWidth ?? 640)
      : (textbox.sniptaleDrawingTextMaxWidth ?? textbox.width);
    return resolveDrawingTextInkLayout({
      text: textbox.text,
      fontSize: textbox.fontSize,
      wrapWidth,
      autoWidth: textbox.sniptaleDrawingTextAutoWidth ?? false,
      editing: textbox.isEditing,
      measure: (text) => this.fonts.measure(text),
    });
  }

  private rawOrigin(layout: DrawingTextInkLayout): Point {
    return new Point(
      -layout.width / 2 + layout.originX,
      -layout.height / 2 + layout.firstBaseline
    ).transform(this.textbox.calcOwnMatrix());
  }

  initDimensions(): void {
    if (this.measuring) return;
    this.measuring = true;
    const textbox = this.textbox;
    const previous = this.layout;
    const sameSize =
      previous &&
      Math.abs(previous.width - textbox.width) < 0.01 &&
      Math.abs(previous.height - textbox.height) < 0.01;
    const previousOrigin = previous && sameSize ? this.rawOrigin(previous) : null;
    if (previous && Math.abs(previous.width - textbox.width) >= 0.01) {
      textbox.sniptaleDrawingTextAutoWidth = false;
      textbox.sniptaleDrawingTextMaxWidth = textbox.width;
    }
    try {
      this.fonts.beginLayout();
      textbox.splitByGrapheme = this.supportsInkLayout() || this.nativeSplitByGrapheme;
      if (!this.supportsInkLayout()) {
        this.layout = null;
        this.nativeInit();
        return;
      }
      const font = textbox._getFontDeclaration();
      if (textbox.sniptaleDrawingTextAutoWidth === undefined)
        textbox.sniptaleDrawingTextAutoWidth = false;
      this.layout = this.measureLayout();
      textbox.lineHeight = this.layout.lineHeight / (textbox.fontSize * textbox._fontSizeMult);
      if (!textbox.sniptaleDrawingTextAutoWidth)
        textbox.sniptaleDrawingTextMaxWidth = this.layout.logicalWidth;
      textbox.width = this.layout.logicalWidth;
      this.nativeInit();
      textbox.width = this.layout.width;
      textbox.height = this.layout.height;
      if (previousOrigin && this.previousFont === font) {
        const nextOrigin = this.rawOrigin(this.layout);
        textbox.left += previousOrigin.x - nextOrigin.x;
        textbox.top += previousOrigin.y - nextOrigin.y;
      }
      this.previousFont = font;
    } catch {
      this.layout = null;
      this.nativeInit();
    } finally {
      this.measuring = false;
    }
  }

  private previousFont: string | null = null;
  get inkLayout(): DrawingTextInkLayout | null {
    return this.layout;
  }
  get x(): number {
    return this.layout?.originX ?? 6;
  }
  get y(): number {
    if (!this.layout) return 2;
    const baseline =
      (this.textbox.getHeightOfLine(0) / this.textbox.lineHeight) *
      (1 - this.textbox._fontSizeFraction);
    return this.layout.firstBaseline - baseline;
  }

  background() {
    return (
      this.layout?.backgrounds.map((rect) => ({
        ...rect,
        left: rect.left - this.textbox.width / 2,
        top: rect.top - this.textbox.height / 2,
      })) ?? null
    );
  }
}
