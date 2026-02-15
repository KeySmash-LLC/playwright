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
    const stateDir = await this._ensureStateDir(context);
    if (!stateDir)
      return undefined;

    // 2. Extract DOM from browser via dedicated protocol method.
    //    extractDomForAI runs in the utility world on the server side:
    //    stamps _ariaRef via snapshot, then runs InjectedScript.extractDomForAI(),
    //    stitches iframe content, and returns complete HTML.
    let rawHtml: string;
    try {
      const result = await page._extractDomForAI();
      rawHtml = result.html;
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

    // Explicit kill switch — multiplexer sets this for domState:false instances
    if (process.env.PW_DOM_STATE_DISABLED)
      return undefined;

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
