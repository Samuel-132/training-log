/** The persisted format. Keep migrations explicit when introducing a new version. */
export interface Exercise {
  id: string
  name: string
  muscle: string
  createdAt: string
}

export interface WorkoutSet {
  id: string
  reps: number
  weight: number
}

export interface WorkoutEntry {
  id: string
  exerciseId: string
  /** A local civil date, never an instant converted to UTC. */
  date: string
  sets: WorkoutSet[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface TrainingData {
  version: 1
  exercises: Exercise[]
  entries: WorkoutEntry[]
}

/** Every persisted snapshot must also fit in a restorable backup, newline included. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

const LIMITS = {
  exercises: 1_000,
  entries: 50_000,
  sets: 100,
  reps: 10_000,
  weight: 10_000,
} as const

const encoder = new TextEncoder()

function compactBackup(data: TrainingData): string {
  return `${JSON.stringify(data)}\n`
}

function exceedsBackupLimit(text: string): boolean {
  // UTF-16 length is a cheap lower bound; only encode plausibly fitting input.
  return text.length > MAX_BACKUP_BYTES || encoder.encode(text).byteLength > MAX_BACKUP_BYTES
}

function invalid(message: string): never {
  throw new Error(message)
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalid(`${label} : objet attendu.`)
  }
  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    return invalid(`${label} : champs manquants ou inconnus.`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, maximum: number, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) {
    return invalid(`${label} : texte invalide (maximum ${maximum} caractères).`)
  }
  return value
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) {
    return invalid('Identifiant invalide.')
  }
  return value
}

/** Validate actual calendar days without relying on Date's overflow normalization. */
export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]!
}

function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !isCivilDate(value.slice(0, 10))
  )
    return invalid('Horodatage invalide.')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    return invalid('Horodatage invalide.')
  return value
}

function array(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return invalid(`${label} : liste invalide (maximum ${maximum}).`)
  }
  return value
}

function numericSet(reps: unknown, weight: unknown): Pick<WorkoutSet, 'reps' | 'weight'> {
  if (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > LIMITS.reps) {
    return invalid(`Les répétitions doivent être un entier de 1 à ${LIMITS.reps}.`)
  }
  if (
    typeof weight !== 'number' ||
    !Number.isFinite(weight) ||
    weight < 0 ||
    weight > LIMITS.weight
  ) {
    return invalid(`La charge doit être comprise entre 0 et ${LIMITS.weight} kg.`)
  }
  return { reps, weight }
}

/** Accept French decimal commas while rejecting exponent notation and partial numbers. */
export function parseSetFields(reps: string, weight: string): Pick<WorkoutSet, 'reps' | 'weight'> {
  const repetitionText = reps.trim()
  const weightText = weight.trim()
  if (!/^\d+$/.test(repetitionText)) return invalid('Renseigne un nombre entier de répétitions.')
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(weightText)) {
    return invalid('Renseigne une charge en kilogrammes (ex. 10 ou 7,5).')
  }
  return numericSet(Number(repetitionText), Number(weightText.replace(',', '.')))
}

/**
 * Reconstruct a safe snapshot from untrusted input. Imports are atomic: callers
 * must only replace their stored data after this function succeeds.
 */
