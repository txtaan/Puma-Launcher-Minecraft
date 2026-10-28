import { useState } from 'react'
import type { PublicAccount } from '@shared/types'

/** Player head from the account's skin; falls back to the initial for offline / unknown players. */
export function Avatar({ account, size = 36 }: { account: PublicAccount; size?: number }) {
  const [failed, setFailed] = useState(false)
  const src = account.type === 'microsoft' ? `https://mc-heads.net/avatar/${account.uuid}/${size * 2}` : undefined
  if (!src || failed) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>
        {account.username[0]?.toUpperCase()}
      </span>
    )
  }
  return <img className="avatar" src={src} width={size} height={size} alt="" onError={() => setFailed(true)} />
}
