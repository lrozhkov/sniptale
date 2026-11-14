import { Point, util, type Textbox } from 'fabric';
import { DEFAULT_COLOR_INFO_STRONG } from '@sniptale/ui/default-colors/constants';
import type { DrawingTextInkLayout } from '../../../features/drawing/public';
import {
  DRAWING_TEXT_INPUT_PAINT_STYLE,
  DRAWING_TEXT_INPUT_SELECTION_CSS,
  resolveDrawingTextInputBox,
  resolveDrawingTextLayoutStyle,
  resolveDrawingTextTypographyStyle,
} from '../../../ui/drawing-tools/text-style';

type Navigation = Pick<Textbox, 'keysMap' | 'keysMapRtl' | 'ctrlKeysMapDown' | 'ctrlKeysMapUp'>;

/** Presents Fabric's existing textarea instead of drawing a second caret and selection on Canvas. */
export class EditorDrawingTextInput {
  private textarea: HTMLTextAreaElement | null = null;
  private navigation: Navigation | null = null;
  private cleanup: (() => void) | null = null;
  private originalStyle: string | null = null;

  constructor(
    private readonly textbox: Textbox,
    private readonly getLayout: () => DrawingTextInkLayout | null
  ) {
    const initialize = textbox.initHiddenTextarea.bind(textbox);
    const position = textbox.updateTextareaPosition.bind(textbox);
    const render = textbox.renderCursorOrSelection.bind(textbox);
    const exit = textbox.exitEditing.bind(textbox);
    const dispose = textbox.dispose.bind(textbox);
    const animate = textbox.initDelayedCursor.bind(textbox);
    const paste = textbox.paste.bind(textbox);
    // DrawingText has uniform typography; browser paste must not inject Fabric inline styles.
    textbox.paste = () => {
      if (!this.visible) paste();
    };
    textbox.initDelayedCursor = (restart) => {
      if (this.visible) textbox.abortCursorAnimation();
      else animate(restart);
    };
    textbox.initHiddenTextarea = () => {
      const container = textbox.hiddenTextareaContainer;
      if (textbox.canvas) textbox.hiddenTextareaContainer = textbox.canvas.wrapperEl;
      try {
        initialize();
      } finally {
        textbox.hiddenTextareaContainer = container ?? null;
      }
      if (textbox.hiddenTextarea && this.getLayout()) this.attach(textbox.hiddenTextarea);
    };
    textbox.updateTextareaPosition = () => {
      if (this.visible) this.update();
      else position();
    };
    textbox.renderCursorOrSelection = () => {
      if (!this.visible) render();
    };
    textbox.exitEditing = () => {
      this.synchronizeSelection();
      const result = exit();
      this.detach();
      return result;
    };
    textbox.dispose = () => {
      this.detach();
      return dispose();
    };
  }

  get visible(): boolean {
    return Boolean(
      this.textarea &&
      this.textbox.isEditing &&
      this.textbox.canvas &&
      this.textarea.parentElement === this.textbox.canvas.wrapperEl &&
      this.getLayout()
    );
  }

  private attach(textarea: HTMLTextAreaElement): void {
    this.detach();
    this.textarea = textarea;
    this.originalStyle = textarea.style.cssText;
    this.navigation = {
      keysMap: this.textbox.keysMap,
      keysMapRtl: this.textbox.keysMapRtl,
      ctrlKeysMapDown: this.textbox.ctrlKeysMapDown,
      ctrlKeysMapUp: this.textbox.ctrlKeysMapUp,
    };
    this.textbox.keysMap = {};
    this.textbox.keysMapRtl = {};
    this.textbox.ctrlKeysMapDown = {};
    this.textbox.ctrlKeysMapUp = {};
    textarea.wrap = 'soft';
    textarea.setAttribute('data-sniptale-drawing-input', '');
    const selectionStyle = textarea.ownerDocument.createElement('style');
    selectionStyle.textContent = DRAWING_TEXT_INPUT_SELECTION_CSS;
    textarea.parentElement?.append(selectionStyle);
    const synchronize = () => this.synchronizeSelection();
    // Fabric blocks selectstart on its wrapper; native input owns its own selection.
    const select = (event: Event) => event.stopPropagation();
    textarea.addEventListener('selectstart', select);
    const blur = () => {
      if (!this.textbox.isEditing) return;
      this.textbox.updateFromTextArea();
      this.textbox.exitEditing();
    };
    textarea.addEventListener('blur', blur);
    const capture = ['keydown', 'beforeinput', 'copy', 'cut', 'paste', 'compositionstart'] as const;
    const bubble = ['select', 'keyup', 'pointerup', 'input'] as const;
    capture.forEach((event) => textarea.addEventListener(event, synchronize, true));
    bubble.forEach((event) => textarea.addEventListener(event, synchronize));
    this.cleanup = () => {
      selectionStyle.remove();
      textarea.removeAttribute('data-sniptale-drawing-input');
      textarea.removeEventListener('selectstart', select);
      textarea.removeEventListener('blur', blur);
      capture.forEach((event) => textarea.removeEventListener(event, synchronize, true));
      bubble.forEach((event) => textarea.removeEventListener(event, synchronize));
    };
    this.update();
  }

  private synchronizeSelection(): void {
    const textarea = this.textarea;
    if (!textarea || !this.textbox.isEditing) return;
    const selection = this.textbox.fromStringToGraphemeSelection(
      textarea.selectionStart,
      textarea.selectionEnd,
      textarea.value
    );
    if (
      selection.selectionStart === this.textbox.selectionStart &&
      selection.selectionEnd === this.textbox.selectionEnd
    )
      return;
    this.textbox.selectionStart = selection.selectionStart;
    this.textbox.selectionEnd = selection.selectionEnd;
    this.textbox._fireSelectionChanged();
  }

  update(): void {
    const { textbox, textarea } = this;
    const canvas = textbox.canvas;
    const layout = this.getLayout();
    if (!layout && textarea) {
      this.detach();
      return;
    }
    if (!textarea || !canvas || !layout || !this.visible) return;
    const box = resolveDrawingTextInputBox(layout);
    const matrix = util.multiplyTransformMatrices(
      canvas.viewportTransform,
      textbox.calcTransformMatrix()
    );
    const origin = new Point(
      -textbox.width / 2 + box.left,
      -textbox.height / 2 + box.top
    ).transform(matrix);
    Object.assign(
      textarea.style,
      resolveDrawingTextTypographyStyle({
        fontFamily: textbox.fontFamily,
        fontSize: textbox.fontSize,
        color: typeof textbox.fill === 'string' ? textbox.fill : '#000000',
      }),
      resolveDrawingTextLayoutStyle(layout),
      {
        ...DRAWING_TEXT_INPUT_PAINT_STYLE,
        position: 'absolute',
        left: '0px',
        top: '0px',
        transformOrigin: '0px 0px',
        transform: `matrix(${matrix[0]},${matrix[1]},${matrix[2]},${matrix[3]},${origin.x},${origin.y})`,
        opacity: '1',
        zIndex: '70',
        pointerEvents: 'auto',
        background: 'transparent',
        border: '0px',
        outline: 'none',
        overflow: 'hidden',
        resize: 'none',
        caretColor: DEFAULT_COLOR_INFO_STRONG,
      }
    );
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
  }

  private detach(): void {
    this.cleanup?.();
    this.cleanup = null;
    if (this.navigation) Object.assign(this.textbox, this.navigation);
    this.navigation = null;
    if (this.textarea && this.originalStyle !== null)
      this.textarea.style.cssText = this.originalStyle;
    this.originalStyle = null;
    this.textarea = null;
  }
}
