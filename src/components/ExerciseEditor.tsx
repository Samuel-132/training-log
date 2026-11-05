import { useState } from 'react'
import type { Exercise } from '../domain'
import { Dialog } from './Dialog'
import { useDraftGuard } from '../useDraftGuard'

export const muscleGroups = [
  'Pectoraux',
  'Dos',
  'Jambes',
  'Épaules',
  'Biceps',
  'Triceps',
  'Bras',
  'Abdominaux',
  'Autre',
]

export function ExerciseEditor({
  exercise,
  onClose,
  onSave,
}: {
  exercise?: Exercise
  onClose: () => void
  onSave: (name: string, muscle: string) => Promise<void>
}) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [muscle, setMuscle] = useState(exercise?.muscle ?? 'Bras')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestClose = useDraftGuard(
    name !== (exercise?.name ?? '') || muscle !== (exercise?.muscle ?? 'Bras'),
    onClose,
  )
  return (
    <Dialog
      title={exercise ? 'Modifier l’exercice' : 'Nouvel exercice'}
      onClose={requestClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setBusy(true)
          try {
            await onSave(name.trim(), muscle)
            onClose()
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'L’exercice n’a pas pu être enregistré.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className="muted">Un nom précis vous aidera à comparer les mêmes mouvements.</p>
        <label className="field">
          Nom de l’exercice
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Curl incliné avec haltères"
          />
        </label>
        <label className="field">
          Groupe musculaire
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            {[...new Set([...muscleGroups, ...(exercise ? [exercise.muscle] : [])])].map(
              (group) => (
                <option key={group}>{group}</option>
              ),
            )}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={requestClose}>
            Annuler
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? 'Enregistrement…' : 'Enregistrer l’exercice'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
