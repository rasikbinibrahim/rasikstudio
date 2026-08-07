import { useState } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store'
import { getCurrentUser, login, register } from '../../services/auth-client'

export interface AuthDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = 'login' | 'register'

/** Optional — AUTHENTICATION.md §1: local-first editing works fully without ever opening this.
 *  Signing in only enables settings sync and cloud AI models (and, today, the WebSocket
 *  connection this dialog is the missing piece for — see PROGRESS.md's Phase 7 entry). */
export function AuthDialog({ open, onClose }: AuthDialogProps): JSX.Element {
  const setSession = useAppStore((state) => state.setSession)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset(): void {
    setMode('login')
    setEmail('')
    setName('')
    setPassword('')
    setError(null)
    setLoading(false)
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  async function handleSubmit(): Promise<void> {
    setError(null)
    setLoading(true)
    try {
      const tokens =
        mode === 'login' ? await login(email, password) : await register(email, name, password)
      const user = await getCurrentUser(tokens.access_token)
      setSession(tokens.access_token, tokens.refresh_token, {
        id: user.id,
        email: user.email,
        name: user.name,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={mode === 'login' ? 'Sign In' : 'Create Account'}
      description="Optional — enables settings sync and cloud AI models. Local editing works fully without an account."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!email || !password || (mode === 'register' && !name)}
            onClick={() => void handleSubmit()}
          >
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        {mode === 'register' && <Input value={name} onChange={setName} placeholder="Name" />}
        <Input value={email} onChange={setEmail} placeholder="Email" type="email" />
        <Input value={password} onChange={setPassword} placeholder="Password" type="password" />
        {error && <span className="text-xs text-status-error">{error}</span>}
        <button
          type="button"
          className="self-start text-xs text-accent-primary hover:underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </form>
    </Dialog>
  )
}
