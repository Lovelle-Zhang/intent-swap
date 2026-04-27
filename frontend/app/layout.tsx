import './globals.css'

export const metadata = {
  title: 'Intent Swap',
  description: '一句话，自动配置你的资产',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
