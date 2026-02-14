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

/**
 * Helper function to calculate line-based diff between two strings.
 * Returns the number of changed lines (added + removed).
 */
function countDiffLines(before: string, after: string): { addedLines: string[]; removedLines: string[]; changedCount: number } {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const addedLines: string[] = [];
  const removedLines: string[] = [];

  // Simple line-by-line comparison
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    const beforeLine = beforeLines[i] || '';
    const afterLine = afterLines[i] || '';

    if (beforeLine !== afterLine) {
      if (beforeLine)
        removedLines.push(beforeLine);
      if (afterLine)
        addedLines.push(afterLine);
    }
  }

  return {
    addedLines,
    removedLines,
    changedCount: addedLines.length + removedLines.length
  };
}

test.describe('prettyPrintHtml', () => {
  test('simple element with one attribute stays on one line', () => {
    const input = '<a href="/home">Home</a>';
    const output = prettyPrintHtml(input);
    expect(output).toBe('<a href="/home">Home</a>\n');
  });

  test('element with two attributes stays on one line', () => {
    const input = '<button type="submit" ref="e8">Submit</button>';
    const output = prettyPrintHtml(input);
    expect(output).toBe('<button type="submit" ref="e8">Submit</button>\n');
  });

  test('element with exactly 3 attributes wraps with force-aligned formatting', () => {
    const input = '<input id="first-name" type="text" name="firstName">';
    const output = prettyPrintHtml(input);

    // Should have one attribute per line, aligned under the first
    expect(output).toContain('<input id="first-name"');
    expect(output).toContain('       type="text"');
    expect(output).toContain('       name="firstName">');

    // Verify it's actually multiple lines
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(3);
  });

  test('element with 5+ attributes wraps with force-aligned formatting', () => {
    const input = '<input id="first-name" type="text" name="firstName" required ref="e14">';
    const output = prettyPrintHtml(input);

    // Should have one attribute per line, aligned under the first
    expect(output).toContain('<input id="first-name"');
    expect(output).toContain('       type="text"');
    expect(output).toContain('       name="firstName"');
    expect(output).toContain('       required');
    expect(output).toContain('       ref="e14">');

    // Verify it's actually multiple lines
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(5);
  });

  test('nested structure uses 2-space indentation', () => {
    const input = '<div><p>Paragraph 1</p><p>Paragraph 2</p></div>';
    const output = prettyPrintHtml(input);

    expect(output).toContain('<div>');
    expect(output).toContain('  <p>Paragraph 1</p>');
    expect(output).toContain('  <p>Paragraph 2</p>');
    expect(output).toContain('</div>');
  });

  test('deeply nested elements maintain correct 2-space indentation', () => {
    const input = '<div><section><article><p>Deep</p></article></section></div>';
    const output = prettyPrintHtml(input);

    expect(output).toContain('<div>');
    expect(output).toContain('  <section>');
    expect(output).toContain('    <article>');
    expect(output).toContain('      <p>Deep</p>');
    expect(output).toContain('    </article>');
    expect(output).toContain('  </section>');
    expect(output).toContain('</div>');
  });

  test('void elements do not get closing tags', () => {
    const input = '<input type="text"><br><img src="test.png">';
    const output = prettyPrintHtml(input);

    expect(output).not.toContain('</input>');
    expect(output).not.toContain('</br>');
    expect(output).not.toContain('</img>');
  });

  test('all standard void elements are handled correctly', () => {
    const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];

    for (const element of voidElements) {
      const input = `<${element}>`;
      const output = prettyPrintHtml(input);
      expect(output).not.toContain(`</${element}>`);
    }
  });

  test('pre content is not reformatted', () => {
    const input = '<pre>const x    =     5;\n  indented</pre>';
    const output = prettyPrintHtml(input);

    // Content inside pre should be preserved exactly
    expect(output).toContain('const x    =     5');
    expect(output).toContain('  indented');
  });

  test('code content is not reformatted', () => {
    const input = '<code>function    foo(  )  {  return  42;  }</code>';
    const output = prettyPrintHtml(input);

    // Content inside code should be preserved with multiple spaces
    expect(output).toContain('function    foo(  )  {  return  42;  }');
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
    const output3 = prettyPrintHtml(input);

    expect(output1).toBe(output2);
    expect(output2).toBe(output3);
  });

  test('determinism with complex multi-attribute elements', () => {
    const input = '<input id="email" type="email" name="email" required aria-required="true" value="" ref="e18">';
    const runs = Array.from({ length: 5 }, () => prettyPrintHtml(input));

    // All runs should produce identical output
    for (let i = 1; i < runs.length; i++)
      expect(runs[i]).toBe(runs[0]);
  });

  test('output ends with newline', () => {
    const input = '<div>Test</div>';
    const output = prettyPrintHtml(input);

    expect(output.endsWith('\n')).toBe(true);
  });

  test('empty element output ends with newline', () => {
    const input = '<div></div>';
    const output = prettyPrintHtml(input);

    expect(output.endsWith('\n')).toBe(true);
  });

  test('void element output ends with newline', () => {
    const input = '<br>';
    const output = prettyPrintHtml(input);

    expect(output.endsWith('\n')).toBe(true);
  });

  test('single attribute value change produces minimal diff', () => {
    const before = prettyPrintHtml('<input id="name" type="text" name="firstName" required value="" ref="e14">');
    const after = prettyPrintHtml('<input id="name" type="text" name="firstName" required value="John" ref="e14">');

    const diff = countDiffLines(before, after);

    // Should change exactly 2 lines: one removed (value=""), one added (value="John")
    expect(diff.changedCount).toBe(2);
    expect(diff.removedLines).toHaveLength(1);
    expect(diff.addedLines).toHaveLength(1);
    expect(diff.removedLines[0]).toContain('value=""');
    expect(diff.addedLines[0]).toContain('value="John"');
  });

  test('single attribute value change with empty to non-empty', () => {
    const before = prettyPrintHtml('<button id="btn" type="submit" class="primary" data-value="">Click</button>');
    const after = prettyPrintHtml('<button id="btn" type="submit" class="primary" data-value="important">Click</button>');

    const diff = countDiffLines(before, after);

    expect(diff.changedCount).toBe(2); // one line removed, one line added
    expect(diff.removedLines[0]).toContain('data-value=""');
    expect(diff.addedLines[0]).toContain('data-value="important"');
  });

  test('attribute alignment preserved after value changes', () => {
    const html1 = '<input id="test" type="text" name="field" value="">';
    const html2 = '<input id="test" type="text" name="field" value="NewValue">';

    const output1 = prettyPrintHtml(html1);
    const output2 = prettyPrintHtml(html2);

    // Extract attribute lines (excluding the opening tag line and closing tag line)
    const lines1 = output1.trim().split('\n');
    const lines2 = output2.trim().split('\n');

    // All lines except the value line should be identical
    expect(lines1[0]).toBe(lines2[0]); // <input id="test"
    expect(lines1[1]).toBe(lines2[1]); // type="text"
    expect(lines1[2]).toBe(lines2[2]); // name="field"
    // lines1[3] and lines2[3] are different (value attribute)
    expect(lines1[3]).toContain('value=""');
    expect(lines2[3]).toContain('value="NewValue"');
  });

  test('no cascading reformatting when attribute value changes', () => {
    const before = prettyPrintHtml('<div id="container" class="main" data-index="1" aria-label="Section">Content</div>');
    const after = prettyPrintHtml('<div id="container" class="main" data-index="2" aria-label="Section">Content</div>');

    const beforeLines = before.trim().split('\n');
    const afterLines = after.trim().split('\n');

    // Only the data-index line should differ
    let diffCount = 0;
    for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
      if (beforeLines[i] !== afterLines[i])
        diffCount++;
    }

    expect(diffCount).toBe(1); // Only one line should differ
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

  test('nested elements with multi-attribute formatting maintain indentation', () => {
    const input = '<div><form><input id="name" type="text" name="userName" required></form></div>';
    const output = prettyPrintHtml(input);

    // Check that input element inside form is indented correctly
    // Note: The formatter keeps form and input on the same line with aligned attributes
    expect(output).toContain('<div>');
    expect(output).toContain('  <form><input id="name"');
    expect(output).toContain('           type="text"');
    expect(output).toContain('           name="userName"');
    expect(output).toContain('           required></form>');
    expect(output).toContain('</div>');
  });

  test('attribute alignment calculation is consistent', () => {
    // Different element names should align attributes based on tag name length
    const shortTag = '<a id="link" href="/home" class="nav">Link</a>';
    const longTag = '<button id="link" href="/home" class="nav">Link</button>';

    const shortOutput = prettyPrintHtml(shortTag);
    const longOutput = prettyPrintHtml(longTag);

    // For <a> (2 chars + 1 space = 3), alignment should be 3 spaces
    expect(shortOutput).toContain('<a id="link"');
    expect(shortOutput).toContain('   href="/home"');
    expect(shortOutput).toContain('   class="nav">');

    // For <button> (7 chars + 1 space = 8), alignment should be 8 spaces
    expect(longOutput).toContain('<button id="link"');
    expect(longOutput).toContain('        href="/home"');
    expect(longOutput).toContain('        class="nav">');
  });

  test('handles special characters in attribute values', () => {
    const input = '<div data-message="Hello &amp; goodbye" data-code="&lt;test&gt;" title="It\'s working">Text</div>';
    const output = prettyPrintHtml(input);

    // Should preserve HTML entities
    expect(output).toContain('Hello &amp; goodbye');
    expect(output).toContain('&lt;test&gt;');
    expect(output).toContain('It\'s working');
  });

  test('empty attributes are handled correctly', () => {
    const input = '<input id="test" type="text" value="" placeholder="">';
    const output = prettyPrintHtml(input);

    expect(output).toContain('value=""');
    expect(output).toContain('placeholder="">');
  });

  test('mixed content with text and elements', () => {
    const input = '<p>This is <strong>bold</strong> and <em>italic</em> text.</p>';
    const output = prettyPrintHtml(input);

    // Should preserve inline elements on same line as text
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('<em>italic</em>');
  });
});