export function validateTrainingData(value: unknown): TrainingData {
  const data = record(value, ['version', 'exercises', 'entries'], 'Sauvegarde')
  if (data.version !== 1) return invalid('Version de sauvegarde non prise en charge.')
  const exerciseIds = new Set<string>()
  const exercises = array(data.exercises, LIMITS.exercises, 'Exercices').map((raw): Exercise => {
    const item = record(raw, ['id', 'name', 'muscle', 'createdAt'], 'Exercice')
    const exerciseId = id(item.id)
    if (exerciseIds.has(exerciseId)) return invalid('Deux exercices ont le même identifiant.')
    exerciseIds.add(exerciseId)
    return {
      id: exerciseId,
      name: string(item.name, 100, 'Nom de l’exercice'),
      muscle: string(item.muscle, 50, 'Groupe musculaire'),
      createdAt: timestamp(item.createdAt),
    }
  })
  const entryIds = new Set<string>()
  const entries = array(data.entries, LIMITS.entries, 'Séances').map((raw): WorkoutEntry => {
    const item = record(
      raw,
      ['id', 'exerciseId', 'date', 'sets', 'notes', 'createdAt', 'updatedAt'],
      'Séance',
    )
    const entryId = id(item.id)
    if (entryIds.has(entryId)) return invalid('Deux séances ont le même identifiant.')
    entryIds.add(entryId)
    const exerciseId = id(item.exerciseId)
    if (!exerciseIds.has(exerciseId))
      return invalid('Une séance fait référence à un exercice absent.')
    if (!isCivilDate(item.date)) return invalid('Date de séance invalide.')
    const setIds = new Set<string>()
    const sets = array(item.sets, LIMITS.sets, 'Séries').map((rawSet): WorkoutSet => {
      const set = record(rawSet, ['id', 'reps', 'weight'], 'Série')
      const setId = id(set.id)
      if (setIds.has(setId))
        return invalid('Deux séries de la même séance ont le même identifiant.')
      setIds.add(setId)
      return { id: setId, ...numericSet(set.reps, set.weight) }
    })
    if (sets.length === 0) return invalid('Une séance doit contenir au moins une série.')
    const createdAt = timestamp(item.createdAt)
    const updatedAt = timestamp(item.updatedAt)
    if (updatedAt < createdAt) return invalid('La modification précède la création de la séance.')
    return {
      id: entryId,
      exerciseId,
      date: item.date,
      sets,
      notes: string(item.notes, 2_000, 'Notes', true),
      createdAt,
      updatedAt,
    }
  })
  const validated: TrainingData = { version: 1, exercises, entries }
  if (exceedsBackupLimit(compactBackup(validated))) {
    return invalid('Le carnet est trop volumineux : la sauvegarde ne peut pas dépasser 10 Mio.')
  }
  return validated
}

export function parseBackup(text: string): TrainingData {
  if (exceedsBackupLimit(text))
    return invalid('Le fichier de sauvegarde dépasse la taille maximale de 10 Mio.')
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return invalid('Ce fichier n’est pas une sauvegarde JSON valide.')
  }
  return validateTrainingData(parsed)
}

export function serializeBackup(data: TrainingData): string {
  return compactBackup(validateTrainingData(data))
}

/** Newest workout date first; creation time and ID disambiguate same-day entries. */
export function sortEntries(entries: readonly WorkoutEntry[]): WorkoutEntry[] {
  return [...entries].sort((a, b) => {
    for (const key of ['date', 'createdAt', 'id'] as const) {
      if (a[key] < b[key]) return 1
      if (a[key] > b[key]) return -1
    }
    return 0
  })
}

export function latestEntry(
  entries: readonly WorkoutEntry[],
  exerciseId: string,
): WorkoutEntry | undefined {
  return sortEntries(entries.filter((entry) => entry.exerciseId === exerciseId))[0]
}

export function volume(entry: Pick<WorkoutEntry, 'sets'>): number {
  return entry.sets.reduce((total, set) => total + set.reps * set.weight, 0)
}

export function maxWeight(entry: Pick<WorkoutEntry, 'sets'>): number {
  return entry.sets.reduce((maximum, set) => Math.max(maximum, set.weight), 0)
}

/** Use local getters: toISOString().slice(0, 10) changes the day near midnight. */
export function localDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) return invalid('Date invalide.')
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const CATALOGUE_DATE = '2026-01-01T00:00:00.000Z'

export const starterExercises: readonly Exercise[] = [
  { id: 'starter-curl', name: 'Curl haltères', muscle: 'Biceps', createdAt: CATALOGUE_DATE },
  { id: 'starter-bench', name: 'Développé couché', muscle: 'Pectoraux', createdAt: CATALOGUE_DATE },
  { id: 'starter-squat', name: 'Squat', muscle: 'Jambes', createdAt: CATALOGUE_DATE },
  { id: 'starter-deadlift', name: 'Soulevé de terre', muscle: 'Dos', createdAt: CATALOGUE_DATE },
  { id: 'starter-pulldown', name: 'Tirage vertical', muscle: 'Dos', createdAt: CATALOGUE_DATE },
  { id: 'starter-row', name: 'Rowing haltère', muscle: 'Dos', createdAt: CATALOGUE_DATE },
  {
    id: 'starter-shoulder-press',
    name: 'Développé épaules',
    muscle: 'Épaules',
    createdAt: CATALOGUE_DATE,
  },
  {
    id: 'starter-triceps',
    name: 'Extension triceps',
    muscle: 'Triceps',
    createdAt: CATALOGUE_DATE,
  },
  {
    id: 'starter-leg-press',
    name: 'Presse à cuisses',
    muscle: 'Jambes',
    createdAt: CATALOGUE_DATE,
  },
]

/** Fresh objects on every call, with no invented workout history. */
export function emptyTrainingData(): TrainingData {
  return {
    version: 1,
    exercises: starterExercises.map((exercise) => ({ ...exercise })),
    entries: [],
  }
}
