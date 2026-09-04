import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'ZY5 Tools · 浏览器工具箱',
  description:
    'Base64、时间戳、JSON、文本转义、复利计算与行情查看。数据工具本地运行，行情直连第三方数据源。',
  metadataBase: new URL('https://tools.zy5.dev'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ZY5 Tools · 浏览器工具箱',
    description: '编码、解析、对比、计算与行情。常用工具，保持简单。',
    url: 'https://tools.zy5.dev',
    siteName: 'ZY5 Tools',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'ZY5 Tools 浏览器工具箱' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZY5 Tools · 浏览器工具箱',
    description: '编码、解析、对比、计算与行情。常用工具，保持简单。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
