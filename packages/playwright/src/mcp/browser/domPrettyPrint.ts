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

import { html_beautify } from 'js-beautify';

const BEAUTIFY_OPTIONS = {
  indent_size: 2,
  indent_char: ' ',
  wrap_line_length: 120,
  wrap_attributes: 'force-aligned' as const,
  wrap_attributes_min_attrs: 3,
  preserve_newlines: false,
  max_preserve_newlines: 0,
  end_with_newline: true,
  indent_inner_html: true,
  unformatted: ['code', 'pre'],
  content_unformatted: ['pre', 'code', 'textarea'],
  void_elements: [
    'area', 'base', 'br', 'col', 'embed', 'hr',
    'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'
  ],
};

/**
 * Pretty-print HTML for deterministic, diff-friendly output.
 *
 * Input:  raw HTML string from AIDomBuilder (compact, no formatting)
 * Output: indented HTML with one attribute per line for multi-attr elements
 *
 * Example output:
 *   <input id="first-name"
 *          type="text"
 *          name="firstName"
 *          required
 *          aria-required="true"
 *          value=""
 *          ref="e14">
 */
export function prettyPrintHtml(html: string): string {
  return html_beautify(html, BEAUTIFY_OPTIONS);
}
