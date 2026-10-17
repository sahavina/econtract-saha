import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Dancing_Script } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const font = Be_Vietnam_Pro({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
});

// Font chữ ký khi người ký chọn gõ họ tên.
const signatureFont = Dancing_Script({ variable: '--font-signature', subsets: ['latin', 'vietnamese'], weight: ['500'] });

export const metadata: Metadata = {
  title: { default: 'SAHA eContract', template: '%s · SAHA eContract' },
  description: 'Nền tảng hợp đồng điện tử & quản lý vòng đời hợp đồng',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${font.variable} ${signatureFont.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
