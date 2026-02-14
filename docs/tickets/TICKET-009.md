# TICKET-009: Comprehensive DOM Extractor Unit Tests

**Status:** COMPLETED
**Priority:** HIGH
**Created:** 2026-02-13

## Summary
Expand the existing basic test file at `tests/mcp/dom-extractor.spec.ts` with comprehensive unit tests covering all DOM extraction functionality of the AIDomBuilderInjection function.

## Context
The AIDomBuilderInjection function at `packages/playwright/src/mcp/browser/domExtractor.ts` is a critical component that runs inside page.evaluate() to extract clean, AI-friendly DOM representations. While basic integration tests exist, comprehensive unit tests are needed to ensure all edge cases and functionality are properly covered.

## Dependencies
- TICKET-003 (COMPLETED) - Basic test file exists

## Acceptance Criteria
All tests must pass and cover:

1. **Noise Stripping:**
   - SCRIPT tags are removed
   - STYLE tags are removed
   - NOSCRIPT tags are removed
   - TEMPLATE tags are removed
   - LINK[rel=stylesheet] tags are removed

2. **Attribute Filtering:**
   - onclick and other event handler attributes are stripped
   - data-* attributes are stripped
   - style attributes are stripped
   - Semantic attributes are preserved (id, name, type, role, aria-*, href, value, class)

3. **CSS Class Filtering:**
   - Generated CSS-in-JS classes (css-, sc-, emotion-, styled-, jsx-) are stripped
   - CSS module hashes (_3fkL2xB) are stripped
   - Long hex hashes are stripped
   - Semantic class names are preserved
   - Empty class attributes are omitted

4. **Canonical Attribute Ordering:**
   - id → type → name → role → aria-* → href → value → class → ref
   - Order is stable for consistent diffs

5. **Ref Stamping:**
   - Reads _ariaRef property from elements
   - Stamps ref attribute in serialized HTML
   - Does not modify live DOM
   - Skips existing ref attributes (Vue collision prevention)

6. **Shadow DOM Traversal:**
   - Crosses shadow boundaries
   - Adds `<!-- shadow-root -->` and `<!-- /shadow-root -->` comment markers
   - Serializes shadow content

7. **Iframe Ref Collection:**
   - Collects refs from iframe elements
   - Returns array of iframe refs

8. **SVG Noise Simplification:**
   - Replaces `d` attribute on PATH elements with "..."
   - Replaces `points` attribute on POLYGON elements with "..."

9. **Void Element Handling:**
   - Self-closing tags for AREA, BASE, BR, COL, EMBED, HR, IMG, INPUT, LINK, META, SOURCE, TRACK, WBR
   - No closing tags for void elements

10. **Hidden Element Preservation:**
    - Elements with display:none are kept
    - Elements with aria-hidden="true" are kept
    - Rationale: may become visible (validation errors, etc.)

11. **HTML/Attribute Escaping:**
    - Text content: & → &amp;, < → &lt;, > → &gt;
    - Attribute values: & → &amp;, " → &quot;, < → &lt;, > → &gt;

## Technical Approach
- Use @playwright/test framework
- Tests execute in worktree `.worktree/ticket-009`
- Use page.setContent() to create test DOM structures
- Use page.evaluate() with actual AIDomBuilderInjection function
- Import from `/packages/playwright/src/mcp/browser/domExtractor.ts`
- Each test validates specific functionality with clear assertions
- Tests use real DOM content, not mocks
- Minimum 80% code coverage

## Testing Strategy
- Write comprehensive tests FIRST covering all acceptance criteria
- Run tests with: `cd .worktree/ticket-009 && npx playwright test tests/mcp/dom-extractor.spec.ts --browser=chromium`
- All tests must pass before marking complete
- Use clear test names that describe behavior being tested
- Follow arrange-act-assert pattern

## Affected Files
- `tests/mcp/dom-extractor.spec.ts` (expand existing tests)

## Notes
- AIDomBuilderInjection is self-contained (runs inside page.evaluate())
- All constants, helpers, and classes are defined inside the function
- Function returns `{ html: string, iframeRefs: string[] }`
- Tests should validate both html output and iframeRefs array
- Shadow DOM tests require browser support for shadow roots
- Ref stamping tests depend on _ariaRef being set on elements
