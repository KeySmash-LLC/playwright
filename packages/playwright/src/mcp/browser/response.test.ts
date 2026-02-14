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
import { Response, parseResponse } from './response';
import { DomState } from './domState';

test.describe('Response DOM State integration', () => {
  test('Response should have setDomState method', () => {
    // We can't easily create a full Response without a Context,
    // but we can verify the type structure
    expect(Response.prototype.setDomState).toBeDefined();
    expect(typeof Response.prototype.setDomState).toBe('function');
  });

  test('parseResponse should extract Browser State section', () => {
    const mockResponse = {
      content: [{
        type: 'text' as const,
        text: `### Page
- Page URL: https://example.com
- Page Title: Test Page

### Snapshot
\`\`\`yaml
- generic [active] [ref=e1]
\`\`\`

### Browser State
- DOM: .playwright-mcp/browser-state/dom.html
- Accessibility tree: .playwright-mcp/browser-state/accessibility-tree.yaml
- Diff: .playwright-mcp/browser-state/diffs/001-navigate.diff

### Events
- New console entries: 0`
      }],
      isError: false
    };

    const parsed = parseResponse(mockResponse);
    expect(parsed).toBeDefined();
    expect(parsed?.browserState).toBeDefined();
    expect(parsed?.browserState).toContain('DOM: .playwright-mcp/browser-state/dom.html');
    expect(parsed?.browserState).toContain('Accessibility tree: .playwright-mcp/browser-state/accessibility-tree.yaml');
    expect(parsed?.browserState).toContain('Diff: .playwright-mcp/browser-state/diffs/001-navigate.diff');
  });

  test('parseResponse should handle missing Browser State section', () => {
    const mockResponse = {
      content: [{
        type: 'text' as const,
        text: `### Page
- Page URL: https://example.com

### Snapshot
\`\`\`yaml
- generic [active] [ref=e1]
\`\`\``
      }],
      isError: false
    };

    const parsed = parseResponse(mockResponse);
    expect(parsed).toBeDefined();
    expect(parsed?.browserState).toBeUndefined();
  });

  test('parseResponse should handle Browser State without diff', () => {
    const mockResponse = {
      content: [{
        type: 'text' as const,
        text: `### Browser State
- DOM: .playwright-mcp/browser-state/dom.html
- Accessibility tree: .playwright-mcp/browser-state/accessibility-tree.yaml`
      }],
      isError: false
    };

    const parsed = parseResponse(mockResponse);
    expect(parsed).toBeDefined();
    expect(parsed?.browserState).toBeDefined();
    expect(parsed?.browserState).toContain('DOM: .playwright-mcp/browser-state/dom.html');
    expect(parsed?.browserState).toContain('Accessibility tree: .playwright-mcp/browser-state/accessibility-tree.yaml');
    expect(parsed?.browserState).not.toContain('Diff:');
  });
});
