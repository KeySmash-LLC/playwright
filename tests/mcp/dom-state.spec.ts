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
import { DomState } from '../../packages/playwright/src/mcp/browser/domState';
import type { Context } from '../../packages/playwright/src/mcp/browser/context';
import type { Page } from '../../packages/playwright/src/client/page';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('DomState', () => {
  let tempDir: string;

  test.beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'playwright-domstate-'));
  });

  test.afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    delete process.env.PW_DOM_STATE_INSTANCE_ID;
    delete process.env.PW_DOM_STATE_WORKSPACE;
  });

  test.describe('_ensureStateDir - three-tier resolution', () => {
    test('should resolve to multiplexer path with env vars', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance-123';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      expect(result).toBeDefined();
      expect(result?.domPath).toContain('.playwright-mcp');
      expect(result?.domPath).toContain('browser-state');
      expect(result?.domPath).toContain('test-instance-123');

      // Verify directory structure was created
      const expectedDir = path.join(tempDir, '.playwright-mcp', 'browser-state', 'test-instance-123');
      expect(fs.existsSync(expectedDir)).toBe(true);
      expect(fs.existsSync(path.join(expectedDir, 'diffs'))).toBe(true);
    });

    test('should resolve to standalone path with explicit roots', async () => {
      const mockRootPath = path.join(tempDir, 'workspace');
      await fs.promises.mkdir(mockRootPath, { recursive: true });

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => true,
        firstRootPath: () => mockRootPath,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      expect(result).toBeDefined();
      expect(result?.domPath).toContain(mockRootPath);
      expect(result?.domPath).toContain('.playwright-mcp');
      expect(result?.domPath).toContain('browser-state');

      // Verify directory structure was created
      const expectedDir = path.join(mockRootPath, '.playwright-mcp', 'browser-state');
      expect(fs.existsSync(expectedDir)).toBe(true);
      expect(fs.existsSync(path.join(expectedDir, 'diffs'))).toBe(true);
    });

    test('should return undefined when no workspace info is available', async () => {
      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      // When DOM state is disabled, update returns undefined
      expect(result).toBeUndefined();
    });

    test('should prioritize env vars over explicit roots', async () => {
      const mockRootPath = path.join(tempDir, 'workspace');
      await fs.promises.mkdir(mockRootPath, { recursive: true });

      process.env.PW_DOM_STATE_INSTANCE_ID = 'mux-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => true,
        firstRootPath: () => mockRootPath,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      expect(result).toBeDefined();
      // Should use multiplexer path, not the explicit root
      expect(result?.domPath).toContain('mux-instance');
      expect(result?.domPath).not.toContain('workspace');
    });
  });

  test.describe('diff generation', () => {
    test('first call produces no diff, second call produces diff', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // First update - no previous DOM, no diff
      const mockPage1 = createMockPage('<html><body><h1>Original</h1></body></html>');
      const result1 = await domState.update(
          mockPage1,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      expect(result1).toBeDefined();
      expect(result1?.diff).toBeUndefined();
      expect(result1?.diffPath).toBeUndefined();

      // Second update - DOM changed, should have diff
      const mockPage2 = createMockPage('<html><body><h1>Changed</h1></body></html>');
      const result2 = await domState.update(
          mockPage2,
          mockContext,
          'browser_click',
          { ref: 'e5', element: 'button' },
          'accessibility-tree'
      );

      expect(result2).toBeDefined();
      expect(result2?.diff).toBeDefined();
      expect(result2?.diffPath).toBeDefined();
      expect(result2?.diff).toContain('@@');
      expect(result2?.diff).toContain('Original');
      expect(result2?.diff).toContain('Changed');
    });

    test('no diff when DOM unchanged', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const html = '<html><body><h1>Unchanged</h1></body></html>';

      // First update
      const mockPage1 = createMockPage(html);
      await domState.update(
          mockPage1,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'accessibility-tree'
      );

      // Second update with same content
      const mockPage2 = createMockPage(html);
      const result2 = await domState.update(
          mockPage2,
          mockContext,
          'browser_click',
          { ref: 'e5', element: 'button' },
          'accessibility-tree'
      );

      expect(result2?.diff).toBeUndefined();
      expect(result2?.diffPath).toBeUndefined();
    });
  });

  test.describe('file naming', () => {
    test('should write current.html and aria snapshot', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');
      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria-snapshot-content'
      );

      expect(result).toBeDefined();
      expect(result?.domPath).toContain('dom.html');
      expect(result?.ariaPath).toContain('accessibility-tree.yaml');

      // Verify files were written
      expect(fs.existsSync(result!.domPath)).toBe(true);
      expect(fs.existsSync(result!.ariaPath)).toBe(true);

      // Verify content
      const domContent = await fs.promises.readFile(result!.domPath, 'utf-8');
      expect(domContent).toContain('<body>Test</body>');

      const ariaContent = await fs.promises.readFile(result!.ariaPath, 'utf-8');
      expect(ariaContent).toBe('aria-snapshot-content');
    });

    test('should name diffs sequentially with tool info', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // First update (no diff)
      const mockPage1 = createMockPage('<html><body><h1>V1</h1></body></html>');
      await domState.update(
          mockPage1,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria1'
      );

      // Second update (first diff)
      const mockPage2 = createMockPage('<html><body><h1>V2</h1></body></html>');
      const result2 = await domState.update(
          mockPage2,
          mockContext,
          'browser_click',
          { ref: 'e5', element: 'button' },
          'aria2'
      );

      expect(result2?.diffPath).toBeDefined();
      expect(path.basename(result2!.diffPath)).toMatch(/^001-click-e5\.diff$/);

      // Third update (second diff)
      const mockPage3 = createMockPage('<html><body><h1>V3</h1></body></html>');
      const result3 = await domState.update(
          mockPage3,
          mockContext,
          'browser_fill_form',
          { ref: 'e10', value: 'test@example.com' },
          'aria3'
      );

      expect(result3?.diffPath).toBeDefined();
      expect(path.basename(result3!.diffPath)).toMatch(/^002-fill_form-e10-test-example-com\.diff$/);
    });

    test('should sanitize special characters in diff names', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // First update
      const mockPage1 = createMockPage('<html><body>V1</body></html>');
      await domState.update(mockPage1, mockContext, 'browser_navigate', {}, 'aria1');

      // Second update with special chars in value
      const mockPage2 = createMockPage('<html><body>V2</body></html>');
      const result2 = await domState.update(
          mockPage2,
          mockContext,
          'browser_fill_form',
          { ref: 'e5', value: 'hello@world.com/path?query=1' },
          'aria2'
      );

      expect(result2?.diffPath).toBeDefined();
      const filename = path.basename(result2!.diffPath);
      // Special chars should be replaced with hyphens
      expect(filename).toMatch(/^001-fill_form-e5-hello-world-com-path\.diff$/);
      expect(filename).not.toContain('@');
      expect(filename).not.toContain('/');
      expect(filename).not.toContain('?');
    });

    test('should truncate long values in diff names', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // First update
      const mockPage1 = createMockPage('<html><body>V1</body></html>');
      await domState.update(mockPage1, mockContext, 'browser_navigate', {}, 'aria1');

      // Second update with long value (> 20 chars)
      const longValue = 'this-is-a-very-long-value-that-should-be-truncated';
      const mockPage2 = createMockPage('<html><body>V2</body></html>');
      const result2 = await domState.update(
          mockPage2,
          mockContext,
          'browser_fill_form',
          { ref: 'e5', value: longValue },
          'aria2'
      );

      expect(result2?.diffPath).toBeDefined();
      const filename = path.basename(result2!.diffPath);
      // Value should be truncated to 20 chars
      expect(filename).toContain('this-is-a-very-long-');
      expect(filename.length).toBeLessThan(longValue.length + 20);
    });
  });

  test.describe('dispose', () => {
    test('should clean up state directory on dispose', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const mockPage = createMockPage('<html><body>Test</body></html>');
      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria'
      );

      const stateDir = path.dirname(result!.domPath);
      expect(fs.existsSync(stateDir)).toBe(true);

      await domState.dispose();

      // Directory should be removed
      expect(fs.existsSync(stateDir)).toBe(false);
    });

    test('should be safe to call dispose multiple times', async () => {
      const domState = new DomState();

      await domState.dispose();
      await domState.dispose();

      // Should not throw
      expect(true).toBe(true);
    });

    test('should be safe to call dispose without prior update', async () => {
      const domState = new DomState();

      await domState.dispose();

      // Should not throw even though no directory was created
      expect(true).toBe(true);
    });
  });

  test.describe('error handling', () => {
    test('should handle missing page gracefully', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // Create a page that throws when evaluate is called
      const mockPage = {
        evaluate: async () => {
          throw new Error('Page navigated');
        },
        $: async () => null,
      } as unknown as Page;

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria'
      );

      // Should return undefined on error
      expect(result).toBeUndefined();
    });

    test('should handle iframe errors gracefully', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      // Create a page with iframe that throws
      const mockPage = {
        evaluate: async (fn: any) => {
          if (typeof fn === 'function' || typeof fn === 'string') {
            return {
              html: '<html><body><iframe ref="if1"></iframe></body></html>',
              iframeRefs: ['if1'],
            };
          }
          throw new Error('Unexpected evaluate call');
        },
        $: async (selector: string) => {
          if (selector.includes('if1')) {
            return {
              contentFrame: async () => {
                throw new Error('Cross-origin frame');
              },
            };
          }
          return null;
        },
        _wrapApiCall: async (callback: any) => {
          // Internal Playwright API used by callOnPageNoTrace
          return await callback();
        },
      } as unknown as Page;

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria'
      );

      // Should still succeed, just without iframe content
      expect(result).toBeDefined();
      expect(result?.domPath).toBeDefined();
    });
  });

  test.describe('pretty printing integration', () => {
    test('should pretty print HTML before writing', async () => {
      process.env.PW_DOM_STATE_INSTANCE_ID = 'test-instance';
      process.env.PW_DOM_STATE_WORKSPACE = tempDir;

      const domState = new DomState();
      const mockContext = {
        hasExplicitRoots: () => false,
        firstRootPath: () => undefined,
      } as unknown as Context;

      const uglyHtml = '<html><head><title>Test</title></head><body><div><p>Paragraph</p></div></body></html>';
      const mockPage = createMockPage(uglyHtml);

      const result = await domState.update(
          mockPage,
          mockContext,
          'browser_navigate',
          { url: 'http://example.com' },
          'aria'
      );

      const domContent = await fs.promises.readFile(result!.domPath, 'utf-8');

      // Should be formatted with proper indentation
      expect(domContent).toContain('<html>');
      expect(domContent).toContain('  <head>');
      expect(domContent).toContain('    <title>Test</title>');
      expect(domContent).toContain('  </head>');
      expect(domContent).toContain('  <body>');
      expect(domContent).toContain('    <div>');
      expect(domContent).toContain('      <p>Paragraph</p>');
    });
  });
});

/**
 * Creates a mock Page object for testing.
 * The evaluate function will return the expected format from AIDomBuilderInjection.
 */
function createMockPage(html: string): Page {
  return {
    evaluate: async (fn: any) => {
      // Simulate AIDomBuilderInjection return value
      if (typeof fn === 'function' || typeof fn === 'string') {
        return {
          html,
          iframeRefs: [],
        };
      }
      throw new Error('Unexpected evaluate call');
    },
    $: async () => null,
    _wrapApiCall: async (callback: any) => {
      // Internal Playwright API used by callOnPageNoTrace
      return await callback();
    },
  } as unknown as Page;
}
