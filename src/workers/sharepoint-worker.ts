import type { Camunda8 } from "@camunda8/sdk"
import * as path from "path"
import * as fs from "fs"

import { createLogger } from "../logger.ts"

type ZeebeClient = ReturnType<Camunda8["getZeebeGrpcApiClient"]>

const spPagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "sharepoint-pages.json")
const spPages = JSON.parse(fs.readFileSync(spPagesPath, "utf-8"))

export const registerSharePointWorker = (zbc: ZeebeClient) => {
  console.log(`Creating SharePoint worker...`)
  console.log(`SharePoint pages loaded:`, Object.keys(spPages))

  zbc.createWorker({
    taskType: "sharepoint",
    fetchVariable: ["pageName"],
    taskHandler: (job) => {
      const log = createLogger("SharePoint Worker")
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
}
