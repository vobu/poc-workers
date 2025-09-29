import { Camunda8 } from "@camunda8/sdk"
// only for deployment
import "./health.ts"

import { registerConfluenceWorker } from "./workers/confluence-worker.ts"
import { registerSharePointWorker } from "./workers/sharepoint-worker.ts"
import { registerSslLabsWorker } from "./workers/ssl-labs-worker.ts"

const c8 = new Camunda8()
const zbc = c8.getZeebeGrpcApiClient()

registerConfluenceWorker(zbc)
registerSharePointWorker(zbc)
registerSslLabsWorker(zbc)
