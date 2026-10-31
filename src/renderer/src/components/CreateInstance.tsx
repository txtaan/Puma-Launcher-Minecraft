import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MessageKey } from '@shared/i18n'
import type { Instance, VersionType } from '@shared/types'
import { api, errorMessage } from '../api'
import { serverAddressError, serverInstanceName } from '../serverAddress'
import { useStore } from '../store'
import { Icon } from './Icon'
import { defaultIcon, IconPicker, type InstanceIconId } from './InstanceIcon'
import { LoaderPicker, loaderLabel, rememberLoader, rememberedLoader } from './LoaderPicker'
import { Modal } from './Modal'
import { RecommendedMods } from './RecommendedMods'
import { ServerField } from './ServerField'

const FILTERS: { key: VersionType; label: MessageKey }[] = [
  { key: 'release', label: 'type.releases' },
  { key: 'snapshot', label: 'type.snapshots' },
  { key: 'old_beta', label: 'type.old_beta' },
  { key: 'old_alpha', label: 'type.old_alpha' }
]

/** The answer to the dialog's first question, "What do you want to play?". */
type Choice = 'vanilla' | 'mods' | 'server'

const CHOICES: { key: Choice; icon: string; title: MessageKey; text: MessageKey }[] = [
  { key: 'vanilla', icon: 'cube', title: 'create.vanilla', text: 'create.vanillaText' },
  { key: 'mods', icon: 'puzzle', title: 'create.mods', text: 'create.modsText' },
  { key: 'server', icon: 'server', title: 'create.server', text: 'create.serverText' }
]

/** `name`, or `name 2`, `name 3`… when an instance already has that name. */
function uniqueName(name: string, taken: string[]): string {
  const names = new Set(taken.map((n) => n.toLowerCase()))
  let candidate = name
  for (let n = 2; names.has(candidate.toLowerCase()); n++) candidate = `${name} ${n}`
  return candidate
}

/** Starting loader for each choice: none for vanilla, the one used last time for mods, "No" for a server. */
function startingLoader(choice: Choice): Instance['loader'] {
  return choice === 'mods' ? { type: rememberedLoader() ?? 'fabric', version: '' } : undefined
}

/**
 * New-instance dialog in two steps: what the player wants (vanilla, mods, a friend's server), then the details.
 * A version picked elsewhere (`presetVersion`) skips the question: vanilla, or mods if a loader was used before.
 */
