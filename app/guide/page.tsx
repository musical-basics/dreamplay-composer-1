import Link from 'next/link'
import { ArrowRight, BookOpen, Globe, Lock, Music2, Upload, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const creatorSteps = [
  {
    title: 'Create a studio account',
    body: 'Sign up, then open Studio. Each song you create stays scoped to your account until you explicitly publish it.',
    icon: Lock,
  },
  {
    title: 'Create a new configuration',
    body: 'Start with a title, then upload your MusicXML, MIDI, and audio. The editor works best once all three files are attached.',
    icon: Upload,
  },
  {
    title: 'Map the score step by step',
    body: 'Set anchors measure-by-measure, preview playback, and save often. Use the advanced tools only after the basic timing feels correct.',
    icon: Wand2,
  },
  {
    title: 'Preview like a student',
    body: 'Open the lesson from the Learn library and make sure the transport, score, and waterfall all feel understandable without extra explanation.',
    icon: BookOpen,
  },
  {
    title: 'Publish when it is ready',
    body: 'Keep drafts private while you refine them. Toggle a lesson to Live only after the timing, assets, and labels look clean.',
    icon: Globe,
  },
]

const learnerSteps = [
  'Open the Learn library and choose a published piece.',
  'Press play or tap spacebar to begin.',
  'Use the score and waterfall toggles to simplify the view if it feels too busy.',
  'Slow the tempo, loop tricky passages manually, and mute one hand when practicing.',
]

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-purple-950/40 p-8 md:p-10">
          <div className="flex items-center gap-3 text-purple-300">
            <Music2 className="h-6 w-6" />
            <span className="text-sm uppercase tracking-[0.25em]">Getting Started</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">
            A simple path to publishing lessons safely
          </h1>
          <p className="mt-4 max-w-2xl text-zinc-300">
            Use this checklist before making the app public. It is designed for creators setting up lessons and for learners opening a piece for the first time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                Open Studio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/learn">
              <Button variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
                Browse Learn Library
              </Button>
            </Link>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">For creators</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {creatorSteps.map((step, index) => {
              const Icon = step.icon
              return (
                <div
                  key={step.title}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/15 text-purple-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm text-zinc-500">Step {index + 1}</div>
                  </div>
                  <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{step.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-2xl font-semibold">For learners</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {learnerSteps.map((step, index) => (
              <div key={step} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
                <span className="mr-2 text-purple-300">{index + 1}.</span>
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-xl font-semibold text-amber-200">Public launch checklist</h2>
          <p className="mt-3 text-sm leading-6 text-amber-100/90">
            Before launch, make sure signup is enabled only for real users, draft lessons stay private, and every published lesson has clean titles, working media files, and an obvious first action for new visitors.
          </p>
        </section>
      </main>
    </div>
  )
}
