# TICKET-011: DomState Unit Tests

**Status:** COMPLETED
**Priority:** HIGH
**Assignee:** Agent
**Created:** 2026-02-13

## Description

Implement comprehensive unit tests for the DomState class to ensure all functionality is properly covered and to prevent regressions.

## Background

The DomState class (packages/playwright/src/mcp/browser/domState.ts) orchestrates DOM extraction, pretty-printing, diffing, and file I/O. A basic test file exists from TICKET-005, but it needs to be expanded to cover all functionality comprehensively.

## Requirements

### Functional Coverage

1. **_ensureStateDir() three-tier resolution**
   - Multiplexer path with PW_DOM_STATE_INSTANCE_ID + PW_DOM_STATE_WORKSPACE env vars
   - Standalone path with hasExplicitRoots()
   - Returns undefined (disabled) when neither is available
   - Env vars take precedence over explicit roots

2. **Diff generation**
   - First call produces no diff (no previous state)
   - Second call produces diff when DOM changes
   - No diff when DOM unchanged
   - Diff format is valid unified diff with @@ markers

3. **File naming**
   - dom.html written to current state
   - accessibility-tree.yaml written alongside
   - Diffs named sequentially: 001-toolname-ref-value.diff
   - Special characters sanitized
   - Long values truncated to 20 chars

4. **Cleanup (dispose)**
   - Removes state directory
   - Safe to call multiple times
   - Safe to call without prior update

5. **Error handling**
   - Gracefully handles missing/closed page
   - Handles iframe errors (cross-origin, detached)

6. **Integration**
   - Pretty-printing applied to HTML
   - Proper indentation in output

## Technical Approach

- Use @playwright/test framework
- Create mock Page and Context objects for unit testing
- Mock `_wrapApiCall` internal API used by callOnPageNoTrace
- Test isolation: each test creates its own temp directory
- Cleanup: beforeEach/afterEach hooks manage temp dirs and env vars

## Acceptance Criteria

- [ ] All tests pass
- [ ] 16+ test cases covering all requirements
- [ ] Tests use proper mocking to isolate DomState logic
- [ ] No linting errors
- [ ] Tests run in < 2 seconds
- [ ] Can run independently or as part of full suite

## Affected Files

- `tests/mcp/dom-state.spec.ts` (new file, 570 lines)

## Dependencies

None - all implementation tickets are completed and merged.

## Test Results

All 16 tests passing in ~945ms:
- 4 tests for _ensureStateDir resolution
- 2 tests for diff generation
- 5 tests for file naming
- 3 tests for dispose cleanup
- 2 tests for error handling
- 1 test for pretty-printing integration

## Notes

- Tests use mock objects to avoid requiring full Playwright browser
- Mock Page includes `_wrapApiCall` to support callOnPageNoTrace helper
- All tests properly clean up temp directories and env vars
- Tests are deterministic and can run in parallel
