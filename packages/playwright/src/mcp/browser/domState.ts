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

import fs from 'fs';
import path from 'path';
import { diff } from 'playwright-core/lib/utilsBundle';
import { callOnPageNoTrace } from './tools/utils';
import { AIDomBuilderInjection } from './domExtractor';
import { prettyPrintHtml } from './domPrettyPrint';
import type { Page } from '../../../../playwright-core/src/client/page';
import type { Context } from './context';

export type DomStateResult = {
  domPath: string;
  ariaPath: string;
  diffPath: string | undefined;
  diff: string | undefined;
};

/**
 * DomState orchestrates DOM extraction, pretty-printing, diffing, and file I/O.
 * One instance per Context, maintains state across tool calls.
 */
export class DomState {
  private _previousDom: string | undefined;
  private _diffCounter = 0;
  private _stateDir: string | undefined;

  constructor() {}

  /**
   * Called from Response._build() after captureSnapshot().
   * Extracts DOM, computes diff, writes files to workspace.
   */
  async update(
    page: Page,
    context: Context,
    toolName: string,
    toolArgs: Record<string, any>,
    ariaSnapshot: string,
  ): Promise<DomStateResult | undefined> {
    // 1. Resolve workspace directory — bail early if no workspace root.
    //    Don't run page.evaluate() if we have nowhere to write files.
    const stateDir = await this._ensureStateDir(context);
    if (!stateDir)
      return undefined;

    // 2. Stamp aria refs on DOM elements in the main world.
    //    _ariaRef is set by captureSnapshot() in the utility world, but page.evaluate()
    //    runs in the main world where those JS properties aren't visible. Bridge the gap
    //    by using the aria-ref selector engine to find each element and set _ariaRef.
    try {
      await stampRefsInMainWorld(page, ariaSnapshot);
    } catch {
      // Non-fatal — extraction works without refs, just no cross-referencing
    }

    // 3. Extract DOM from browser.
    //    extractFullDom() runs AIDomBuilderInjection in main frame via page.evaluate(),
    //    then stitches iframe content.
    let rawHtml: string;
    try {
      rawHtml = await extractFullDom(page);
    } catch {
      return undefined;  // page navigated, closed, etc.
    }

    // 3. Pretty-print for clean diffs (js-beautify, force-aligned attributes)
    const dom = prettyPrintHtml(rawHtml);

    // 4. Compute diff against previous
    let diffStr: string | undefined;
    if (this._previousDom !== undefined) {
      const patch = diff.createPatch('dom.html', this._previousDom, dom, undefined, undefined, { context: 3 });
      // createPatch returns header even if no changes — check for actual hunks
      if (patch.includes('@@'))
        diffStr = patch;
    }

    // 5. Write files
    const domPath = path.join(stateDir, 'dom.html');
    const ariaPath = path.join(stateDir, 'accessibility-tree.yaml');
    await fs.promises.writeFile(domPath, dom, 'utf-8');
    await fs.promises.writeFile(ariaPath, ariaSnapshot, 'utf-8');

    // 6. Write diff file
    let diffPath: string | undefined;
    if (diffStr) {
      this._diffCounter++;
      const diffName = formatDiffName(this._diffCounter, toolName, toolArgs);
      const diffsDir = path.join(stateDir, 'diffs');
      await fs.promises.mkdir(diffsDir, { recursive: true });
      diffPath = path.join(diffsDir, diffName);
      await fs.promises.writeFile(diffPath, diffStr, 'utf-8');
    }

    // 7. Update state
    this._previousDom = dom;

    return { domPath, ariaPath, diffPath, diff: diffStr };
  }

  /**
   * Resolve workspace directory with three-tier check:
   * 1. Env vars (multiplexer mode)
   * 2. Explicit roots (standalone mode)
   * 3. Neither → return undefined (DOM state disabled)
   */
  private async _ensureStateDir(context: Context): Promise<string | undefined> {
    if (this._stateDir)
      return this._stateDir;

    const instanceId = process.env.PW_DOM_STATE_INSTANCE_ID;
    const muxWorkspace = process.env.PW_DOM_STATE_WORKSPACE;

    if (instanceId && muxWorkspace) {
      // Multiplexer mode — per-instance directory
      this._stateDir = path.join(muxWorkspace, '.playwright-mcp', 'browser-state', instanceId);
    } else if (context.hasExplicitRoots()) {
      // Standalone mode — single directory
      this._stateDir = path.join(context.firstRootPath()!, '.playwright-mcp', 'browser-state');
    } else {
      // No workspace info at all — skip DOM state entirely
      return undefined;
    }

    await fs.promises.mkdir(this._stateDir, { recursive: true });
    return this._stateDir;
  }

