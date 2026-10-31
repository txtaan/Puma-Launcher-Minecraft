import { useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import type { SkinModel } from '@shared/types'
import { Icon } from '../components/Icon'
import { MODEL_LABEL, SkinThumb, SOURCE_LABEL, templateSkin, useSkinActions } from '../skins/common'
import { SkinEditor } from '../skins/SkinEditor'
import { SkinInspect } from '../skins/SkinInspect'
import { ServerSkinDialog } from '../skins/ServerSkin'
import { SkinViewer } from '../skins/SkinViewer'
import { SkinWardrobe } from '../skins/SkinWardrobe'
import type { Animation } from '../skins/player'
import { TEMPLATES, type TemplateId } from '../skins/templates'
import { useStore } from '../store'
import { prefersReducedMotion } from '../theme'

export type SkinView =
  | { kind: 'home' }
  | { kind: 'wardrobe' }
  | { kind: 'inspect'; id: string }
  | { kind: 'editor'; id?: string; template?: TemplateId; model?: SkinModel; back: SkinView }

export type SkinActions = ReturnType<typeof useSkinActions>

/** The Skins section: a bento overview, the wardrobe, the inspect view and the editor. */
export function Skins() {
  const { t } = useStore()
  const [view, setView] = useState<SkinView>({ kind: 'home' })
  const actions = useSkinActions()
  const [dropping, setDropping] = useState(false)

  // The views share the page's scroll container: open each one at the top, like a page of its own.
  const root = useRef<HTMLDivElement>(null)
  const viewId = 'id' in view ? view.id : undefined
  useLayoutEffect(() => {
    void root.current?.closest('.content')?.scrollTo(0, 0)
  }, [view.kind, viewId])

  // Skins can be dropped anywhere in the section except the editor.
  const droppable = view.kind !== 'editor'
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const dropHandlers = droppable
    ? {
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setDropping(false)
          void actions.importFiles([...e.dataTransfer.files])
        }
      }
    : {}

  return (
    <div ref={root} className={`skins-page view-${view.kind}`} {...dropHandlers}>
      {view.kind === 'home' && <SkinsHome go={setView} actions={actions} />}
      {view.kind === 'wardrobe' && <SkinWardrobe go={setView} actions={actions} />}
      {view.kind === 'inspect' && <SkinInspect id={view.id} go={setView} actions={actions} />}
      {view.kind === 'editor' && (
        <SkinEditor
          key={view.id ?? view.template}
          skinId={view.id}
          template={view.template}
          model={view.model}
          onClose={(savedId) => setView(savedId ? { kind: 'inspect', id: savedId } : view.back)}
        />
      )}
      {dropping && (
        <div className="skins-drop" aria-hidden>
          <Icon name="upload" size={34} />
          <strong>{t('skins.dropHere')}</strong>
        </div>
      )}
    </div>
  )
}

