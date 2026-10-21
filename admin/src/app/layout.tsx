import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PeakMovies Admin',
  description: 'Monitor providers, streams, and audience activity.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
