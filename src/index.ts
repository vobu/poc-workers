import { Camunda8 } from "@camunda8/sdk"
import fetch from "node-fetch"

import * as path from "path"
import * as fs from "fs"

// only for deployment
import "./health.ts"

const c8 = new Camunda8()
const zbc = c8.getZeebeGrpcApiClient()

const getLogger = (prefix: string) => (msg: string) => console.log(`[${prefix}] ${msg}`)

// Confluence worker
const confluencePagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), "confluence-pages.json")
const confluencePages = JSON.parse(fs.readFileSync(confluencePagesPath, "utf-8"))

console.log(`Creating Confluence worker...`)
console.log(`Confluence pages loaded:`, Object.keys(confluencePages))
zbc.createWorker({
  taskType: "confluence",
  fetchVariable: ["pageName"],
  taskHandler: (job) => {
    const log = getLogger("Confluence Worker")
    log(`=== JOB START ===`)
    log(`Job Key: ${job.key}`)
    log(`Job Type: ${job.type}`)
    log(`Job Variables (raw): ${JSON.stringify(job.variables, null, 2)}`)

    const pageNameRaw = job.variables?.["pageName"]
    log(`pageNameRaw extracted: ${JSON.stringify(pageNameRaw)} (type: ${typeof pageNameRaw})`)

    const pageName = typeof pageNameRaw === "string" ? pageNameRaw : undefined
    log(`pageName processed: ${JSON.stringify(pageName)}`)

    log(`Available pages in confluencePages: ${Object.keys(confluencePages).join(", ")}`)
    log(`Looking for page: "${pageName}"`)
    log(
      `Page exists in object: ${
        pageName ? Object.prototype.hasOwnProperty.call(confluencePages, pageName) : "false (no pageName)"
      }`
    )

    let result
    if (
      pageName &&
      typeof confluencePages === "object" &&
      Object.prototype.hasOwnProperty.call(confluencePages, pageName)
    ) {
      result = { content: confluencePages[pageName], page: pageName }
      log(`✅ Page found! Returning content for: "${pageName}"`)
    } else {
      result = { availablePages: Object.keys(confluencePages) }
      log(`❌ Page not found. Returning available pages list.`)
    }

    log(`Final result: ${JSON.stringify(result, null, 2)}`)
    log(`=== JOB END ===`)
    return job.complete(result)
  }
})

// SharePoint worker
const spPagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), "sharepoint-pages.json")
const spPages = JSON.parse(fs.readFileSync(spPagesPath, "utf-8"))

console.log(`Creating SharePoint worker...`)
console.log(`SharePoint pages loaded:`, Object.keys(spPages))
zbc.createWorker({
  taskType: "sharepoint",
  fetchVariable: ["pageName"],
  taskHandler: (job) => {
    const log = getLogger("SharePoint Worker")
    log(`=== JOB START ===`)
    log(`Job Key: ${job.key}`)
    log(`Job Type: ${job.type}`)
    log(`Job Variables (raw): ${JSON.stringify(job.variables, null, 2)}`)

    const pageNameRaw = job.variables?.["pageName"]
    log(`pageNameRaw extracted: ${JSON.stringify(pageNameRaw)} (type: ${typeof pageNameRaw})`)

    const pageName = typeof pageNameRaw === "string" ? pageNameRaw : undefined
    log(`pageName processed: ${JSON.stringify(pageName)}`)

    log(`Available pages in spPages: ${Object.keys(spPages).join(", ")}`)
    log(`Looking for page: "${pageName}"`)
    log(
      `Page exists in object: ${
        pageName ? Object.prototype.hasOwnProperty.call(spPages, pageName) : "false (no pageName)"
      }`
    )

    let result
    if (pageName && typeof spPages === "object" && Object.prototype.hasOwnProperty.call(spPages, pageName)) {
      result = { content: spPages[pageName], page: pageName }
      log(`✅ Page found! Returning content for: "${pageName}"`)
    } else {
      result = { availablePages: Object.keys(spPages) }
      log(`❌ Page not found. Returning available pages list.`)
    }

    log(`Final result: ${JSON.stringify(result, null, 2)}`)
    log(`=== JOB END ===`)
    return job.complete(result)
  }
})

// SSL Labs worker
console.log(`Creating SSL Labs worker...`)
zbc.createWorker({
  taskType: "ssllabs",
  fetchVariable: ["url"],
  taskHandler: async (job) => {
    const log = getLogger("SSL Labs Worker")
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
      // Initial request
      log(`Making initial request to SSL Labs...`)
      const res = await fetch(fullUrl)
      log(`Initial response status: ${res.status}`)

      let html = await res.text()
      log(`HTML response length: ${html.length} characters`)

      await new Promise((r) => setTimeout(r, 5000)) // initial 5s delay
      log(`Initial 5s delay completed`)

      let found = false
      let attempts = 0
      // Wait for the rating image to appear in the same HTML (simulate site auto-reload)
      while (!found && attempts < 30) {
        // up to 2 minutes
        log(`Attempt ${attempts + 1}/30: Checking for rating_ in HTML...`)
        if (html.includes("rating_")) {
          found = true
          log(`✅ Rating found in HTML after ${attempts + 1} attempts!`)
        } else {
          log(`❌ SSL Labs report still loading, waiting 4s... (attempt ${attempts + 1}/30)`)
          await new Promise((r) => setTimeout(r, 4000))
          // In reality, the site reloads itself, but we can't see new content without a browser.
          // So we just keep waiting and checking the same HTML.
        }
        attempts++
      }

      if (found) {
        log(`Processing HTML tables...`)
        // Find all tables with class reportTable directly in the HTML
        const tableRegex = /<table[^>]*class=["']reportTable["'][^>]*>[\s\S]*?<\/table>/gi
        let tableMatch
        let allTables: Array<Array<{ label: string; value: string }>> = []
        let tableCount = 0

        while ((tableMatch = tableRegex.exec(html)) !== null) {
          tableCount++
          log(`Processing table ${tableCount}...`)
          const tableHtml = tableMatch[0]
          // Parse table rows
          const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
          let rows: Array<{ label: string; value: string }> = []
          let rowMatch
          let rowCount = 0

          while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            rowCount++
            const rowHtml = rowMatch[1]
            // Get all cells
            const cellRegex =
              /<td[^>]*class=["']tableLabel["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["']tableCell["'][^>]*>([\s\S]*?)<\/td>/i
            const cellMatch = cellRegex.exec(rowHtml)
            if (cellMatch) {
              // Remove HTML tags from cell content
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
      } else {
        const timeoutResult = { error: "SSL Labs report not ready after multiple attempts.", url: domain }
        log(`❌ Timeout: SSL Labs report not ready after ${attempts} attempts`)
        log(`Final result: ${JSON.stringify(timeoutResult, null, 2)}`)
        log(`=== JOB END ===`)
        return job.complete(timeoutResult)
      }
    } catch (e) {
      const errorResult = { error: "Failed to fetch SSL Labs report.", url: domain }
      log(`❌ Exception occurred: ${e}`)
      log(`Final result: ${JSON.stringify(errorResult, null, 2)}`)
      log(`=== JOB END ===`)
      return job.complete(errorResult)
    }
  }
})
