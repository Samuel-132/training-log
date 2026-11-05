import { useRef, useState } from 'react'
import { Copy, Plus, Trash2, History } from 'lucide-react'
import type { Exercise, WorkoutEntry } from '../domain'
import { latestEntry, localDate, parseSetFields } from '../domain'
import { dateLabel, setsLabel } from '../format'
import { Dialog } from './Dialog'
import { useDraftGuard } from '../useDraftGuard'

type SetDraft = { id: string; reps: string; weight: string }
const newSet = (): SetDraft => ({ id: crypto.randomUUID(), reps: '', weight: '' })

export function EntryEditor({
  exercises,
  entries,
  initialExerciseId,
  entry,
  onClose,
  onSave,
}: {
  exercises: Exercise[]
  entries: WorkoutEntry[]
  initialExerciseId?: string
  entry?: WorkoutEntry
  onClose: () => void
  onSave: (entry: WorkoutEntry) => Promise<void>
}) {
  const [exerciseId, setExerciseId] = useState(
    entry?.exerciseId ?? initialExerciseId ?? exercises[0]?.id ?? '',
  )
  const [date, setDate] = useState(entry?.date ?? localDate())
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [sets, setSets] = useState<SetDraft[]>(
    entry?.sets.map((set) => ({ ...set, reps: String(set.reps), weight: String(set.weight) })) ?? [
      newSet(),
      newSet(),
      newSet(),
    ],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = JSON.stringify({ exerciseId, date, notes, sets })
  const initialSnapshot = useRef(snapshot)
  const requestClose = useDraftGuard(snapshot !== initialSnapshot.current, onClose)
  const previous = latestEntry(
    entries.filter((item) => item.id !== entry?.id),
    exerciseId,
  )
  function updateSet(id: string, field: 'reps' | 'weight', value: string) {
    setSets(sets.map((set) => (set.id === id ? { ...set, [field]: value } : set)))
  }
  return (
    <Dialog
      title={entry ? 'Modifier la performance' : 'Ajouter une performance'}
      onClose={requestClose}
      busy={busy}
      wide
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const now = new Date().toISOString()
            const parsedSets = sets.map((set, index) => {
              try {
                return { id: set.id, ...parseSetFields(set.reps, set.weight) }
              } catch (error) {
                throw new Error(
                  `Série ${index + 1} : ${error instanceof Error ? error.message : 'valeurs incorrectes.'}`,
                )
              }
            })
            await onSave({
              id: entry?.id ?? crypto.randomUUID(),
              exerciseId,
              date,
              sets: parsedSets,
              notes: notes.trim(),
              createdAt: entry?.createdAt ?? now,
              updatedAt: now,
            })
            onClose()
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'La performance n’a pas pu être enregistrée.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            Exercice
            <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} required>
              {exercises.map((exercise) => (
                <option value={exercise.id} key={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Date de la séance
            <input
              aria-label="Date de la séance"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {previous && (
          <div className="previous-performance">
            <div>
              <span className="eyebrow">
                <History size={14} /> Dernière séance · {dateLabel(previous.date)}
              </span>
              <p>{setsLabel(previous)}</p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setSets(
                  previous.sets.map((set) => ({
                    id: crypto.randomUUID(),
                    reps: String(set.reps),
                    weight: String(set.weight),
                  })),
                )
              }
            >
              <Copy size={15} /> Reprendre
            </button>
          </div>
        )}
        <div className="set-table">
          <div className="set-row set-heading">
            <span>Série</span>
            <span>Répétitions</span>
            <span>Poids (kg)</span>
            <span />
          </div>
          {sets.map((set, index) => (
            <div className="set-row" key={set.id}>
              <span className="set-number">{String(index + 1).padStart(2, '0')}</span>
              <input
                aria-label={`Répétitions série ${index + 1}`}
                required
                inputMode="numeric"
                autoComplete="off"
                placeholder="10"
                maxLength={5}
                value={set.reps}
                onChange={(e) => updateSet(set.id, 'reps', e.target.value)}
              />
              <input
                aria-label={`Poids série ${index + 1} en kg`}
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="10"
                maxLength={10}
                value={set.weight}
                onChange={(e) => updateSet(set.id, 'weight', e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                disabled={sets.length <= 1}
                aria-label={`Supprimer la série ${index + 1}`}
                onClick={() => setSets(sets.filter((item) => item.id !== set.id))}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button dashed full-width"
          disabled={sets.length >= 100}
          onClick={() => setSets([...sets, newSet()])}
        >
          <Plus size={17} /> Ajouter une série
        </button>
        <p className="input-hint">
          Chaque série est indépendante. Pour un exercice au poids du corps, indiquez 0 kg.
        </p>
        <label className="field">
          Note <span className="optional">facultative</span>
          <textarea
            maxLength={500}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ressenti, réglage de la machine, technique…"
          />
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
          <button className="button primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer la performance'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
