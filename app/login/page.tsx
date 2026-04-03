'use client'

import { useState } from 'react'
import { SignIn, SignUp } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function LoginPage() {
    const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-white mb-1">DreamPlay Composer</h1>
                <p className="text-zinc-500 text-sm">
                    {mode === 'sign-in' ? 'Sign in to your account' : 'Create your account'}
                </p>
            </div>

            {mode === 'sign-in' ? (
                <SignIn
                    appearance={{ baseTheme: dark }}
                    routing="hash"
                    forceRedirectUrl="/studio"
                />
            ) : (
                <SignUp
                    appearance={{ baseTheme: dark }}
                    routing="hash"
                    forceRedirectUrl="/studio"
                />
            )}

            <p className="mt-6 text-zinc-500 text-sm">
                {mode === 'sign-in' ? (
                    <>
                        Don&apos;t have an account?{' '}
                        <button onClick={() => setMode('sign-up')} className="text-purple-400 hover:text-purple-300 font-medium">
                            Sign up
                        </button>
                    </>
                ) : (
                    <>
                        Already have an account?{' '}
                        <button onClick={() => setMode('sign-in')} className="text-purple-400 hover:text-purple-300 font-medium">
                            Sign in
                        </button>
                    </>
                )}
            </p>
        </div>
    )
}
