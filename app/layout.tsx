import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FX Converter',
  description: 'Accounting-friendly FX rates — Mizuho / Mitsubishi MURC',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
