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
    title: 'DreamPlay Composer — Music Production Studio for Musicians',
    description: 'Create, sync, and publish interactive music experiences with DreamPlay Composer. Upload your audio, sheet music, and MIDI to build stunning visual performances.',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <ClerkProvider appearance={{ baseTheme: dark }} afterSignOutUrl="/login">
            <html lang="en">
                <body className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} font-sans antialiased bg-black text-white`}>
                    {children}
                </body>
            </html>
        </ClerkProvider>
    )
}
