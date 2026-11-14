import type { Textbox } from 'fabric';
import {
  measureDrawingTextWithTabs,
  type DrawingTextMetrics,
} from '../../../features/drawing/public';

/** Measures the paint size without Fabric's process-wide 400px font cache. */
export class EditorTextFontMetrics {
  private readonly nativeMeasure: Textbox['_measureChar'];
  private context: CanvasRenderingContext2D | null = null;
  private readonly advances = new Map<string, number>();
  private pendingFont: string | null = null;
  private failedFont: string | null = null;
  private active = true;

  constructor(
    private readonly textbox: Textbox,
    private readonly onReady: () => void
  ) {
    this.nativeMeasure = textbox._measureChar.bind(textbox);
  }

  private getContext(): CanvasRenderingContext2D | null {
    this.context ??= document.createElement('canvas').getContext('2d');
    return this.context;
  }

  private advance(context: CanvasRenderingContext2D, font: string, text: string): number {
    const key = `${font}\n${text}`;
    const cached = this.advances.get(key);
    if (cached !== undefined) return cached;
    context.font = font;
    const width = context.measureText(text).width;
    this.advances.set(key, width);
    return width;
  }

  measureChar(...args: Parameters<Textbox['_measureChar']>): ReturnType<Textbox['_measureChar']> {
    const [character, style, previous, previousStyle] = args;
    try {
      const context = this.getContext();
      if (!context) return this.nativeMeasure(...args);
      const font = this.textbox._getFontDeclaration(style);
      const width = this.advance(context, font, character);
      const sameStyle = previous && font === this.textbox._getFontDeclaration(previousStyle);
      return {
        width,
        kernedWidth: sameStyle
          ? this.advance(context, font, previous + character) -
            this.advance(context, font, previous)
          : width,
      };
    } catch {
      return this.nativeMeasure(...args);
    }
  }

  measure(text: string): DrawingTextMetrics {
    const context = this.getContext();
    if (!context) return { width: text.length * this.textbox.fontSize * 0.55 };
    context.font = this.textbox._getFontDeclaration();
    context.textAlign = 'left';
    context.direction = 'ltr';
    return measureDrawingTextWithTabs(text, (part) => context.measureText(part));
  }

  dispose(): void {
    this.active = false;
    this.pendingFont = null;
    this.advances.clear();
  }

  beginLayout(): void {
    this.advances.clear();
    if (!this.active) return;
    const fonts = document.fonts;
    const font = this.textbox._getFontDeclaration();
    if (
      !fonts ||
      typeof fonts.check !== 'function' ||
      this.pendingFont === font ||
      this.failedFont === font ||
      fonts.check(font, this.textbox.text)
    )
      return;
    this.pendingFont = font;
    void fonts
      .load(font, this.textbox.text)
      .then((faces) => {
        if (!this.active || this.pendingFont !== font) return;
        this.pendingFont = null;
        if (!faces.length) {
          this.failedFont = font;
          return;
        }
        if (this.textbox._getFontDeclaration() === font) this.onReady();
      })
      .catch(() => {
        if (!this.active || this.pendingFont !== font) return;
        this.pendingFont = null;
        this.failedFont = font;
      });
  }
}
