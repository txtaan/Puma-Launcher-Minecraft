import type { WebContents } from 'electron'
import type { ProgressEvent } from '@shared/types'
import { tr } from './i18n'

let target: WebContents | undefined

export function setProgressTarget(wc: WebContents): void {
  target = wc
}

export function emit(channel: string, payload: unknown): void {
  if (target && !target.isDestroyed()) target.send(channel, payload)
}

/** Small helper to report a long-running task to the UI. Throttled to avoid flooding IPC. */
export function task(taskId: string, title: string) {
  let last = 0
  const send = (ev: Omit<ProgressEvent, 'taskId' | 'title'>, force = false) => {
    const now = Date.now()
    if (!force && now - last < 80) return
    last = now
    emit('progress', { taskId, title, ...ev } satisfies ProgressEvent)
  }
  return {
    update: (stage: string, done: number, total: number) => send({ stage, done, total }, done === total),
    finish: () => send({ stage: tr('task.done'), done: 1, total: 1, finished: true }, true),
    fail: (err: unknown) =>
      send({ stage: tr('task.failed'), done: 0, total: 1, finished: true, error: err instanceof Error ? err.message : String(err) }, true)
  }
}
