/**
 * Keep the test suite out of the user's real constitution.
 *
 * `CONSTITUTION_HOME` defaults to ~/.constitution, and the ledger writes there
 * on every decision — so running the tests was quietly appending to the user's
 * own records. Tests that exercise the adapters must land somewhere disposable.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PRIVACY_CONSTITUTION_HOME ??= mkdtempSync(join(tmpdir(), 'pc-test-'));
