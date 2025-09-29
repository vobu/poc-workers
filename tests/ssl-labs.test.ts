import test from "node:test"
import assert from "node:assert/strict"

import { fetchSslLabsReport } from "../src/workers/ssl-labs.ts"

test("fetchSslLabsReport queries the live SSL Labs endpoint for asdf.com", async () => {
  const result = await fetchSslLabsReport("asdf.com", {
    // Reduce waits so the integration test completes quickly.
    initialDelayMs: 0,
    retryDelayMs: 0,
    maxAttempts: 1
  })

  assert.equal(result.url, "asdf.com")

  if ("report" in result) {
    assert.ok(Array.isArray(result.report))
  } else {
    assert.equal(result.error, "SSL Labs report not ready after multiple attempts.")
  }
})
