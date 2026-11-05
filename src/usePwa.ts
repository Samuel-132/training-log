import { useEffect, useRef, useState } from 'react'

export type OfflineStatus = 'preparing' | 'ready' | 'unavailable' | 'unsupported' | 'development'

/** Updates wait for an explicit reload so an open workout is never interrupted. */
export function usePwa() {
  const [status, setStatus] = useState<OfflineStatus>(
    import.meta.env.PROD ? 'preparing' : 'development',
  )
  const [waiting, setWaiting] = useState<ServiceWorker>()
  const [reloadAvailable, setReloadAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const reloadRequested = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('unsupported')
      return
    }
    let disposed = false
    const expectedScope = new URL(import.meta.env.BASE_URL, window.location.origin).href
    const expectedScript = new URL('sw.js', expectedScope).href
    const ownsWorker = (worker: ServiceWorker | null | undefined) =>
      worker?.scriptURL === expectedScript
    let previousController = ownsWorker(navigator.serviceWorker.controller)
    const cleanups: (() => void)[] = []
    const controllerChanged = () => {
      if (!ownsWorker(navigator.serviceWorker.controller)) return
      const wasControlled = previousController
      previousController = true
      if (reloadRequested.current) window.location.reload()
      else if (!disposed) {
        setStatus('ready')
        setWaiting(undefined)
        // Another tab may have activated the update. Keep the current form
        // intact, but let this tab reload on request without re-activating it.
        if (wasControlled) setReloadAvailable(true)
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)

    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .then((registration) => {
        if (disposed) return
        const inspectWaiting = () => {
          if (!disposed && registration.waiting && navigator.serviceWorker.controller)
            setWaiting(registration.waiting)
        }
        const inspectInstalling = () => {
          const installing = registration.installing
          if (!installing) return
          const changed = () => {
            inspectWaiting()
            if (!disposed && ownsWorker(registration.active)) setStatus('ready')
            if (installing.state === 'redundant' && !registration.active && !disposed)
              setStatus('unavailable')
          }
          installing.addEventListener('statechange', changed)
          cleanups.push(() => installing.removeEventListener('statechange', changed))
        }
        inspectWaiting()
        inspectInstalling()
        registration.addEventListener('updatefound', inspectInstalling)
        cleanups.push(() => registration.removeEventListener('updatefound', inspectInstalling))
        // The global ready promise may belong to another PWA at a parent scope.
        // Only this registration can establish that our own precache is ready.
        if (!disposed && ownsWorker(registration.active)) setStatus('ready')
      })
      .catch(async () => {
        // A cached installation stays usable if checking for an update fails offline.
        try {
          const existing = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
          if (!disposed)
            setStatus(
              existing?.scope === expectedScope && ownsWorker(existing.active)
                ? 'ready'
                : 'unavailable',
            )
        } catch {
          if (!disposed) setStatus('unavailable')
        }
      })

    return () => {
      disposed = true
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  function applyUpdate() {
    if (updating) return
    if (reloadAvailable || (waiting && waiting.state !== 'installed')) {
      window.location.reload()
      return
    }
    if (!waiting) return
    setUpdating(true)
    reloadRequested.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }
  return { status, updateAvailable: Boolean(waiting) || reloadAvailable, updating, applyUpdate }
}
