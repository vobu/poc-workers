import type { Camunda8 } from "@camunda8/sdk"
import * as path from "path"
import * as fs from "fs"

import { createLogger } from "../logger.ts"

type ZeebeClient = ReturnType<Camunda8["getZeebeGrpcApiClient"]>

const confluencePagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "confluence-pages.json")
const confluencePages = JSON.parse(fs.readFileSync(confluencePagesPath, "utf-8"))

export const registerConfluenceWorker = (zbc: ZeebeClient) => {
  console.log(`Creating Confluence worker...`)
  console.log(`Confluence pages loaded:`, Object.keys(confluencePages))

  zbc.createWorker({
    taskType: "confluence",
    fetchVariable: ["pageName"],
    taskHandler: (job) => {
      const log = createLogger("Confluence Worker")
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
}
