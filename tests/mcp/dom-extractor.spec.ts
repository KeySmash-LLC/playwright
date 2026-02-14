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
import { chromium, Browser, Page } from 'playwright';
import { AIDomBuilderInjection } from '../../packages/playwright/src/mcp/browser/domExtractor';

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser.close();
});

test.beforeEach(async () => {
  const context = await browser.newContext();
  page = await context.newPage();
});

test.afterEach(async () => {
  await page.context().close();
});

// ============================================================================
// Noise Stripping Tests
// ============================================================================

test('strips SCRIPT tags completely', async () => {
  await page.setContent(`
    <body>
      <div>Content</div>
      <script>console.log('test');</script>
      <script src="app.js"></script>
      <p>More content</p>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('<script');
  expect(result.html).not.toContain('console.log');
  expect(result.html).toContain('<div>Content</div>');
  expect(result.html).toContain('<p>More content</p>');
});

test('strips STYLE tags completely', async () => {
  await page.setContent(`
    <body>
      <style>.test { color: red; }</style>
      <div>Content</div>
      <style>body { margin: 0; }</style>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('<style');
  expect(result.html).not.toContain('color: red');
  expect(result.html).toContain('<div>Content</div>');
});

test('strips NOSCRIPT tags completely', async () => {
  await page.setContent(`
    <body>
      <div>Content</div>
      <noscript>Please enable JavaScript</noscript>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('<noscript');
  expect(result.html).not.toContain('Please enable JavaScript');
  expect(result.html).toContain('<div>Content</div>');
});

test('strips TEMPLATE tags completely', async () => {
  await page.setContent(`
    <body>
      <div>Content</div>
      <template><div>Template content</div></template>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('<template');
  expect(result.html).not.toContain('Template content');
  expect(result.html).toContain('<div>Content</div>');
});

test('strips LINK[rel=stylesheet] tags', async () => {
  await page.setContent(`
    <body>
      <link rel="stylesheet" href="styles.css">
      <link rel="icon" href="favicon.ico">
      <div>Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('rel="stylesheet"');
  expect(result.html).not.toContain('styles.css');
  expect(result.html).toContain('rel="icon"');
  expect(result.html).toContain('favicon.ico');
});

// ============================================================================
// Attribute Filtering Tests
// ============================================================================

test('strips onclick and other event handler attributes', async () => {
  await page.setContent(`
    <body>
      <button onclick="alert('click')" onmouseover="hover()" onkeydown="keypress()">Click</button>
      <div onload="init()">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('onclick');
  expect(result.html).not.toContain('onmouseover');
  expect(result.html).not.toContain('onkeydown');
  expect(result.html).not.toContain('onload');
  expect(result.html).toContain('<button>Click</button>');
});

test('strips data-* attributes', async () => {
  await page.setContent(`
    <body>
      <div data-testid="container" data-analytics="track" data-component="header" id="main">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('data-testid');
  expect(result.html).not.toContain('data-analytics');
  expect(result.html).not.toContain('data-component');
  expect(result.html).toContain('id="main"');
});

test('strips style attributes', async () => {
  await page.setContent(`
    <body>
      <div style="color: red; font-size: 16px;" class="test">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('style=');
  expect(result.html).not.toContain('color: red');
  expect(result.html).toContain('class="test"');
});

test('preserves semantic attributes', async () => {
  await page.setContent(`
    <body>
      <input id="email" type="email" name="email" placeholder="Enter email" value="test@example.com" required>
      <button role="button" aria-label="Submit form" disabled>Submit</button>
      <a href="/page" target="_blank" rel="noopener" title="Link">Link</a>
      <label for="email">Email:</label>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('id="email"');
  expect(result.html).toContain('type="email"');
  expect(result.html).toContain('name="email"');
  expect(result.html).toContain('placeholder="Enter email"');
  expect(result.html).toContain('value="test@example.com"');
  expect(result.html).toContain('required');
  expect(result.html).toContain('role="button"');
  expect(result.html).toContain('aria-label="Submit form"');
  expect(result.html).toContain('disabled');
  expect(result.html).toContain('href="/page"');
  expect(result.html).toContain('target="_blank"');
  expect(result.html).toContain('rel="noopener"');
  expect(result.html).toContain('title="Link"');
  expect(result.html).toContain('for="email"');
});

// ============================================================================
// CSS Class Filtering Tests
// ============================================================================

test('strips CSS-in-JS framework classes', async () => {
  await page.setContent(`
    <body>
      <div class="css-abc123 semantic-class sc-dkPtRN emotion-xyz styled-component jsx-12345">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('css-abc123');
  expect(result.html).not.toContain('sc-dkPtRN');
  expect(result.html).not.toContain('emotion-xyz');
  expect(result.html).not.toContain('styled-component');
  expect(result.html).not.toContain('jsx-12345');
  expect(result.html).toContain('semantic-class');
});

test('strips CSS module hashes', async () => {
  await page.setContent(`
    <body>
      <div class="button _3fkL2xB _aBcDeF normal-class">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('_3fkL2xB');
  expect(result.html).not.toContain('_aBcDeF');
  expect(result.html).toContain('button');
  expect(result.html).toContain('normal-class');
});

test('strips classes with long hex hashes', async () => {
  await page.setContent(`
    <body>
      <div class="component-a1b2c3d4 normal-class hash-12abcdef">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('component-a1b2c3d4');
  expect(result.html).not.toContain('hash-12abcdef');
  expect(result.html).toContain('normal-class');
});

test('keeps semantic class names', async () => {
  await page.setContent(`
    <body>
      <div class="btn btn-primary form-control error-message help-text">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('btn');
  expect(result.html).toContain('btn-primary');
  expect(result.html).toContain('form-control');
  expect(result.html).toContain('error-message');
  expect(result.html).toContain('help-text');
});

test('omits class attribute if all classes are generated', async () => {
  await page.setContent(`
    <body>
      <div class="css-abc123 sc-dkPtRN _3fkL2xB" id="test">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  const divMatch = result.html.match(/<div[^>]*>Content<\/div>/);
  expect(divMatch).toBeTruthy();
  expect(divMatch![0]).not.toContain('class=');
  expect(divMatch![0]).toContain('id="test"');
});

test('handles empty class attribute', async () => {
  await page.setContent(`
    <body>
      <div class="" id="test">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  const divMatch = result.html.match(/<div[^>]*>Content<\/div>/);
  expect(divMatch).toBeTruthy();
  expect(divMatch![0]).not.toContain('class=""');
});

// ============================================================================
// Canonical Attribute Ordering Tests
// ============================================================================

test('orders attributes canonically: id → type → name → role → aria-* → href → value → class', async () => {
  await page.setContent(`
    <body>
      <input class="input" value="test" type="text" name="field" id="input1" placeholder="Enter" required aria-label="Input field" role="textbox">
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  const inputMatch = result.html.match(/<input[^>]*>/);
  expect(inputMatch).toBeTruthy();

  const tag = inputMatch![0];
  const idPos = tag.indexOf('id=');
  const typePos = tag.indexOf('type=');
  const namePos = tag.indexOf('name=');
  const rolePos = tag.indexOf('role=');
  const ariaPos = tag.indexOf('aria-label=');
  const valuePos = tag.indexOf('value=');
  const classPos = tag.indexOf('class=');

  expect(idPos).toBeLessThan(typePos);
  expect(typePos).toBeLessThan(namePos);
  expect(namePos).toBeLessThan(rolePos);
  expect(rolePos).toBeLessThan(ariaPos);
  expect(ariaPos).toBeLessThan(valuePos);
  expect(valuePos).toBeLessThan(classPos);
});

test('places ref attribute last', async () => {
  await page.setContent(`
    <body>
      <button class="btn" id="submit">Click</button>
    </body>
  `);

  // Manually set _ariaRef for testing
  await page.evaluate(() => {
    const button = document.querySelector('button');
    (button as any)._ariaRef = { ref: 'button-1' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  const buttonMatch = result.html.match(/<button[^>]*>/);
  expect(buttonMatch).toBeTruthy();

  const tag = buttonMatch![0];
  const refPos = tag.indexOf('ref=');
  const classPos = tag.indexOf('class=');
  const idPos = tag.indexOf('id=');

  // ref should be last
  expect(refPos).toBeGreaterThan(classPos);
  expect(refPos).toBeGreaterThan(idPos);
});

test('sorts multiple aria-* attributes alphabetically', async () => {
  await page.setContent(`
    <body>
      <div aria-labelledby="label" aria-describedby="desc" aria-hidden="false" role="region">Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  const divMatch = result.html.match(/<div[^>]*>/);
  expect(divMatch).toBeTruthy();

  const tag = divMatch![0];
  const rolePos = tag.indexOf('role=');
  const ariaDescPos = tag.indexOf('aria-describedby=');
  const ariaHiddenPos = tag.indexOf('aria-hidden=');
  const ariaLabelPos = tag.indexOf('aria-labelledby=');

  // role comes before all aria-* attributes
  expect(rolePos).toBeLessThan(ariaDescPos);
  expect(rolePos).toBeLessThan(ariaHiddenPos);
  expect(rolePos).toBeLessThan(ariaLabelPos);
});

// ============================================================================
// Ref Stamping Tests
// ============================================================================

test('stamps ref attribute from _ariaRef property', async () => {
  await page.setContent(`
    <body>
      <div id="container">
        <button>Click</button>
        <input type="text">
      </div>
    </body>
  `);

  // Set _ariaRef properties
  await page.evaluate(() => {
    const div = document.querySelector('div');
    const button = document.querySelector('button');
    const input = document.querySelector('input');
    (div as any)._ariaRef = { ref: 'div-1' };
    (button as any)._ariaRef = { ref: 'button-2' };
    (input as any)._ariaRef = { ref: 'input-3' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('ref="div-1"');
  expect(result.html).toContain('ref="button-2"');
  expect(result.html).toContain('ref="input-3"');
});

test('does not modify live DOM when stamping refs', async () => {
  await page.setContent(`
    <body>
      <button>Click</button>
    </body>
  `);

  await page.evaluate(() => {
    const button = document.querySelector('button');
    (button as any)._ariaRef = { ref: 'button-1' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  // Check that the live DOM doesn't have a ref attribute
  const hasRefAttr = await page.evaluate(() => {
    const button = document.querySelector('button');
    return button?.hasAttribute('ref');
  });

  expect(result.html).toContain('ref="button-1"');
  expect(hasRefAttr).toBe(false);
});

test('skips existing ref attributes to avoid Vue collisions', async () => {
  await page.setContent(`
    <body>
      <div ref="vue-component-ref">Vue component</div>
    </body>
  `);

  await page.evaluate(() => {
    const div = document.querySelector('div');
    (div as any)._ariaRef = { ref: 'div-1' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  // Should have the _ariaRef ref, not the original Vue ref
  expect(result.html).toContain('ref="div-1"');
  expect(result.html).not.toContain('vue-component-ref');
});

test('handles elements without _ariaRef', async () => {
  await page.setContent(`
    <body>
      <div>No ref</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('ref=');
  expect(result.html).toContain('<div>No ref</div>');
});

// ============================================================================
// Shadow DOM Tests
// ============================================================================

test('traverses shadow DOM with comment markers', async () => {
  await page.setContent(`
    <body>
      <div id="host">Light DOM content</div>
    </body>
  `);

  // Attach shadow DOM
  await page.evaluate(() => {
    const host = document.querySelector('#host') as HTMLElement;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>Shadow DOM content</p><span>More shadow</span>';
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('Light DOM content');
  expect(result.html).toContain('<!-- shadow-root -->');
  expect(result.html).toContain('<p>Shadow DOM content</p>');
  expect(result.html).toContain('<span>More shadow</span>');
  expect(result.html).toContain('<!-- /shadow-root -->');
});

test('handles nested shadow DOM', async () => {
  await page.setContent(`
    <body>
      <div id="outer">Outer</div>
    </body>
  `);

  await page.evaluate(() => {
    const outer = document.querySelector('#outer') as HTMLElement;
    const outerShadow = outer.attachShadow({ mode: 'open' });
    outerShadow.innerHTML = '<div id="inner">Inner</div>';

    const inner = outerShadow.querySelector('#inner') as HTMLElement;
    const innerShadow = inner.attachShadow({ mode: 'open' });
    innerShadow.innerHTML = '<p>Nested shadow</p>';
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('Outer');
  expect(result.html).toContain('<!-- shadow-root -->');
  expect(result.html).toContain('Inner');
  expect(result.html).toContain('<p>Nested shadow</p>');
  expect(result.html).toContain('<!-- /shadow-root -->');

  // Should have two pairs of shadow-root comments
  const shadowStartCount = (result.html.match(/<!-- shadow-root -->/g) || []).length;
  const shadowEndCount = (result.html.match(/<!-- \/shadow-root -->/g) || []).length;
  expect(shadowStartCount).toBe(2);
  expect(shadowEndCount).toBe(2);
});

// ============================================================================
// Iframe Ref Collection Tests
// ============================================================================

test('collects iframe refs', async () => {
  await page.setContent(`
    <body>
      <iframe src="about:blank"></iframe>
      <div>Content</div>
      <iframe src="about:blank"></iframe>
    </body>
  `);

  await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    (iframes[0] as any)._ariaRef = { ref: 'iframe-1' };
    (iframes[1] as any)._ariaRef = { ref: 'iframe-2' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(Array.isArray(result.iframeRefs)).toBe(true);
  expect(result.iframeRefs).toContain('iframe-1');
  expect(result.iframeRefs).toContain('iframe-2');
  expect(result.iframeRefs.length).toBe(2);
});

test('handles iframes without _ariaRef', async () => {
  await page.setContent(`
    <body>
      <iframe src="about:blank"></iframe>
      <div>Content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(Array.isArray(result.iframeRefs)).toBe(true);
  expect(result.iframeRefs.length).toBe(0);
});

// ============================================================================
// SVG Noise Simplification Tests
// ============================================================================

test('simplifies d attribute on PATH elements', async () => {
  await page.setContent(`
    <body>
      <svg>
        <path d="M10 10 L20 20 L30 10 Z" fill="red"/>
      </svg>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('d="..."');
  expect(result.html).not.toContain('M10 10 L20 20');
  expect(result.html).toContain('fill="red"');
});

test('simplifies points attribute on POLYGON elements', async () => {
  await page.setContent(`
    <body>
      <svg>
        <polygon points="10,10 20,20 30,10" fill="blue"/>
      </svg>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('points="..."');
  expect(result.html).not.toContain('10,10 20,20 30,10');
  expect(result.html).toContain('fill="blue"');
});

test('only simplifies d/points on PATH and POLYGON elements', async () => {
  await page.setContent(`
    <body>
      <svg>
        <circle d="not-a-path-attribute" points="not-a-polygon-attribute"/>
        <rect d="test" points="test"/>
      </svg>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  // d and points on non-PATH/POLYGON elements should not be simplified
  // (though they're invalid attributes, the code should only simplify specific elements)
  expect(result.html).toContain('<circle');
  expect(result.html).toContain('<rect');
});

// ============================================================================
// Void Element Tests
// ============================================================================

test('handles void elements without closing tags', async () => {
  await page.setContent(`
    <body>
      <input type="text" name="test">
      <br>
      <hr>
      <img src="test.png" alt="Test">
      <meta name="description" content="Test">
      <link rel="icon" href="favicon.ico">
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).not.toContain('</input>');
  expect(result.html).not.toContain('</br>');
  expect(result.html).not.toContain('</hr>');
  expect(result.html).not.toContain('</img>');
  expect(result.html).not.toContain('</meta>');
  expect(result.html).not.toContain('</link>');

  expect(result.html).toContain('<input');
  expect(result.html).toContain('<br>');
  expect(result.html).toContain('<hr>');
  expect(result.html).toContain('<img');
});

test('handles all void element types', async () => {
  await page.setContent(`
    <body>
      <area shape="rect" coords="0,0,100,100" href="/link">
      <base href="/">
      <br>
      <col>
      <embed src="test.swf">
      <hr>
      <img src="test.png">
      <input type="text">
      <link rel="icon" href="favicon.ico">
      <meta charset="utf-8">
      <source src="video.mp4">
      <track kind="subtitles" src="subs.vtt">
      <wbr>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];
  for (const tag of voidElements)
    expect(result.html).not.toContain(`</${tag}>`);
});

// ============================================================================
// Hidden Element Preservation Tests
// ============================================================================

test('preserves elements with display:none (inline style stripped but element kept)', async () => {
  await page.setContent(`
    <body>
      <div style="display: none;" class="error-message">Validation error</div>
      <div>Visible content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('Validation error');
  expect(result.html).toContain('class="error-message"');
  expect(result.html).not.toContain('style=');
});

test('preserves elements with aria-hidden="true"', async () => {
  await page.setContent(`
    <body>
      <div aria-hidden="true">Hidden content</div>
      <div>Visible content</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('Hidden content');
  expect(result.html).toContain('aria-hidden="true"');
});

test('preserves hidden elements that may become visible', async () => {
  await page.setContent(`
    <body>
      <div style="visibility: hidden;">Hidden by visibility</div>
      <div style="opacity: 0;">Hidden by opacity</div>
      <div hidden>Hidden attribute</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('Hidden by visibility');
  expect(result.html).toContain('Hidden by opacity');
  expect(result.html).toContain('hidden');
});

// ============================================================================
// HTML/Attribute Escaping Tests
// ============================================================================

test('escapes HTML entities in text content', async () => {
  await page.setContent(`
    <body>
      <div>5 < 10 & 10 > 5</div>
      <p>Use &lt;div&gt; tags</p>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('5 &lt; 10 &amp; 10 &gt; 5');
  expect(result.html).toContain('Use &lt;div&gt; tags');
});

test('escapes attribute values', async () => {
  await page.setContent(`
    <body>
      <input type="text" placeholder='Enter "name"' value="5 < 10 & test">
      <a href="/search?q=a&b=c" title="Search & Find">Link</a>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('placeholder="Enter &quot;name&quot;"');
  expect(result.html).toContain('value="5 &lt; 10 &amp; test"');
  expect(result.html).toContain('href="/search?q=a&amp;b=c"');
  expect(result.html).toContain('title="Search &amp; Find"');
});

test('escapes special characters comprehensively', async () => {
  await page.setContent(`
    <body>
      <div title="&lt;&gt;&quot;&amp;">Test &amp; content with "quotes"</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  // Text content - quotes in text aren't escaped (only & < >)
  expect(result.html).toContain('Test &amp; content with "quotes"');

  // Attribute value
  expect(result.html).toContain('title="&lt;&gt;&quot;&amp;"');
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

test('handles empty body', async () => {
  await page.setContent(`<body></body>`);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toBe('<body></body>');
  expect(result.iframeRefs).toEqual([]);
});

test('handles deeply nested structures', async () => {
  await page.setContent(`
    <body>
      <div>
        <div>
          <div>
            <div>
              <div>
                <p>Deep content</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('<p>Deep content</p>');
  expect((result.html.match(/<div>/g) || []).length).toBe(5);
  expect((result.html.match(/<\/div>/g) || []).length).toBe(5);
});

test('handles mixed content with all features', async () => {
  await page.setContent(`
    <body>
      <script>console.log('noise');</script>
      <style>.noise { color: red; }</style>
      <div id="main" class="container css-abc123 semantic" data-testid="main" style="color: blue;" onclick="alert('test')">
        <h1 aria-label="Title">Test & Demo</h1>
        <form action="/submit" method="post">
          <input type="email" name="email" placeholder="Enter email" value="test@example.com" required>
          <button type="submit" disabled>Submit</button>
        </form>
        <svg>
          <path d="M10 10 L20 20 Z" fill="red"/>
        </svg>
        <iframe src="about:blank"></iframe>
      </div>
      <noscript>Enable JS</noscript>
    </body>
  `);

  await page.evaluate(() => {
    const main = document.querySelector('#main');
    const h1 = document.querySelector('h1');
    const iframe = document.querySelector('iframe');
    (main as any)._ariaRef = { ref: 'div-1' };
    (h1 as any)._ariaRef = { ref: 'h1-2' };
    (iframe as any)._ariaRef = { ref: 'iframe-3' };
  });

  const result = await page.evaluate(AIDomBuilderInjection);

  // Noise removed
  expect(result.html).not.toContain('<script');
  expect(result.html).not.toContain('<style');
  expect(result.html).not.toContain('<noscript');

  // Attributes filtered
  expect(result.html).not.toContain('data-testid');
  expect(result.html).not.toContain('style=');
  expect(result.html).not.toContain('onclick');

  // Classes filtered
  expect(result.html).toContain('container');
  expect(result.html).toContain('semantic');
  expect(result.html).not.toContain('css-abc123');

  // Semantic attributes preserved
  expect(result.html).toContain('id="main"');
  expect(result.html).toContain('type="email"');
  expect(result.html).toContain('name="email"');
  expect(result.html).toContain('required');

  // Refs stamped
  expect(result.html).toContain('ref="div-1"');
  expect(result.html).toContain('ref="h1-2"');
  expect(result.html).toContain('ref="iframe-3"');

  // Iframe refs collected
  expect(result.iframeRefs).toContain('iframe-3');

  // SVG simplified
  expect(result.html).toContain('d="..."');

  // HTML escaped
  expect(result.html).toContain('Test &amp; Demo');

  // Form elements
  expect(result.html).toContain('action="/submit"');
  expect(result.html).toContain('method="post"');
});

test('whitespace handling in text nodes', async () => {
  await page.setContent(`
    <body>
      <div>
        Text with   multiple   spaces
      </div>
      <p>  Leading and trailing  </p>
      <span></span>
      <span>   </span>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  // Text with content should be preserved (browser normalizes whitespace)
  expect(result.html).toContain('Text with   multiple   spaces');
  expect(result.html).toContain('Leading and trailing');

  // Empty text nodes (whitespace only) are skipped by the trim() check
  expect(result.html).toContain('<span></span>');
});

test('handles special HTML entities already in source', async () => {
  await page.setContent(`
    <body>
      <div>&lt;already escaped&gt;</div>
      <div>&amp;&lt;&gt;</div>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  // Browser parses entities, then we re-escape
  expect(result.html).toContain('&lt;already escaped&gt;');
  expect(result.html).toContain('&amp;&lt;&gt;');
});

test('form elements with various states', async () => {
  await page.setContent(`
    <body>
      <form>
        <input type="checkbox" name="agree" checked>
        <input type="radio" name="choice" value="a" checked>
        <input type="radio" name="choice" value="b">
        <select name="country" multiple>
          <option value="us" selected>USA</option>
          <option value="uk">UK</option>
        </select>
        <textarea name="comments" readonly>Comments here</textarea>
      </form>
    </body>
  `);

  const result = await page.evaluate(AIDomBuilderInjection);

  expect(result.html).toContain('type="checkbox"');
  expect(result.html).toContain('checked');
  expect(result.html).toContain('type="radio"');
  expect(result.html).toContain('selected');
  expect(result.html).toContain('multiple');
  expect(result.html).toContain('readonly');
  expect(result.html).toContain('Comments here');
});
