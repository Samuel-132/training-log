import { useEffect } from 'react'

/** Safari can discard background tabs; this guard covers deliberate navigation. */
export function useDraftGuard(dirty: boolean, onClose: () => void) {
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  return () => {
    if (!dirty || window.confirm('Votre saisie n’est pas enregistrée. Voulez-vous l’abandonner ?'))
      onClose()
  }
}
