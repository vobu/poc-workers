import type { Camunda8 } from "@camunda8/sdk"

import { createLogger } from "../logger.ts"
import { fetchSslLabsReport } from "./ssl-labs.ts"

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

      try {
        const result = await fetchSslLabsReport(domain, { log })
        log(`Final result: ${JSON.stringify(result, null, 2)}`)
        log(`=== JOB END ===`)
        return job.complete(result)
      } catch (error) {
        const errorResult = { error: "Failed to fetch SSL Labs report.", url: domain }
        log(`❌ Exception occurred while completing job: ${error}`)
        log(`Final result: ${JSON.stringify(errorResult, null, 2)}`)
        log(`=== JOB END ===`)
        return job.complete(errorResult)
      }
    }
  })
}
