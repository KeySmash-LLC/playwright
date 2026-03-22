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

import { z } from 'playwright-core/lib/mcpBundle';
import { formatObject } from 'playwright-core/lib/utils';

import { defineTabTool, defineTool } from './tool';
import { prettyPrintHtml } from '../domPrettyPrint';

const snapshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_snapshot',
    title: 'Page snapshot',
    description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
    inputSchema: z.object({
      filename: z.string().optional().describe('Save snapshot to markdown file instead of returning it in the response.'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    await context.ensureTab();
    response.setIncludeFullSnapshot(params.filename);
  },
});

const domSnapshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_dom_snapshot',
    title: 'DOM snapshot',
    description: 'Return the ref-annotated DOM HTML of the current page. Unlike browser_snapshot (which returns an accessibility tree), this returns the actual page DOM with CSS classes, attributes, and ref annotations matching the accessibility snapshot refs. Use this when you need real CSS selectors.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, _params, response) => {
    const t0 = performance.now();
    await context.ensureTab();
    const tab = context.currentTabOrDie();
    const t1 = performance.now();
    // Force a fresh aria snapshot to stamp ref attributes on DOM nodes.
    await tab.captureSnapshot(undefined);
    const t2 = performance.now();
    // Stamp live JS property values onto HTML attributes so the serialized
    // DOM reflects the current form state (not just initial attributes).
    // Without this, dynamically-filled inputs show value="" in the HTML.
    await tab.page.evaluate(() => {
      for (const el of document.querySelectorAll('input, textarea')) {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        if (input.value)
          input.setAttribute('value', input.value);
        if ('checked' in input && (input as HTMLInputElement).checked)
          input.setAttribute('checked', '');
      }
      for (const el of document.querySelectorAll('select')) {
        const select = el as HTMLSelectElement;
        for (const opt of select.options) {
          if (opt.selected)
            opt.setAttribute('selected', '');
          else
            opt.removeAttribute('selected');
        }
      }
    });
    const t3 = performance.now();
    // Extract the ref-annotated, stripped, pretty-printed DOM.
    const result = await tab.page._extractDomForAI();
    const t4 = performance.now();
    const dom = prettyPrintHtml(result.html);
    const t5 = performance.now();
    const fs = await import('fs');
    fs.appendFileSync('/tmp/dom_snapshot_profile.log', `ensureTab=${(t1-t0).toFixed(1)}ms ariaSnap=${(t2-t1).toFixed(1)}ms formStamp=${(t3-t2).toFixed(1)}ms extract=${(t4-t3).toFixed(1)}ms prettyPrint=${(t5-t4).toFixed(1)}ms total=${(t5-t0).toFixed(1)}ms html=${(result.html.length/1024).toFixed(0)}kB\n`);
    response.addTextResult(dom);
  },
});

export const elementSchema = z.object({
  element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().describe('Exact target element reference from the page snapshot'),
});

const clickSchema = elementSchema.extend({
  doubleClick: z.boolean().optional().describe('Whether to perform a double click instead of a single click'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Button to click, defaults to left'),
  modifiers: z.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])).optional().describe('Modifier keys to press'),
});

const click = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_click',
    title: 'Click',
    description: 'Perform click on a web page',
    inputSchema: clickSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const { locator, resolved } = await tab.refLocator(params);
    const options = {
      button: params.button,
      modifiers: params.modifiers,
    };
    const formatted = formatObject(options, ' ', 'oneline');
    const optionsAttr = formatted !== '{}' ? formatted : '';

    if (params.doubleClick)
      response.addCode(`await page.${resolved}.dblclick(${optionsAttr});`);
    else
      response.addCode(`await page.${resolved}.click(${optionsAttr});`);

    await tab.waitForCompletion(async () => {
      if (params.doubleClick)
        await locator.dblclick(options);
      else
        await locator.click(options);
    });
  },
});

const drag = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_drag',
    title: 'Drag mouse',
    description: 'Perform drag and drop between two elements',
    inputSchema: z.object({
      startElement: z.string().describe('Human-readable source element description used to obtain the permission to interact with the element'),
      startRef: z.string().describe('Exact source element reference from the page snapshot'),
      endElement: z.string().describe('Human-readable target element description used to obtain the permission to interact with the element'),
      endRef: z.string().describe('Exact target element reference from the page snapshot'),
    }),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const [start, end] = await tab.refLocators([
      { ref: params.startRef, element: params.startElement },
      { ref: params.endRef, element: params.endElement },
    ]);

    await tab.waitForCompletion(async () => {
      await start.locator.dragTo(end.locator);
    });

    response.addCode(`await page.${start.resolved}.dragTo(page.${end.resolved});`);
  },
});

const hover = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_hover',
    title: 'Hover mouse',
    description: 'Hover over element on page',
    inputSchema: elementSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.hover();`);

    await tab.waitForCompletion(async () => {
      await locator.hover();
    });
  },
});

const selectOptionSchema = elementSchema.extend({
  values: z.array(z.string()).describe('Array of values to select in the dropdown. This can be a single value or multiple values.'),
});

const selectOption = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_select_option',
    title: 'Select option',
    description: 'Select an option in a dropdown',
    inputSchema: selectOptionSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.selectOption(${formatObject(params.values)});`);

    await tab.waitForCompletion(async () => {
      await locator.selectOption(params.values);
    });
  },
});

const pickLocator = defineTabTool({
  capability: 'testing',
  schema: {
    name: 'browser_generate_locator',
    title: 'Create locator for element',
    description: 'Generate locator for the given element to use in tests',
    inputSchema: elementSchema,
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { resolved } = await tab.refLocator(params);
    response.addTextResult(resolved);
  },
});

const check = defineTabTool({
  capability: 'core-input',
  skillOnly: true,

  schema: {
    name: 'browser_check',
    title: 'Check',
    description: 'Check a checkbox or radio button',
    inputSchema: elementSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.check();`);
    await locator.check();
  },
});

const uncheck = defineTabTool({
  capability: 'core-input',
  skillOnly: true,
  schema: {
    name: 'browser_uncheck',
    title: 'Uncheck',
    description: 'Uncheck a checkbox or radio button',
    inputSchema: elementSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.uncheck();`);
    await locator.uncheck();
  },
});

const domSnapshotRaw = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_dom_snapshot_raw',
    title: 'DOM snapshot (raw)',
    description: 'Return the ref-annotated DOM HTML without pretty-printing. Faster than browser_dom_snapshot — use when the consumer parses the HTML programmatically and does not need human-readable formatting.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, _params, response) => {
    await context.ensureTab();
    const tab = context.currentTabOrDie();
    await tab.captureSnapshot(undefined);
    await tab.page.evaluate(() => {
      for (const el of document.querySelectorAll('input, textarea')) {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        if (input.value)
          input.setAttribute('value', input.value);
        if ('checked' in input && (input as HTMLInputElement).checked)
          input.setAttribute('checked', '');
      }
      for (const el of document.querySelectorAll('select')) {
        const select = el as HTMLSelectElement;
        for (const opt of select.options) {
          if (opt.selected)
            opt.setAttribute('selected', '');
          else
            opt.removeAttribute('selected');
        }
      }
    });
    const result = await tab.page._extractDomForAI();
    response.addTextResult(result.html);
  },
});

export default [
  snapshot,
  domSnapshot,
  domSnapshotRaw,
  click,
  drag,
  hover,
  selectOption,
  pickLocator,
  check,
  uncheck,
];
