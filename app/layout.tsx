import '../src/app/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JD Creator',
  description: 'Professional job description generator for recruiters and hiring teams.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
