/**
 * POST /api/export
 *
 * Dispatches a video export job to the BullMQ queue.
 * Inserts a 'queued' row into Supabase video_exports,
 * then adds the job to Redis for the Railway worker to pick up.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getVideoExportQueue } from '@/lib/queue'
import { wakeRailwayWorker } from '@/lib/railway'
import { createClient } from '@/lib/supabase/server'
import type { RenderJobPayload } from '@/lib/types/renderJob'

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { configId, durationSec } = await req.json()

    if (!configId || !durationSec) {
      return NextResponse.json(
        { error: 'Missing required fields: configId, durationSec' },
        { status: 400 }
      )
    }

    const safeDurationSec = Number(durationSec)
    if (!Number.isFinite(safeDurationSec) || safeDurationSec <= 0 || safeDurationSec > 7200) {
      return NextResponse.json(
        { error: 'Invalid durationSec' },
        { status: 400 }
      )
    }

    const { data: config, error: configError } = await supabase
      .from('configurations')
      .select('id, user_id, audio_url')
      .eq('id', configId)
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      )
    }

    if (!config.audio_url) {
      return NextResponse.json(
        { error: 'Configuration must have an uploaded audio file before export' },
        { status: 400 }
      )
    }

    const { data: row, error: dbError } = await supabase
      .from('video_exports')
      .insert({
        config_id: configId,
        user_id: user.id,
        status: 'queued',
        progress: 0,
      })
      .select('id')
      .single()

    if (dbError || !row) {
      console.error('[Export API] Supabase insert failed:', dbError)
      return NextResponse.json(
        { error: 'Failed to create export record' },
        { status: 500 }
      )
    }

    // Step 7b: Dispatch to BullMQ
    const queue = getVideoExportQueue()
    await queue.add(
      'render-video',
      {
        exportId: row.id,
        configId,
        audioUrl: config.audio_url,
        durationSec: safeDurationSec,
      } satisfies RenderJobPayload,
      { jobId: row.id }
    )

    console.log(`[Export API] Job queued: exportId=${row.id}, configId=${configId}`)

    // Wake the Railway worker (it may be shut down to save Redis commands)
    await wakeRailwayWorker()

    return NextResponse.json({ exportId: row.id, status: 'queued' })
  } catch (err) {
    console.error('[Export API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/export
 *
 * Kill switch: drains all BullMQ jobs and marks active Supabase rows as cancelled.
 */
export async function DELETE() {
  try {
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: ownedConfigs, error: configsError } = await supabase
      .from('configurations')
      .select('id')
      .eq('user_id', user.id)

    if (configsError) {
      console.error('[Export API] Failed to load owned configurations:', configsError)
      return NextResponse.json(
        { error: 'Failed to load owned configurations' },
        { status: 500 }
      )
    }

    const ownedConfigIds = (ownedConfigs || []).map((config) => config.id)
    if (ownedConfigIds.length === 0) {
      return NextResponse.json({ status: 'cancelled', jobsCancelled: 0 })
    }

    const { data: activeJobs, error: activeJobsError } = await supabase
      .from('video_exports')
      .select('id')
      .in('config_id', ownedConfigIds)
      .in('status', ['queued', 'processing'])

    if (activeJobsError) {
      console.error('[Export API] Failed to load active jobs:', activeJobsError)
      return NextResponse.json(
        { error: 'Failed to load active exports' },
        { status: 500 }
      )
    }

    if (activeJobs && activeJobs.length > 0) {
      const activeJobIds = activeJobs.map((job) => job.id)

      await supabase
        .from('video_exports')
        .update({ status: 'failed', error_message: 'Cancelled by owner' })
        .in('id', activeJobIds)

      const queue = getVideoExportQueue()
      await Promise.all(
        activeJobIds.map(async (jobId) => {
          const job = await queue.getJob(jobId)
          if (job) await job.remove()
        })
      )

      console.log(`[Export API] Cancelled ${activeJobs.length} active jobs for user ${user.id}`)
    }

    return NextResponse.json({ status: 'cancelled', jobsCancelled: activeJobs?.length || 0 })
  } catch (err) {
    console.error('[Export API] Kill error:', err)
    return NextResponse.json(
      { error: 'Failed to kill exports' },
      { status: 500 }
    )
  }
}
