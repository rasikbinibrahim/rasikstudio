import { useEffect, useState } from 'react'

export default function App(): JSX.Element {
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    window.rasik
      .getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('unknown'))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Rasik Studio</h1>
      <p>Desktop shell scaffold — Electron {appVersion ? `v${appVersion}` : 'loading…'}</p>
    </main>
  )
}
