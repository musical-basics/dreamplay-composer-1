import { SignUp } from '@clerk/nextjs'

export default function Page() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <SignUp 
                routing="path" 
                path="/sign-up" 
                signInUrl="/sign-in"
                forceRedirectUrl="/studio"
            />
        </div>
    )
}
