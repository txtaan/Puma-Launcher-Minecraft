import { useState } from 'react'
import type { PublicAccount } from '@shared/types'
import { SkinFace } from '../skins/common'
import { useStore } from '../store'

/** Player head: the skin the account wears in Puma, else its Microsoft skin, else its initial. */
export function Avatar({ account, size = 36 }: { account: PublicAccount; size?: number }) {
  const { skins } = useStore()
  const [failed, setFailed] = useState(false)
  const worn = skins?.skins.find((s) => s.id === skins.equipped[account.id])
  if (worn) return <SkinFace png={worn.png} size={size} className="avatar" />
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