export function CreateInstance({ presetVersion, onClose }: { presetVersion?: string; onClose: () => void }) {
  const { versions, instances, refreshInstances, saveSettings, toast, t, locale } = useStore()
  const preset = versions?.versions.find((v) => v.id === presetVersion)
  const [step, setStep] = useState<1 | 2>(presetVersion ? 2 : 1)
  const [choice, setChoice] = useState<Choice | null>(() => (presetVersion ? (rememberedLoader() ? 'mods' : 'vanilla') : null))
  const [filter, setFilter] = useState<VersionType>(preset?.type ?? 'release')
  const [query, setQuery] = useState('')
  const [versionId, setVersionId] = useState(presetVersion || versions?.latest.release || '')
  const [name, setName] = useState('')
  const [server, setServer] = useState('')
  const [serverTried, setServerTried] = useState(false)
  const serverInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [loader, setLoader] = useState<Instance['loader']>(() => (choice ? startingLoader(choice) : undefined))
  const [loaderReady, setLoaderReady] = useState(!loader)
  const [modIds, setModIds] = useState<string[]>([])
  // Unset until the player picks one: the default then follows the choices above (loader, server).
  const [icon, setIcon] = useState<InstanceIconId>()
  const ids = useId()

  // Opened before the version list arrived: start from the latest release once it does.
  useEffect(() => {
    if (!versionId && versions) setVersionId(versions.latest.release)
  }, [versions, versionId])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return versions?.versions.filter((v) => v.type === filter && v.id.toLowerCase().includes(q)) ?? []
  }, [versions, filter, query])

  const choose = (next: Choice) => {
    if (next !== choice) {
      const start = startingLoader(next)
      setLoader(start)
      setLoaderReady(!start)
      setModIds([])
    }
    setChoice(next)
    setStep(2)
  }

  const onLoader = (l: Instance['loader'] | undefined, ready: boolean) => {
    setLoader(l)
    setLoaderReady(ready)
  }

  const serverError = choice === 'server' ? serverAddressError(server, true) : undefined
  // Shown as the name field's placeholder and used when the field is left empty.
  const suggestedName = versionId
    ? uniqueName(
        choice === 'server' && !serverError
          ? serverInstanceName(server)
          : loader
            ? t('create.moddedName', { loader: loaderLabel(loader), version: versionId })
            : t('create.vanillaName', { version: versionId }),
        instances.map((i) => i.name)
      )
    : ''

  const create = async () => {
    if (serverError) {
      setServerTried(true)
      serverInput.current?.focus()
      return
    }
    setBusy(true)
    try {
      const inst = await api.instances.create(name.trim() || suggestedName, versionId, loader, loader ? modIds : [], {
        server: choice === 'server' ? server.trim() : undefined,
        icon
      })
      if (loader) rememberLoader(loader.type)
      await saveSettings({ selectedInstanceId: inst.id })
      await refreshInstances()
      toast(t('create.created', { name: inst.name }), 'success')
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (step === 1 || !choice) {
    return (
      <Modal title={t('create.question')} onClose={onClose} wide>
        <div className="choice-grid">
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`choice-card ${choice === c.key ? 'active' : ''}`}
              autoFocus={c.key === (choice ?? CHOICES[0].key)}
              aria-labelledby={`${ids}-${c.key}`}
              aria-describedby={`${ids}-${c.key}-text`}
              onClick={() => choose(c.key)}
            >
              <span className="choice-icon">
                <Icon name={c.icon} size={22} />
              </span>
              <span id={`${ids}-${c.key}`} className="choice-title">
                {t(c.title)}
              </span>
              <span id={`${ids}-${c.key}-text`} className="choice-text">
                {t(c.text)}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  const current = CHOICES.find((c) => c.key === choice)!

  return (
    <Modal title={t('common.newInstance')} onClose={onClose} wide>
      <div className="stack">
        <div className="create-step-head">
          <button type="button" className="back-link" autoFocus={choice !== 'server'} onClick={() => setStep(1)}>
            <Icon name="arrowLeft" size={16} /> {t('common.back')}
          </button>
          <span className="pill pill-accent">
            <Icon name={current.icon} size={12} /> {t(current.title)}
          </span>
        </div>

        {choice === 'server' && (
          <>
            <ServerField
              ref={serverInput}
              label={t('create.serverAddress')}
              value={server}
              onChange={setServer}
              required
              showError={serverTried}
              autoFocus
            />
            <LoaderPicker
              label={t('create.serverMods')}
              vanillaLabel={t('create.serverModsNo')}
              mcVersion={versionId}
              value={loader}
              onChange={onLoader}
            />
          </>
        )}

        <div className="field">
          <span>{t('create.version')}</span>
          {choice === 'server' && <small className="muted">{t('create.serverVersion')}</small>}
          <div className="version-tools">
            <div className="segmented">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={filter === f.key ? 'active' : ''} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {t(f.label)}
                </button>
              ))}
            </div>
            <label className="search">
              <Icon name="search" size={16} />
              <input placeholder={t('versions.search')} aria-label={t('versions.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <div className="version-picker">
            {list.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`version-option ${versionId === v.id ? 'active' : ''}`}
                aria-pressed={versionId === v.id}
                onClick={() => setVersionId(v.id)}
              >
                <span>{v.id}</span>
                <span className="muted">{new Date(v.releaseTime).toLocaleDateString(locale)}</span>
              </button>
            ))}
            {!list.length && <div className="muted pad">{versions && query.trim() ? t('versions.noMatch') : t('create.noVersions')}</div>}
          </div>
        </div>

        {choice === 'mods' && <LoaderPicker allowVanilla={false} describe mcVersion={versionId} value={loader} onChange={onLoader} />}
        {choice !== 'vanilla' && <RecommendedMods mcVersion={versionId} loader={loader} selected={modIds} onChange={setModIds} />}

        <label className="field">
          <span>{t('create.nameOptional')}</span>
          <input value={name} placeholder={suggestedName} onChange={(e) => setName(e.target.value)} />
        </label>

        {/* A server instance always gets its address, so it defaults to the server icon even before it's typed */}
        <IconPicker value={icon} fallback={choice === 'server' ? 'sword' : defaultIcon({ loader })} onChange={setIcon} />

        <div className="row end gap-s">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!versionId || busy || !loaderReady} onClick={() => void create()}>
            {t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
