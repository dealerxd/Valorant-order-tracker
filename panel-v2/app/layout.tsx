import type { Metadata, Viewport } from 'next';
import './globals.css';

/* Fonts are self-hosted: see the @font-face block at the top of globals.css
   for why next/font/google is not used here. */

export const metadata: Metadata = {
  title: 'Resell.BOT — Panel',
  description: 'HILL Boosting operations panel',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="en": the interface copy is English, and text-transform:uppercase
    // follows the document locale — under lang="tr" every "i" in a label
    // ("SIGN IN", "HILL BOOSTING") would render as the dotted "İ".
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
