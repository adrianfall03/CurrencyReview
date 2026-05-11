/**
 * Runs in GitHub Actions: uses Playwright (real Chrome) to bypass Akamai WAF,
 * downloads Mizuho quote.csv, then uploads it to Vercel Blob.
 *
 * Requires env vars:
 *   BLOB_READ_WRITE_TOKEN  (from Vercel Blob store settings)
 */

import { chromium } from 'playwright'
import { put, del, list } from '@vercel/blob'

const MIZUHO_URL = 'https://www.mizuhobank.co.jp/market/quote.csv'
const REFERER   = 'https://www.mizuhobank.co.jp/market/index.html'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERROR: BLOB_READ_WRITE_TOKEN environment variable is not set.')
  process.exit(1)
}

async function download() {
  console.log('Launching Chromium…')
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  })

  // Visit the referrer page first to establish a real session + cookies
  console.log('Visiting referrer page…')
  const page = await context.newPage()
  try {
    await page.goto(REFERER, { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log('Referrer page loaded OK')
  } catch (e) {
    console.warn('Referrer visit failed (continuing):', e.message)
  }

  // Fetch CSV using the browser's authenticated request context
  console.log(`Downloading CSV from ${MIZUHO_URL}…`)
  const response = await context.request.get(MIZUHO_URL, { timeout: 30000 })

  const status = response.status()
  console.log(`HTTP status: ${status}`)

  if (!response.ok()) {
    const body = await response.text().catch(() => '(unreadable)')
    console.error(`Response body (first 500 chars): ${body.slice(0, 500)}`)
    await browser.close()
    throw new Error(`Mizuho returned HTTP ${status}`)
  }

  const body = await response.body()
  console.log(`Downloaded ${body.length} bytes`)
  await browser.close()
  return body
}

async function upload(csvBuffer) {
  // Delete old blobs to avoid accumulation (keep storage clean)
  const { blobs } = await list({ prefix: 'mizuho-quote' })
  if (blobs.length > 0) {
    await del(blobs.map((b) => b.url))
    console.log(`Deleted ${blobs.length} old blob(s)`)
  }

  console.log('Uploading to Vercel Blob…')
  // addRandomSuffix: true (default) avoids overwrite conflicts
  // lib/mizuho.ts picks the latest by uploadedAt, so the suffix doesn't matter
  const blob = await put('mizuho-quote.csv', csvBuffer, {
    access: 'public',
    contentType: 'text/csv',
  })
  console.log(`Uploaded: ${blob.url}`)
  return blob.url
}

// ---- main ----
try {
  const csv = await download()
  await upload(csv)
  console.log('Done.')
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
}
