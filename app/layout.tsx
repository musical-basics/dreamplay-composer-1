import type { Metadata } from 'next'
import { Geist, Geist_Mono, Outfit } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import './globals.css'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
    title: 'Ultimate Pianist — Learn Piano with Sheet Music & Falling Notes',
    description: 'Synchronized sheet music display and Synthesia-style falling notes for piano learning.',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <ClerkProvider appearance={{ baseTheme: dark }}>
            <html lang="en">
                <body className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} font-sans antialiased bg-black text-white`}>
                    {children}
                </body>
            </html>
        </ClerkProvider>
    )
}
