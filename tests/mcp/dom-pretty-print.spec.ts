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

import { test, expect } from '@playwright/test';
import { prettyPrintHtml } from '../../packages/playwright/src/mcp/browser/domPrettyPrint';

test.describe('prettyPrintHtml', () => {
  test('simple element stays on one line', () => {
    const input = '<a href="/home" ref="e5">Home</a>';
    const output = prettyPrintHtml(input);
    expect(output).toBe('<a href="/home" ref="e5">Home</a>\n');
  });

  test('element with two attributes stays on one line', () => {
    const input = '<button type="submit" ref="e8">Submit</button>';
    const output = prettyPrintHtml(input);
    expect(output).toBe('<button type="submit" ref="e8">Submit</button>\n');
  });

  test('element with 3+ attributes wraps with force-aligned formatting', () => {
    const input = '<input id="first-name" type="text" name="firstName" required ref="e14">';
    const output = prettyPrintHtml(input);

    // Should have one attribute per line, aligned under the first
    expect(output).toContain('<input id="first-name"');
    expect(output).toContain('       type="text"');
    expect(output).toContain('       name="firstName"');
    expect(output).toContain('       required');
    expect(output).toContain('       ref="e14">');

    // Verify it's actually multiple lines
    const lines = output.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  test('nested structure uses 2-space indentation', () => {
    const input = '<div><p>Paragraph 1</p><p>Paragraph 2</p></div>';
    const output = prettyPrintHtml(input);

    expect(output).toContain('<div>');
    expect(output).toContain('  <p>Paragraph 1</p>');
    expect(output).toContain('  <p>Paragraph 2</p>');
    expect(output).toContain('</div>');
  });

  test('void elements do not get closing tags', () => {
    const input = '<input type="text"><br><img src="test.png">';
    const output = prettyPrintHtml(input);

    expect(output).not.toContain('</input>');
    expect(output).not.toContain('</br>');
    expect(output).not.toContain('</img>');
  });

  test('pre and code content is not reformatted', () => {
    const input = '<pre>const x    =     5;\n  indented</pre>';
    const output = prettyPrintHtml(input);

    // Content inside pre should be preserved exactly
    expect(output).toContain('const x    =     5');
    expect(output).toContain('  indented');
  });

  test('textarea content is not reformatted', () => {
    const input = '<textarea>Line 1\n    Line 2 with spaces</textarea>';
    const output = prettyPrintHtml(input);

    expect(output).toContain('Line 1\n    Line 2 with spaces');
  });

  test('output is deterministic - same input produces same output', () => {
    const input = '<div id="test" class="foo bar"><p>Content</p></div>';
    const output1 = prettyPrintHtml(input);
    const output2 = prettyPrintHtml(input);

    expect(output1).toBe(output2);
  });

  test('output ends with newline', () => {
    const input = '<div>Test</div>';
    const output = prettyPrintHtml(input);

    expect(output.endsWith('\n')).toBe(true);
  });

  test('multi-attribute element with boolean attributes', () => {
    const input = '<input id="email" type="email" name="email" required aria-required="true" value="" ref="e18">';
    const output = prettyPrintHtml(input);

    // All attributes should be on separate lines
    expect(output).toContain('<input id="email"');
    expect(output).toContain('       type="email"');
    expect(output).toContain('       required');
    expect(output).toContain('       aria-required="true"');
    expect(output).toContain('       value=""');
    expect(output).toContain('       ref="e18">');
  });

  test('preserves attribute order but formats alignment', () => {
    const input = '<button id="btn" type="submit" class="primary" ref="e10">Click</button>';
    const output = prettyPrintHtml(input);

    // With 4 attributes, should wrap
    expect(output).toContain('<button id="btn"');
    expect(output).toContain('        type="submit"');
    expect(output).toContain('        class="primary"');
    expect(output).toContain('        ref="e10">');
  });

  test('complex nested structure with multiple attributes', () => {
    const input = '<div class="form-group"><label for="first-name">First Name</label><input id="first-name" type="text" name="firstName" required value="" ref="e14"></div>';
    const output = prettyPrintHtml(input);

    // Input element with 5+ attributes should wrap
    expect(output).toContain('<input id="first-name"');
    expect(output).toContain('       type="text"');
    expect(output).toContain('       name="firstName"');
    expect(output).toContain('       required');
    expect(output).toContain('       value=""');
    expect(output).toContain('       ref="e14">');
  });
});
