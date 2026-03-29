import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Page() {
    const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!hasSupabase) {
        redirect('/login')
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    redirect(user ? '/studio' : '/login')
}