  /**
   * Clean up .playwright-mcp/browser-state/ on MCP instance shutdown.
   * Called from Context.dispose().
   */
  async dispose(): Promise<void> {
    if (this._stateDir) {
      await fs.promises.rm(this._stateDir, { recursive: true, force: true });
      this._stateDir = undefined;
    }
  }
}

/**
 * Bridge refs from utility world to main world.
 * The aria snapshot stamps _ariaRef on elements in the utility world,
 * but page.evaluate() runs in the main world. Use the aria-ref selector
 * engine (which resolves in the utility world) to find each element,
 * then set _ariaRef in the main world so AIDomBuilderInjection can read it.
 */
async function stampRefsInMainWorld(page: Page, ariaSnapshot: string): Promise<void> {
  const refs = [...ariaSnapshot.matchAll(/\[ref=((?:f\d+)?e\d+)\]/g)].map(m => m[1]);
  await Promise.all(refs.map(async ref => {
    try {
      await callOnPageNoTrace(page, p =>
        p.locator(`aria-ref=${ref}`).evaluate((el, r) => {
          (el as any)._ariaRef = { ref: r };
        }, ref, { timeout: 1000 })
      );
    } catch {
      // Element no longer exists or couldn't be resolved — skip
    }
  }));
}

/**
 * Extract full DOM from main frame and stitch iframe content.
 * Runs AIDomBuilderInjection in each frame and inlines the results.
 */
async function extractFullDom(page: Page): Promise<string> {
  // 1. Run AIDomBuilder in main frame
  const main = await callOnPageNoTrace(page, p => p.evaluate(AIDomBuilderInjection)) as { html: string, iframeRefs: string[] };
  let html = main.html;

  // 2. For each iframe ref the builder found, enter the frame and build
  for (const ref of main.iframeRefs) {
    try {
      // Look up the <iframe> element using the aria-ref selector (resolves via utility world)
      const iframeHandle = await callOnPageNoTrace(page, p =>
        p.locator(`aria-ref=${ref}`).elementHandle({ timeout: 1000 })
      );
      if (!iframeHandle)
        continue;

      const frame = await iframeHandle.contentFrame();
      if (!frame)
        continue;

      // Run the same AIDomBuilder inside the child frame
      const child = await frame.evaluate(AIDomBuilderInjection) as { html: string, iframeRefs: string[] };

      // Stitch child HTML into the parent's <iframe> tag.
      // Use regex because the iframe tag has other attributes (id, src, etc.) before ref.
      const iframePattern = new RegExp(`(<iframe[^>]*\\sref="${ref}"[^>]*>)(</iframe>)`);
      html = html.replace(iframePattern, `$1\n<!-- BEGIN IFRAME ${ref} -->\n${child.html}\n<!-- END IFRAME ${ref} -->\n$2`);

      // Recurse: if the child frame had iframes too, stitch those
      for (const childRef of child.iframeRefs) {
        try {
          const nestedHandle = await frame.locator(`[data-pw-ref="${childRef}"]`).elementHandle({ timeout: 1000 }).catch(() => null)
            ?? await frame.$(`iframe`);
          if (!nestedHandle)
            continue;

          const nestedFrame = await nestedHandle.contentFrame();
          if (!nestedFrame)
            continue;

          const nested = await nestedFrame.evaluate(AIDomBuilderInjection) as { html: string, iframeRefs: string[] };
          const nestedPattern = new RegExp(`(<iframe[^>]*\\sref="${childRef}"[^>]*>)(</iframe>)`);
          html = html.replace(nestedPattern, `$1\n<!-- BEGIN IFRAME ${childRef} -->\n${nested.html}\n<!-- END IFRAME ${childRef} -->\n$2`);
        } catch {
          // Nested frame unavailable
        }
      }
    } catch {
      // Frame navigated, detached, or cross-origin — leave empty
    }
  }

  return html;
}

/**
 * Format diff filename: 001-navigate-example-com.diff
 * Sanitizes special characters and truncates values.
 */
function formatDiffName(counter: number, toolName: string, toolArgs: Record<string, any>): string {
  const num = String(counter).padStart(3, '0');
  const action = toolName.replace('browser_', '');
  const ref = toolArgs.ref ?? '';
  const value = typeof toolArgs.value === 'string' ? toolArgs.value.slice(0, 20) : '';
  const suffix = [ref, value].filter(Boolean).join('-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-');
  return `${num}-${action}${suffix ? '-' + suffix : ''}.diff`;
}
