import fetch from 'node-fetch'
import {Camunda8} from '@camunda8/sdk'

import chalk from 'chalk'
import * as path from 'path'
import { config } from 'dotenv' 
config()

const c8 = new Camunda8()
const zbc = c8.getZeebeGrpcApiClient()

const getLogger = (prefix: string, color: any) => (msg: string) => console.log(color(`[${prefix}] ${msg}`))


import * as fs from 'fs'

// Confluence worker
const confluencePagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'confluence-pages.json')
const confluencePages = JSON.parse(fs.readFileSync(confluencePagesPath, 'utf-8'))

console.log(`Creating worker...`)
zbc.createWorker({
    taskType: 'confluence',
    fetchVariable: ['pageName'],
    taskHandler: job => {
        const log = getLogger('Confluence Worker', chalk.blueBright)
        log(`handling job of type ${job.type}`)
        const pageNameRaw = job.variables?.['pageName']
        const pageName = typeof pageNameRaw === 'string' ? pageNameRaw : undefined
        let result
        if (pageName && typeof confluencePages === 'object' && Object.prototype.hasOwnProperty.call(confluencePages, pageName)) {
            result = { content: confluencePages[pageName], page: pageName }
        } else {
            result = { availablePages: Object.keys(confluencePages) }
        }
        return job.complete(result)
    }
})

// SharePoint worker
const spPagesPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'sharepoint-pages.json')
const spPages = JSON.parse(fs.readFileSync(spPagesPath, 'utf-8'))

zbc.createWorker({
    taskType: 'sharepoint',
    fetchVariable: ['pageName'],
    taskHandler: job => {
        const log = getLogger('SharePoint Worker', chalk.greenBright)
        log(`handling job of type ${job.type}`)
        const pageNameRaw = job.variables?.['pageName']
        const pageName = typeof pageNameRaw === 'string' ? pageNameRaw : undefined
        let result
        if (pageName && typeof spPages === 'object' && Object.prototype.hasOwnProperty.call(spPages, pageName)) {
            result = { content: spPages[pageName], page: pageName }
        } else {
            result = { availablePages: Object.keys(spPages) }
        }
        return job.complete(result)
    }
})

// SSL Labs worker
zbc.createWorker({
    taskType: 'ssllabs',
    fetchVariable: ['url'],
    taskHandler: async job => {
        const log = getLogger('SSL Labs Worker', chalk.yellowBright)
        log(`handling job of type ${job.type}`)
        const urlRaw = job.variables?.['url']
        const domain = typeof urlRaw === 'string' ? urlRaw : undefined
        if (!domain) {
            return job.complete({ error: 'No URL provided.' })
        }
        const baseUrl = 'https://www.ssllabs.com/ssltest/analyze.html?viaform=true&hideResults=on&latest&d='
        try {
            // Initial request
            const res = await fetch(baseUrl + encodeURIComponent(domain))
            let html = await res.text()
            await new Promise(r => setTimeout(r, 5000)) // initial 5s delay
            let found = false
            let attempts = 0
            // Wait for the rating image to appear in the same HTML (simulate site auto-reload)
            while (!found && attempts < 30) { // up to 2 minutes
                if (html.includes('rating_')) {
                    found = true
                } else {
                    log('SSL Labs report still loading, waiting 4s...')
                    await new Promise(r => setTimeout(r, 4000))
                    // In reality, the site reloads itself, but we can't see new content without a browser.
                    // So we just keep waiting and checking the same HTML.
                }
                attempts++
            }
            if (found) {
                // Find all tables with class reportTable directly in the HTML
                const tableRegex = /<table[^>]*class=["']reportTable["'][^>]*>[\s\S]*?<\/table>/gi
                let tableMatch
                let allTables: Array<Array<{ label: string; value: string }>> = []
                while ((tableMatch = tableRegex.exec(html)) !== null) {
                    const tableHtml = tableMatch[0]
                    // Parse table rows
                    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
                    let rows: Array<{ label: string; value: string }> = []
                    let rowMatch
                    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
                        const rowHtml = rowMatch[1]
                        // Get all cells
                        const cellRegex = /<td[^>]*class=["']tableLabel["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["']tableCell["'][^>]*>([\s\S]*?)<\/td>/i
                        const cellMatch = cellRegex.exec(rowHtml)
                        if (cellMatch) {
                            // Remove HTML tags from cell content
                            const label = cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
                            const value = cellMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
                            rows.push({ label, value })
                        }
                    }
                    allTables.push(rows)
                }
                return job.complete({ report: allTables, url: domain })
            } else {
                return job.complete({ error: 'SSL Labs report not ready after multiple attempts.', url: domain })
            }
        } catch (e) {
            log(`Error fetching SSL Labs report: ${e}`)
            return job.complete({ error: 'Failed to fetch SSL Labs report.', url: domain })
        }
    }
})