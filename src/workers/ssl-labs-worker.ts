import type { Camunda8 } from "@camunda8/sdk"

import { createLogger } from "../logger.ts"

type ZeebeClient = ReturnType<Camunda8["getZeebeGrpcApiClient"]>

export const registerSslLabsWorker = (zbc: ZeebeClient) => {
  console.log(`Creating SSL Labs worker...`)

  zbc.createWorker({
    taskType: "ssllabs",
    fetchVariable: ["url"],
    taskHandler: async (job) => {
      const log = createLogger("SSL Labs Worker")
      log(`=== JOB START ===`)
      log(`Job Key: ${job.key}`)
      log(`Job Type: ${job.type}`)
      log(`Job Variables (raw): ${JSON.stringify(job.variables, null, 2)}`)

      const urlRaw = job.variables?.["url"]
      log(`urlRaw extracted: ${JSON.stringify(urlRaw)} (type: ${typeof urlRaw})`)

      const domain = typeof urlRaw === "string" ? urlRaw : undefined
      log(`domain processed: ${JSON.stringify(domain)}`)

      if (!domain) {
        const errorResult = { error: "No URL provided." }
        log(`❌ No domain provided. Returning error: ${JSON.stringify(errorResult)}`)
        log(`=== JOB END ===`)
        return job.complete(errorResult)
      }

      const baseUrl = "https://www.ssllabs.com/ssltest/analyze.html?viaform=true&hideResults=on&latest&d="
      const fullUrl = baseUrl + encodeURIComponent(domain)
      log(`Full SSL Labs URL: ${fullUrl}`)

      try {
        log(`Making initial request to SSL Labs...`)
        const res = await fetch(fullUrl)
        log(`Initial response status: ${res.status}`)

        let html = await res.text()
        log(`HTML response length: ${html.length} characters`)

        await new Promise((resolve) => setTimeout(resolve, 5000))
        log(`Initial 5s delay completed`)

        let found = false
        let attempts = 0

        while (!found && attempts < 30) {
          log(`Attempt ${attempts + 1}/30: Checking for rating_ in HTML...`)
          if (html.includes("rating_")) {
            found = true
            log(`✅ Rating found in HTML after ${attempts + 1} attempts!`)
          } else {
            log(`❌ SSL Labs report still loading, waiting 4s... (attempt ${attempts + 1}/30)`)
            await new Promise((resolve) => setTimeout(resolve, 4000))
          }
          attempts++
        }

        if (found) {
          log(`Processing HTML tables...`)
          const tableRegex = /<table[^>]*class=["']reportTable["'][^>]*>[\s\S]*?<\/table>/gi
          let tableMatch
          const allTables: Array<Array<{ label: string; value: string }>> = []
          let tableCount = 0

          while ((tableMatch = tableRegex.exec(html)) !== null) {
            tableCount++
            log(`Processing table ${tableCount}...`)
            const tableHtml = tableMatch[0]
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
            const rows: Array<{ label: string; value: string }> = []
            let rowMatch
            let rowCount = 0

            while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
              rowCount++
              const rowHtml = rowMatch[1]
              const cellRegex =
                /<td[^>]*class=["']tableLabel["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["']tableCell["'][^>]*>([\s\S]*?)<\/td>/i
              const cellMatch = cellRegex.exec(rowHtml)
              if (cellMatch) {
                const label = cellMatch[1]
                  .replace(/<[^>]+>/g, "")
                  .replace(/\s+/g, " ")
                  .trim()
                const value = cellMatch[2]
                  .replace(/<[^>]+>/g, "")
                  .replace(/\s+/g, " ")
                  .trim()
                rows.push({ label, value })
                log(`  Row ${rowCount}: "${label}" = "${value}"`)
              }
            }
            log(`Table ${tableCount} processed: ${rows.length} rows`)
            allTables.push(rows)
          }

          const successResult = { report: allTables, url: domain }
          log(
            `✅ SSL Labs analysis complete! Found ${tableCount} tables with total ${allTables.reduce(
              (sum, table) => sum + table.length,
              0
            )} rows`
          )
          log(`Final result: ${JSON.stringify(successResult, null, 2)}`)
          log(`=== JOB END ===`)
          return job.complete(successResult)
        }

        const timeoutResult = { error: "SSL Labs report not ready after multiple attempts.", url: domain }
        log(`❌ Timeout: SSL Labs report not ready after ${attempts} attempts`)
        log(`Final result: ${JSON.stringify(timeoutResult, null, 2)}`)
        log(`=== JOB END ===`)
        return job.complete(timeoutResult)
      } catch (error) {
        const errorResult = { error: "Failed to fetch SSL Labs report.", url: domain }
        log(`❌ Exception occurred: ${error}`)
        log(`Final result: ${JSON.stringify(errorResult, null, 2)}`)
        log(`=== JOB END ===`)
        return job.complete(errorResult)
      }
    }
  })
}
