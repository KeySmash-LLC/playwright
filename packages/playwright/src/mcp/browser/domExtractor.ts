/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * AI DOM Builder Injection
 *
 * Self-contained function that runs inside page.evaluate() to walk the DOM tree,
 * strip noise, stamp ref attributes from _ariaRef properties, and serialize to HTML.
 *
 * CRITICAL CONSTRAINT: Everything (constants, helpers, class) MUST be defined
 * inside the function body because page.evaluate() serializes the function as a
 * string and cannot reference external scope.
 *
 * This mirrors Playwright's generateAriaTree pattern for browser-injected code.
 */

export const AIDomBuilderInjection = (): { html: string, iframeRefs: string[] } => {

  // --- Constants (must be inside the function) ---

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const VOID_TAGS = new Set([
    'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR',
    'IMG', 'INPUT', 'LINK', 'META', 'SOURCE', 'TRACK', 'WBR'
  ]);
  const SVG_NOISE_ATTRS = new Set(['d', 'points']);

  // Canonical attribute order for stable diffs.
  // Lower number = appears first. ref is handled separately (always last).
  const ATTR_ORDER: Record<string, number> = {
    'id': 0, 'type': 1, 'name': 2, 'role': 3,
    'href': 10, 'src': 11, 'action': 12, 'method': 13, 'for': 14,
    'value': 20, 'placeholder': 21, 'required': 22, 'disabled': 23, 'checked': 24,
    'selected': 25, 'multiple': 26, 'readonly': 27,
    'class': 40, 'alt': 41, 'title': 42, 'target': 43, 'rel': 44,
  };

  // Patterns that indicate a generated/framework CSS class
  const GENERATED_CLASS_PATTERNS = [
    /^(css|sc|emotion|styled|jsx)-/,   // CSS-in-JS framework prefixes
    /^_[a-zA-Z0-9]{5,}$/,              // CSS modules hashes: _3fkL2xB
    /[a-f0-9]{8,}/i,                   // contains long hex hash substring
  ];

  // --- Helper functions (must be inside the function) ---

  function shouldSkipAttribute(name: string): boolean {
    if (name.startsWith('on')) return true;       // event handlers
    if (name === 'style') return true;            // inline styles
    if (name.startsWith('data-')) return true;     // data-* attributes
    return false;
  }

  function attrOrder(name: string): number {
    if (name in ATTR_ORDER) return ATTR_ORDER[name];
    if (name.startsWith('aria-')) return 5;  // aria-* goes after role
    return 30;                                // everything else in the middle
  }

  function filterClasses(classStr: string): string {
    return classStr
      .split(/\s+/)
      .filter(cls => cls && !GENERATED_CLASS_PATTERNS.some(p => p.test(cls)))
      .join(' ');
  }

  function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- The builder class (must be inside the function) ---

  class AIDomBuilder {
    private _html: string[] = [];       // string buffer for performance
    private _iframeRefs: string[] = []; // iframe refs found during walk

    /** Entry point — returns serialized HTML + list of iframe refs found */
    build(root: Element): { html: string, iframeRefs: string[] } {
      this._html = [];
      this._iframeRefs = [];
      this._serializeElement(root);
      return { html: this._html.join(''), iframeRefs: this._iframeRefs };
    }

    /** Serialize one element: open tag → children → shadow → close tag */
    private _serializeElement(el: Element): void {
      if (this._shouldSkipElement(el)) return;

      const tag = el.tagName;
      const tagLower = tag.toLowerCase();

      // Collect iframe refs for stitching later
      if (tag === 'IFRAME') {
        const ref = (el as any)._ariaRef?.ref;
        if (ref) this._iframeRefs.push(ref);
      }

      // Opening tag
      this._html.push(`<${tagLower}`);
      this._serializeAttributes(el);
      this._serializeRef(el);
      this._html.push('>');

      // Void elements — no children, no closing tag
      if (VOID_TAGS.has(tag)) return;

      // Children (light DOM)
      this._serializeChildren(el);

      // Shadow DOM — cross the boundary, just like generateAriaTree does
      if (el.shadowRoot) {
        this._html.push('<!-- shadow-root -->');
        this._serializeChildren(el.shadowRoot);
        this._html.push('<!-- /shadow-root -->');
      }

      // Closing tag
      this._html.push(`</${tagLower}>`);
    }

    /** Iterate child nodes — dispatch text vs element */
    private _serializeChildren(parent: Element | ShadowRoot): void {
      for (let child = parent.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent || '';
          if (text.trim())
            this._html.push(escapeHtml(text));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          this._serializeElement(child as Element);
        }
      }
    }

    /** Should this element be skipped entirely (including all children)? */
    private _shouldSkipElement(el: Element): boolean {
      const tag = el.tagName;
      if (SKIP_TAGS.has(tag)) return true;
      if (tag === 'LINK' && el.getAttribute('rel') === 'stylesheet') return true;
      // Keep hidden elements — they may become visible (e.g., validation errors).
      // The AI can see them and anticipate state changes.
      return false;
    }

    /** Write filtered attributes in canonical order for stable diffs */
    private _serializeAttributes(el: Element): void {
      const attrs: [string, string][] = [];
      for (const attr of el.attributes) {
        if (shouldSkipAttribute(attr.name)) continue;
        if (attr.name === 'ref') continue; // skip existing ref attrs (Vue collision prevention)
        if (this._isSvgNoise(el, attr.name)) {
          attrs.push([attr.name, '...']);
          continue;
        }
        if (attr.name === 'class') {
          const filtered = filterClasses(attr.value);
          if (filtered)
            attrs.push(['class', filtered]);
          continue;
        }
        attrs.push([attr.name, attr.value]);
      }

      // For form elements, use the live JS .value property (not the HTML attribute)
      // because user input only updates the property, not the attribute.
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        const liveValue = (el as HTMLInputElement).value;
        if (liveValue !== undefined && liveValue !== '') {
          const idx = attrs.findIndex(a => a[0] === 'value');
          if (idx >= 0)
            attrs[idx] = ['value', liveValue];
          else
            attrs.push(['value', liveValue]);
        }
        // Capture checked state for checkboxes/radio buttons
        if ((tag === 'INPUT') && ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio')) {
          if ((el as HTMLInputElement).checked)
            attrs.push(['checked', '']);
        }
      }

      // Sort by canonical order — keeps diffs stable across snapshots
      attrs.sort((a, b) => attrOrder(a[0]) - attrOrder(b[0]));

      for (const [name, value] of attrs)
        this._html.push(` ${name}="${escapeAttr(value)}"`);
    }

    /**
     * Stamp ref into the HTML output string.
     * Reads _ariaRef (JS property assigned by captureSnapshot), never modifies live DOM.
     */
    private _serializeRef(el: Element): void {
      const ref = (el as any)._ariaRef?.ref;
      if (ref)
        this._html.push(` ref="${ref}"`);
    }

    /** Is this a noisy SVG attribute? */
    private _isSvgNoise(el: Element, attrName: string): boolean {
      const tag = el.tagName.toUpperCase();
      return SVG_NOISE_ATTRS.has(attrName) &&
        (tag === 'PATH' || tag === 'POLYGON');
    }
  }

  // --- Execute ---
  return new AIDomBuilder().build(document.body);
};
