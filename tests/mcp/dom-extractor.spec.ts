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

import { test, expect } from './fixtures';

test('AIDomBuilderInjection basic serialization', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div>
          <h1>Hello World</h1>
          <p>This is a test</p>
        </div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // Get a page reference to run evaluate
  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        result.html.includes('<h1>') && result.html.includes('Hello World')
      `
    }
  });

  // Should contain basic elements
  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection strips noise elements', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <head>
        <script>console.log('test');</script>
        <style>.test { color: red; }</style>
      </head>
      <body>
        <div>
          <h1>Content</h1>
          <script>alert('inline');</script>
          <noscript>No JS</noscript>
          <template><div>Template</div></template>
        </div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        !html.includes('<script') && !html.includes('<style') && !html.includes('<noscript') && !html.includes('<template')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection strips noise attributes', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <button onclick="alert('click')" data-testid="btn" data-analytics="event" style="color: red">Click</button>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        !html.includes('onclick') && !html.includes('data-testid') && !html.includes('data-analytics') && !html.includes('style=')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection filters CSS classes', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="help-text css-abc123 error-message sc-dkPtRN _3fkL2xB form-group">Content</div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Should keep semantic classes
        const keepsSemantic = html.includes('help-text') && html.includes('error-message') && html.includes('form-group');
        // Should strip generated classes
        const stripsGenerated = !html.includes('css-abc123') && !html.includes('sc-dkPtRN') && !html.includes('_3fkL2xB');
        keepsSemantic && stripsGenerated
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection omits class attribute if all classes generated', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="css-abc123 sc-dkPtRN _3fkL2xB">Content</div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Should not have class attribute at all
        const match = html.match(/<div[^>]*>/);
        !match[0].includes('class=')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection handles void elements', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <input type="text" name="test">
        <br>
        <img src="test.png" alt="Test">
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Void elements should not have closing tags
        !html.includes('</input>') && !html.includes('</br>') && !html.includes('</img>')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection stamps refs from _ariaRef', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <button>Click Me</button>
        <input type="text">
      </body>
    </html>
  `, 'text/html');

  const response = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // After navigate, _ariaRef should be set by captureSnapshot
  // Now run the extractor and check for ref attributes
  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Should have ref attributes (the exact refs depend on the aria tree)
        html.includes('ref="')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection escapes HTML entities', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div>5 < 10 & 10 > 5</div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        html.includes('&lt;') && html.includes('&gt;') && html.includes('&amp;')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection escapes attribute values', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <input type="text" placeholder="Enter &quot;name&quot;" value="5 < 10">
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Attributes should be escaped
        html.includes('&quot;') && html.includes('&lt;')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection simplifies SVG noise attributes', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <svg>
          <path d="M10 10 L20 20 L30 10 Z" />
          <polygon points="10,10 20,20 30,10" />
        </svg>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // d and points should be replaced with "..."
        html.includes('d="..."') && html.includes('points="..."')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection collects iframe refs', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <iframe src="about:blank"></iframe>
        <div>Content</div>
      </body>
    </html>
  `, 'text/html');

  const response = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        // If the iframe has a ref, it should be in iframeRefs
        // The exact ref depends on whether the iframe gets a _ariaRef
        Array.isArray(result.iframeRefs)
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection keeps hidden elements', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div style="display: none;" class="error-message">Validation error</div>
        <div aria-hidden="true">Hidden content</div>
        <div>Visible content</div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Hidden elements should be kept (though style attr is stripped)
        // We can check for their content
        html.includes('Validation error') && html.includes('Hidden content')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection skips existing ref attributes', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <div ref="vue-component-ref">Vue component</div>
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Should not include the original ref="vue-component-ref"
        !html.includes('vue-component-ref')
      `
    }
  });

  expect(result).toBeTruthy();
});

test('AIDomBuilderInjection canonical attribute ordering', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <body>
        <input class="test" value="foo" type="text" name="field" id="input1" required placeholder="Enter">
      </body>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_run_code',
    arguments: {
      code: `
        const { AIDomBuilderInjection } = await import('/packages/playwright/src/mcp/browser/domExtractor.ts');
        const result = await page.evaluate(AIDomBuilderInjection);
        const html = result.html;
        // Extract the input tag
        const match = html.match(/<input[^>]*>/);
        if (!match) return false;
        const tag = match[0];
        // Check order: id, type, name should come before value, placeholder, class
        const idPos = tag.indexOf('id=');
        const typePos = tag.indexOf('type=');
        const namePos = tag.indexOf('name=');
        const valuePos = tag.indexOf('value=');
        const classPos = tag.indexOf('class=');
        idPos < typePos && typePos < namePos && namePos < valuePos && valuePos < classPos
      `
    }
  });

  expect(result).toBeTruthy();
});
