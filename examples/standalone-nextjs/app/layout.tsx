/**
 * Root layout for the @dcyfr/ai Standalone Next.js Example.
 *
 * The App Router requires every route tree to be wrapped in a root layout
 * that renders the <html> and <body> elements.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '@dcyfr/ai Standalone Example',
  description: 'Standalone Next.js app demonstrating @dcyfr/ai framework usage.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
