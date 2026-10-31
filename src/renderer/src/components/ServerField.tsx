import { useId, useState, type Ref } from 'react'
import { serverAddressError } from '../serverAddress'
import { useStore } from '../store'

/**
 * Server address input (`host` or `host:port`). What's wrong with the address shows under it once the player leaves
 * the field (or `showError` asks for it, e.g. after pressing Create), and then updates as they type.
 */
export function ServerField({
  label,
  value,
  onChange,
  required = false,
  showError = false,
  help,
  autoFocus,
  ref
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  showError?: boolean
  help?: string
  autoFocus?: boolean
  ref?: Ref<HTMLInputElement>
}) {
  const { t } = useStore()
  const [left, setLeft] = useState(false)
  const id = useId()
  const error = serverAddressError(value, required)
  const shown = (left || showError) && error

  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={ref}
        value={value}
        placeholder={t('server.placeholder')}
        spellCheck={false}
        autoFocus={autoFocus}
        aria-required={required}
        aria-invalid={!!shown}
        aria-describedby={shown || help ? id : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setLeft(true)}
      />
      {shown ? (
        <small id={id} className="field-error">
          {t(shown)}
        </small>
      ) : (
        help && (
          <small id={id} className="muted">
            {help}
          </small>
        )
      )}
    </label>
  )
}
