/**
 * Runs in GitHub Actions: uses Playwright (real Chrome) to bypass Akamai WAF,
 * downloads Mizuho quote.csv, then uploads it to Vercel Blob.
 *
 * Requires env vars:
 *   BLOB_READ_WRITE_TOKEN  (from Vercel Blob store settings)
 */

import { chromium } from 'playwright'
import { put } from '@vercel/blob'

const MIZUHO_URL = 'https://www.mizuhobank.co.jp/market/quote.csv'
const REFERER   = 'https://www.mizuhobank.co.jp/market/index.html'

async function download() {
  console.log('Launching Chromium…')
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
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
  console.log('Visiting referrer…')
  const page = await context.newPage()
  try {
    await page.goto(REFERER, { waitUntil: 'domcontentloaded', timeout: 20000 })
  } catch (e) {
    console.warn('Referrer visit failed (continuing):', e.message)
  }

  // Fetch CSV using the browser's authenticated request context
  console.log('Downloading CSV…')
  const response = await context.request.get(MIZUHO_URL, { timeout: 30000 })

  if (!response.ok()) {
    await browser.close()
    throw new Error(`Mizuho returned HTTP ${response.status()}`)
  }

  const body = await response.body()
  console.log(`Downloaded ${body.length} bytes`)
  await browser.close()
  return body
}

async function upload(csvBuffer) {
  console.log('Uploading to Vercel Blob…')
  const blob = await put('mizuho-quote.csv', csvBuffer, {
    access: 'public',
    contentType: 'text/csv',
    addRandomSuffix: false, // always same URL so the app can find it
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
