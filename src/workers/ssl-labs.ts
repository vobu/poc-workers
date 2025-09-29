export type TableRow = { label: string; value: string }
export type SslLabsSuccess = { url: string; report: TableRow[][] }
export type SslLabsError = { url: string; error: string }
export type SslLabsResult = SslLabsSuccess | SslLabsError

export interface FetchSslLabsOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  log?: (message: string) => void
  maxAttempts?: number
  initialDelayMs?: number
  retryDelayMs?: number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const baseUrl = "https://www.ssllabs.com/ssltest/analyze.html?viaform=true&hideResults=on&latest&d="

export const buildSslLabsUrl = (domain: string) => baseUrl + encodeURIComponent(domain)

export const fetchSslLabsReport = async (
  domain: string,
  {
    fetchImpl = fetch,
    sleep = defaultSleep,
    log = () => {},
    maxAttempts = 30,
    initialDelayMs = 5000,
    retryDelayMs = 4000
  }: FetchSslLabsOptions = {}
): Promise<SslLabsResult> => {
  const url = buildSslLabsUrl(domain)

  try {
    log(`Full SSL Labs URL: ${url}`)
    log(`Making initial request to SSL Labs...`)
    const response = await fetchImpl(url)
    log(`Initial response status: ${response.status}`)

    const html = await response.text()
    log(`HTML response length: ${html.length} characters`)

    await sleep(initialDelayMs)
    log(`Initial ${initialDelayMs / 1000}s delay completed`)

    let found = false
    let attempts = 0

    while (!found && attempts < maxAttempts) {
      log(`Attempt ${attempts + 1}/${maxAttempts}: Checking for rating_ in HTML...`)
      if (html.includes("rating_")) {
        found = true
        log(`✅ Rating found in HTML after ${attempts + 1} attempts!`)
      } else {
        log(
          `❌ SSL Labs report still loading, waiting ${retryDelayMs / 1000}s... (attempt ${attempts + 1}/${maxAttempts})`
        )
        await sleep(retryDelayMs)
      }
      attempts++
    }

    if (!found) {
      log(`❌ Timeout: SSL Labs report not ready after ${attempts} attempts`)
      return { error: "SSL Labs report not ready after multiple attempts.", url: domain }
    }

    log(`Processing HTML tables...`)
    const tableRegex = /<table[^>]*class=["']reportTable["'][^>]*>[\s\S]*?<\/table>/gi
    const allTables: TableRow[][] = []
    let tableMatch: RegExpExecArray | null
    let tableCount = 0

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      tableCount++
      log(`Processing table ${tableCount}...`)
      const tableHtml = tableMatch[0]
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      const rows: TableRow[] = []
      let rowMatch: RegExpExecArray | null
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

    log(
      `✅ SSL Labs analysis complete! Found ${tableCount} tables with total ${allTables.reduce(
        (sum, table) => sum + table.length,
        0
      )} rows`
    )

    return { report: allTables, url: domain }
  } catch (error) {
    log(`❌ Exception occurred: ${error}`)
    return { error: "Failed to fetch SSL Labs report.", url: domain }
  }
}
