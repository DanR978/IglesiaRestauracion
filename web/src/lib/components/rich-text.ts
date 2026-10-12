/* ============================================================================
 * web/src/lib/components/rich-text.ts — the RichTextEditor contract (S18)
 * ----------------------------------------------------------------------------
 * The non-visual half of RichTextEditor.svelte: the toolbar description, the
 * swatch palette, the editor's imperative API type and the two value guards
 * that keep author-chosen data out of a style attribute / an href unchecked.
 *
 * Kept out of the component so a consumer can type an editor ref
 * (`RichTextEditorApi`), iterate every command (the /kit/ showcase, the tests)
 * or reuse the guards without importing the component.
 *
 * WHY THERE ARE HEX LITERALS IN THIS FILE (and nowhere else in S18):
 * the swatches are CONTENT, not chrome. Picking one writes
 * `style="color: #9a6a2c"` into the stored HTML, which is then rendered on the
 * PUBLIC event page — a `var(--color-secondary)` could not survive that trip
 * (the sanitizer's SAFE_VALUE allowlist rejects `var(`, and the DB row is read
 * by pdfmake and by plain-text excerpts too). The values are the six legacy
 * ones so old and new content share one palette; five of the six are the exact
 * token values they are named after. The editor's own chrome uses tokens only.
 *
 * Usage:
 *   import RichTextEditor from '$lib/components/RichTextEditor.svelte';
 *   import { RICH_TEXT_TOOL_GROUPS, type RichTextEditorApi } from '$lib/components/rich-text';
 * ========================================================================== */

/** Every `document.execCommand` id the toolbar can issue. */
export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'createLink'
  | 'unlink'
  | 'removeFormat'
  | 'foreColor';

/** One toolbar button. `stateful` commands report on/off through `aria-pressed`. */
export interface RichTextTool {
  command: RichTextCommand;
  /** Font Awesome solid name (no `fa-` prefix) — decorative; `label` names the control. */
  icon: string;
  /** Spanish accessible name; also the tooltip. */
  label: string;
  /** `document.queryCommandState` reflects this command in the toolbar. */
  stateful: boolean;
}

/** A separated run of toolbar controls. `color` and `link` open an in-flow panel. */
export interface RichTextToolGroup {
  id: 'emphasis' | 'color' | 'lists' | 'link';
  tools: readonly RichTextTool[];
}

/**
 * The toolbar, in legacy order: emphasis · colour · lists · link/clear
 * (js/lib/rich-text.js:44-72). Same commands, same icons, same Spanish labels;
 * the keyboard hints stay on the three commands the browser binds natively.
 */
export const RICH_TEXT_TOOL_GROUPS: readonly RichTextToolGroup[] = [
  {
    id: 'emphasis',
    tools: [
      { command: 'bold', icon: 'bold', label: 'Negrita (Ctrl+B)', stateful: true },
      { command: 'italic', icon: 'italic', label: 'Cursiva (Ctrl+I)', stateful: true },
      { command: 'underline', icon: 'underline', label: 'Subrayado (Ctrl+U)', stateful: true },
      { command: 'strikeThrough', icon: 'strikethrough', label: 'Tachado', stateful: true },
    ],
  },
  { id: 'color', tools: [] },
  {
    id: 'lists',
    tools: [
      {
        command: 'insertUnorderedList',
        icon: 'list-ul',
        label: 'Lista con viñetas',
        stateful: true,
      },
      { command: 'insertOrderedList', icon: 'list-ol', label: 'Lista numerada', stateful: true },
    ],
  },
  {
    id: 'link',
    tools: [
      { command: 'createLink', icon: 'link', label: 'Insertar enlace', stateful: false },
      { command: 'removeFormat', icon: 'eraser', label: 'Quitar formato', stateful: false },
    ],
  },
];

/** Flat view of the buttons the toolbar renders (the roving-focus order). */
export const RICH_TEXT_TOOLS: readonly RichTextTool[] = RICH_TEXT_TOOL_GROUPS.flatMap(
  (group) => group.tools,
);

/** The commands whose on/off state is mirrored into `aria-pressed`. */
export const RICH_TEXT_STATEFUL_COMMANDS: readonly RichTextCommand[] = RICH_TEXT_TOOLS.filter(
  (tool) => tool.stateful,
).map((tool) => tool.command);

export interface RichTextSwatch {
  /** Serialized into the stored HTML — see the file header. */
  value: string;
  label: string;
}

/**
 * The six on-brand text colours (js/lib/rich-text.js:22), ported value-for-value
 * so text authored before the migration and after it looks the same.
 */
export const RICH_TEXT_SWATCHES: readonly RichTextSwatch[] = [
  { value: '#0e2d38', label: 'Verde azulado oscuro' },
  { value: '#9a6a2c', label: 'Dorado' },
  { value: '#be660e', label: 'Naranja' },
  { value: '#dc2626', label: 'Rojo' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#394548', label: 'Tinta' },
];

/** The colour the swatch bar shows before the author picks one. */
export const RICH_TEXT_DEFAULT_COLOR = '#0e2d38';

/** The BEM block every RichTextEditor emits. */
export const RICH_TEXT_BLOCK = 'rt';

/** The class RichText.svelte puts on rendered rich text (legacy `.rich-content`). */
export const RICH_TEXT_CONTENT_BLOCK = 'rich-content';

/**
 * True for a `#rgb` / `#rrggbb` / `#rrggbbaa` literal and nothing else.
 *
 * `<input type="color">` and the swatch data are both author-controlled values
 * that end up in a `style` custom property and in an execCommand argument, so
 * they are validated rather than trusted (DESIGN-SYSTEM §4.3 ColorInput:
 * "never the raw hex into a style attribute unescaped").
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
}

/** `value` when it is a hex colour, otherwise the default — never an arbitrary string. */
export function safeHexColor(value: unknown): string {
  return isHexColor(value) ? value : RICH_TEXT_DEFAULT_COLOR;
}

/**
 * Normalize a link the author typed, or `null` when it is not one we allow.
 *
 * Mirrors `safeHref` in $lib/sanitize-html (https/http/mailto/tel, or a
 * relative path / anchor); a bare `irdlex.org/x` gets `https://` prepended so
 * the common paste does the expected thing instead of becoming a broken
 * relative link. The sanitizer strips a bad href on the way out regardless —
 * this is the friendly half, not the security boundary.
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[/#]/.test(value)) return value;
  // Any other explicit scheme (javascript:, data:, vbscript:…) is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return `https://${value}`;
}

/**
 * What `bind:this` on a RichTextEditor gives you — the legacy
 * `mountRichText()` API (js/lib/rich-text.js:162-174) as component methods.
 */
export interface RichTextEditorApi {
  /** The current content, sanitized. Always call this to save — never read the DOM. */
  getHtml(): string;
  /** Replace the content (sanitized on the way in). Does NOT fire `onchange`. */
  setHtml(html: string): void;
  /** Move the caret into the writing surface. */
  focus(): void;
  /** True when the content has no visible text (`htmlIsEmpty` on the sanitized value). */
  isEmpty(): boolean;
}