function SkinsHome({ go, actions }: { go: (v: SkinView) => void; actions: SkinActions }) {
  const { skins, account, t } = useStore()
  const list = skins?.skins ?? []
  const worn = list.find((s) => s.id === actions.wornId)
  const favorites = list.filter((s) => s.favorite)
  const [player, setPlayer] = useState('')
  const [fetching, setFetching] = useState(false)
  const [animation, setAnimation] = useState<Animation>(() => (prefersReducedMotion() ? 'none' : 'idle'))
  const [showingFriends, setShowingFriends] = useState(false)
  const mannequin = templateSkin('blank')
  const here: SkinView = { kind: 'home' }

  const inGame =
    account?.type === 'microsoft'
      ? t('skins.inGameMicrosoft')
      : account?.type === 'offline'
        ? t('skins.inGameOffline')
        : t('skins.inGameServer', { server: account?.serverName ?? t('error.authServer') })

  return (
    <div className="skins-home">
      <div className="skins-backdrop" aria-hidden />
      <div className="bento">
        <section className="bento-card glass bento-hero">
          <SkinViewer png={worn?.png ?? mannequin.png} model={worn?.model ?? 'classic'} animation={animation} zoom={false} className="bento-viewer" />
          <div className="bento-hero-info">
            <span className="badge">{t('skins.wearing')}</span>
            <h1>{worn?.name ?? t('skins.defaultSkin')}</h1>
            {worn ? (
              <div className="row gap-s">
                <span className="pill">{t(MODEL_LABEL[worn.model])}</span>
                <span className="pill">{t(SOURCE_LABEL[worn.source])}</span>
              </div>
            ) : (
              <p className="muted">{t('skins.defaultHint')}</p>
            )}
          </div>
          <div className="bento-hero-actions">
            {worn && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => go({ kind: 'inspect', id: worn.id })}>
                  <Icon name="search" size={16} /> {t('skins.inspect')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'editor', id: worn.id, back: here })}>
                  <Icon name="pencil" size={16} /> {t('skins.edit')}
                </button>
              </>
            )}
            <button className={`btn btn-sm ${worn ? 'btn-ghost' : 'btn-primary'}`} onClick={() => go({ kind: 'wardrobe' })}>
              <Icon name="shirt" size={16} /> {t('skins.change')}
            </button>
            <button
              className="icon-btn viewer-toggle"
              aria-label={t(animation === 'none' ? 'skins.play' : 'skins.pause')}
              title={t(animation === 'none' ? 'skins.play' : 'skins.pause')}
              onClick={() => setAnimation(animation === 'none' ? 'idle' : 'none')}
            >
              <Icon name={animation === 'none' ? 'play' : 'pause'} size={14} />
            </button>
          </div>
        </section>

        <section className="bento-card glass bento-wardrobe">
          <span className="badge">{t('skins.wardrobe')}</span>
          <div className="bento-count">
            <strong>{list.length}</strong>
            <span>{t(list.length === 1 ? 'skins.unitOne' : 'skins.unit')}</span>
          </div>
          {list.length ? (
            <div className="thumb-stack">
              {list.slice(0, 4).map((s) => (
                <SkinThumb key={s.id} skin={s} />
              ))}
            </div>
          ) : (
            <p className="muted small">{t('skins.wardrobeEmpty')}</p>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'wardrobe' })}>
            {t('skins.openWardrobe')} <Icon name="chevron" size={14} />
          </button>
        </section>

        <section className="bento-card glass bento-create">
          <span className="badge">{t('skins.create')}</span>
          <p className="muted small">{t('skins.createHint')}</p>
          <div className="template-row">
            {TEMPLATES.map((id) => (
              <button key={id} className="template-tile" onClick={() => go({ kind: 'editor', template: id, back: here })}>
                <SkinThumb skin={templateSkin(id)} />
                <span>{t(`skins.template.${id}`)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bento-card glass bento-import">
          <span className="badge">{t('skins.import')}</span>
          <p className="muted small">{t('skins.importHint')}</p>
          <div className="import-actions">
            <button className="btn btn-ghost" onClick={() => void actions.pickFiles()}>
              <Icon name="upload" size={16} /> {t('skins.fromFile')}
            </button>
            <form
              className="player-fetch"
              onSubmit={async (e) => {
                e.preventDefault()
                setFetching(true)
                const [saved] = await actions.fromUsername(player)
                setFetching(false)
                if (saved) setPlayer('')
              }}
            >
              <input value={player} maxLength={16} placeholder={t('skins.playerName')} aria-label={t('skins.playerName')} onChange={(e) => setPlayer(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!player.trim() || fetching}>
                {fetching ? <span className="spinner sm" /> : <Icon name="download" size={16} />} {t('skins.getSkin')}
              </button>
            </form>
          </div>
        </section>

        <section className="bento-card glass bento-favs">
          <span className="badge">{t('skins.favorites')}</span>
          {favorites.length ? (
            <div className="fav-row">
              {favorites.slice(0, 6).map((s) => (
                <button key={s.id} className="fav-tile" title={s.name} onClick={() => go({ kind: 'inspect', id: s.id })}>
                  <SkinThumb skin={s} />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">{t('skins.favoritesEmpty')}</p>
          )}
        </section>

        <section className="bento-card glass bento-ingame">
          <span className="badge">{t('skins.inGame')}</span>
          <Icon name={account?.type === 'microsoft' ? 'external' : 'puzzle'} size={22} className="bento-ingame-icon" />
          <p>{inGame}</p>
          {/* Microsoft skins already reach every server; other accounts need the server's skin mod */}
          {account &&
            account.type !== 'microsoft' &&
            (worn ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowingFriends(true)}>
                <Icon name="server" size={16} /> {t('skins.showFriends')}
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => go({ kind: 'wardrobe' })}>
                <Icon name="shirt" size={16} /> {t('skins.pickToShow')}
              </button>
            ))}
        </section>
      </div>

      {showingFriends && worn && <ServerSkinDialog skin={worn} onClose={() => setShowingFriends(false)} />}
    </div>
  )
}
