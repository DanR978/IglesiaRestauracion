/* ============================================================================
 * web/eslint-rules/no-raw-html.js — the {@html} / innerHTML guard (S18)
 * ----------------------------------------------------------------------------
 * MIGRATION.md D-005 as a CI gate: "Under Svelte, `{@html X}` is forbidden
 * unless `X` is `sanitizeHtml()`/`renderRichText()` output (or the trusted
 * static icon sprite)." A rule is the only version of that sentence a reviewer
 * cannot forget on a Friday.
 *
 * REPLACES `svelte/no-at-html-tags` (which this config turns off). That rule
 * forbids the tag outright, so the two legitimate sites — RichText.svelte and
 * the sprite injector — would each need a blanket `eslint-disable` comment, and
 * from then on NOTHING checks the expression behind it. This rule inverts that:
 * the sanitized form is allowed with no comment, so any `eslint-disable` for
 * `local/no-raw-html` left in the tree is, by construction, a real red flag.
 *
 * It also covers the sinks that would otherwise route around it: `innerHTML` /
 * `outerHTML` assignment, `insertAdjacentHTML`, `document.write(ln)`. Without
 * that, `el.innerHTML = dirty` is a one-line bypass of the whole rule.
 *
 * WHAT COUNTS AS SAFE
 *   sanitizeHtml(x) · renderRichText(x)        — the allowlist (configurable)
 *   html`…`                                     — $lib/escape's auto-escaping tag
 *   'a string literal' / `a template with no ${}` — static, author-written markup
 *   spriteMarkup                                — an import whose source matches
 *                                                 rawAssetPattern (default
 *                                                 `\.svg\?raw$`): the D-005 sprite
 *   a local variable whose EVERY assignment is one of the above (so
 *   `const safe = $derived(renderRichText(v)); {@html safe}` passes, and
 *   `let s = ''; s = dirty; {@html s}` does not)
 *   a ?:/&&/||/?? whose reachable branches are all of the above
 *
 * Options (all optional):
 *   { sanitizers: string[], safeTemplateTags: string[], rawAssetPattern: string,
 *     checkHtmlSinks: boolean }
 * ========================================================================== */

const DEFAULT_SANITIZERS = ['sanitizeHtml', 'renderRichText'];
const DEFAULT_SAFE_TAGS = ['html'];
const DEFAULT_RAW_ASSET_PATTERN = '\\.svg\\?raw$';

/** Runes that wrap a value without changing what it is. */
const TRANSPARENT_CALLS = new Set(['$derived', '$state', 'String']);

/** Properties whose assignment parses their right-hand side as HTML. */
const SINK_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
const SINK_METHODS = new Set(['insertAdjacentHTML', 'write', 'writeln']);

/** Strip the wrappers that do not change the value (`x as string`, `x!`, `(x)`). */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

/** `foo(…)` → 'foo'; `a.foo(…)` → 'foo'; anything computed → null. */
function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
}

/** The full dotted callee, so `$derived.by` is distinguishable from `x.by`. */
function dottedCallee(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const object = dottedCallee(callee.object);
    const property = callee.property.type === 'Identifier' ? callee.property.name : null;
    return object && property ? `${object}.${property}` : null;
  }
  return null;
}

