export const createLogger = (prefix: string) => (message: string) => {
  console.log(`[${prefix}] ${message}`)
}
