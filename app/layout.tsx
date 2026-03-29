import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

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
                <body className="font-sans antialiased bg-black text-white">
                    {children}
                </body>
            </html>
        </ClerkProvider>
    )
}