/** Walk up the scope chain for `name`, the way ESLint's own rules resolve one. */
function findVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const found = current.variables.find((variable) => variable.name === name);
    if (found) return found;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid raw HTML injection: {@html} and innerHTML-style sinks must be given sanitizer output (MIGRATION.md D-005).',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          sanitizers: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          safeTemplateTags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          rawAssetPattern: { type: 'string' },
          checkHtmlSinks: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawHtml:
        '{@html} is forbidden unless the value is {{sanitizers}} output (MIGRATION.md D-005). Render the value as text, or use <RichText value={…}> which sanitizes on render.',
      rawSink:
        'Assigning unsanitized markup to `{{sink}}` bypasses the {@html} rule (MIGRATION.md D-005). Pass {{sanitizers}} output, or build the string with the `html` tag from $lib/escape.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const sanitizers = new Set(options.sanitizers ?? DEFAULT_SANITIZERS);
    const safeTemplateTags = new Set(options.safeTemplateTags ?? DEFAULT_SAFE_TAGS);
    const rawAssetPattern = new RegExp(options.rawAssetPattern ?? DEFAULT_RAW_ASSET_PATTERN);
    const checkHtmlSinks = options.checkHtmlSinks !== false;
    const sourceCode = context.sourceCode;
    const sanitizerList = [...sanitizers].map((name) => `${name}()`).join(' / ');

    /** An import binding is safe only when it names a build-time raw asset. */
    function isRawAssetImport(definition) {
      const declaration = definition.parent;
      return (
        declaration?.type === 'ImportDeclaration' &&
        typeof declaration.source?.value === 'string' &&
        rawAssetPattern.test(declaration.source.value)
      );
    }

    function isSafe(node, scope, seen) {
      const expression = unwrap(node);
      if (!expression) return false;

      switch (expression.type) {
        // Static markup the author typed inline: no data can flow into it.
        case 'Literal':
          return typeof expression.value === 'string';
        case 'TemplateLiteral':
          return expression.expressions.length === 0;

        case 'TaggedTemplateExpression':
          return expression.tag.type === 'Identifier' && safeTemplateTags.has(expression.tag.name);

        case 'CallExpression': {
          const dotted = dottedCallee(expression.callee);
          if (dotted === '$derived.by') {
            const fn = expression.arguments[0];
            if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) {
              return fn.body.type !== 'BlockStatement' && isSafe(fn.body, scope, seen);
            }
            return false;
          }
          const name = calleeName(expression.callee);
          if (name && sanitizers.has(name)) return true;
          if (name && TRANSPARENT_CALLS.has(name)) {
            return expression.arguments.length > 0 && isSafe(expression.arguments[0], scope, seen);
          }
          return false;
        }

        case 'ConditionalExpression':
          return (
            isSafe(expression.consequent, scope, seen) && isSafe(expression.alternate, scope, seen)
          );

        case 'LogicalExpression':
          // `a && safe(b)` renders `a` (falsy) or the right side; `||`/`??` can
          // render either side, so both have to hold.
          return expression.operator === '&&'
            ? isSafe(expression.right, scope, seen)
            : isSafe(expression.left, scope, seen) && isSafe(expression.right, scope, seen);

        case 'Identifier': {
          if (seen.has(expression.name)) return false;
          seen.add(expression.name);
          const variable = findVariable(scope, expression.name);
          const definition = variable?.defs[0];
          if (!variable || !definition) return false;
          if (definition.type === 'ImportBinding') return isRawAssetImport(definition);
          if (definition.type !== 'Variable') return false;

          // Every value the variable ever takes must be safe — an `init` that
          // happens to be `''` must not launder a later `= dirty`.
          const writes = variable.references
            .filter((reference) => reference.isWrite() && reference.writeExpr)
            .map((reference) => reference.writeExpr);
          if (writes.length === 0) return false;
          return writes.every((write) => isSafe(write, scope, new Set(seen)));
        }

        default:
          return false;
      }
    }

    function check(node, expression, messageId, data) {
      if (isSafe(expression, sourceCode.getScope(node), new Set())) return;
      context.report({ node, messageId, data: { sanitizers: sanitizerList, ...data } });
    }

    const listeners = {
      SvelteMustacheTag(node) {
        if (node.kind !== 'raw') return;
        check(node, node.expression, 'rawHtml');
      },
    };

    if (checkHtmlSinks) {
      listeners.AssignmentExpression = (node) => {
        const target = node.left;
        if (
          target.type !== 'MemberExpression' ||
          target.computed ||
          target.property.type !== 'Identifier' ||
          !SINK_PROPERTIES.has(target.property.name)
        ) {
          return;
        }
        check(node, node.right, 'rawSink', { sink: target.property.name });
      };

      listeners.CallExpression = (node) => {
        const name = calleeName(node.callee);
        if (!name || !SINK_METHODS.has(name)) return;
        // `write`/`writeln` only matter on `document`; a local `write()` is not a sink.
        if (name !== 'insertAdjacentHTML') {
          const dotted = dottedCallee(node.callee);
          if (dotted !== `document.${name}`) return;
        }
        const argument = name === 'insertAdjacentHTML' ? node.arguments[1] : node.arguments[0];
        if (!argument) return;
        check(node, argument, 'rawSink', { sink: `${name}()` });
      };
    }

    return listeners;
  },
};

export default rule;
