import { describe, expect, it } from 'vitest'
import {
  emptyTrainingData,
  isCivilDate,
  latestEntry,
  localDate,
  MAX_BACKUP_BYTES,
  maxWeight,
  parseBackup,
  parseSetFields,
  serializeBackup,
  sortEntries,
  validateTrainingData,
  volume,
  type TrainingData,
  type WorkoutEntry,
} from './domain'

const timestamp = '2026-11-05T10:00:00.000Z'
const curl: WorkoutEntry = {
  id: 'entry-curl',
  exerciseId: 'starter-curl',
  date: '2026-11-05',
  sets: [
    { id: 's1', reps: 10, weight: 10 },
    { id: 's2', reps: 8, weight: 10 },
    { id: 's3', reps: 9, weight: 8 },
  ],
  notes: 'Charge par haltère',
  createdAt: timestamp,
  updatedAt: timestamp,
}

function snapshot(): TrainingData {
  return { ...emptyTrainingData(), entries: [structuredClone(curl)] }
}

/** Build valid notes-heavy data exactly at the byte limit, without quadratic serialization. */
function snapshotAtBackupLimit(): TrainingData {
  const data = emptyTrainingData()
  const encoder = new TextEncoder()
  let bytes = encoder.encode(`${JSON.stringify(data)}\n`).byteLength
  let index = 0
  for (;;) {
    const entry = { ...structuredClone(curl), id: `entry-${index}`, notes: 'é'.repeat(2_000) }
    const entryBytes =
      encoder.encode(JSON.stringify(entry)).byteLength + (data.entries.length ? 1 : 0)
    if (bytes + entryBytes > MAX_BACKUP_BYTES) break
    data.entries.push(entry)
    bytes += entryBytes
    index++
  }
  const remaining = MAX_BACKUP_BYTES - bytes
  const finalEntry = { ...structuredClone(curl), id: `entry-${index}`, notes: '' }
  const overhead = encoder.encode(JSON.stringify(finalEntry)).byteLength + 1
  if (remaining >= overhead) {
    const noteBytes = remaining - overhead
    finalEntry.notes = `${'é'.repeat(Math.floor(noteBytes / 2))}${noteBytes % 2 ? 'a' : ''}`
    data.entries.push(finalEntry)
  } else {
    // A three-byte character replaces a two-byte one, adding one byte per replacement.
    data.entries.at(-1)!.notes = `${'€'.repeat(remaining)}${'é'.repeat(2_000 - remaining)}`
  }
  return data
}

describe('performance par série', () => {
  it('préserve les trois séries différentes de curl et calcule leur volume', () => {
    const data = parseBackup(serializeBackup(snapshot()))
    expect(data.entries[0]?.sets).toEqual(curl.sets)
    expect(volume(curl)).toBe(252)
    expect(maxWeight(curl)).toBe(10)
  })

  it('accepte virgule décimale, espaces en bordure et poids du corps à 0 kg', () => {
    expect(parseSetFields(' 8 ', ' 7,5 ')).toEqual({ reps: 8, weight: 7.5 })
    expect(parseSetFields('10', '0')).toEqual({ reps: 10, weight: 0 })
    expect(parseSetFields('10', ',5')).toEqual({ reps: 10, weight: 0.5 })
  })

  it.each([
    ['', '10'],
    ['0', '10'],
    ['1.5', '10'],
    ['-1', '10'],
    ['10', '-1'],
    ['10', ''],
    ['10', '1e3'],
    ['10', 'Infinity'],
    ['10', '8kg'],
    ['10001', '1'],
    ['1', '10001'],
  ])('refuse la saisie invalide %s / %s', (reps, weight) =>
    expect(() => parseSetFields(reps, weight)).toThrow(),
  )
})

describe('dates et ordre chronologique', () => {
  it('utilise le jour de séance avant la date de saisie, sans modifier la liste originale', () => {
    const backdated = {
      ...curl,
      id: 'backdated',
      date: '2026-10-01',
      createdAt: '2026-11-06T10:00:00.000Z',
    }
    const entries = [backdated, curl]
    expect(latestEntry(entries, curl.exerciseId)?.id).toBe(curl.id)
    expect(entries[0]?.id).toBe('backdated')
    expect(latestEntry(entries, 'unknown')).toBeUndefined()
  })

  it('départage le même jour par création puis identifiant, indépendamment des modifications', () => {
    const a = { ...curl, id: 'a', updatedAt: '2026-11-09T00:00:00.000Z' }
    const b = { ...curl, id: 'b' }
    const c = { ...curl, id: 'c', createdAt: '2026-11-05T11:00:00.000Z' }
    expect(sortEntries([a, c, b]).map((entry) => entry.id)).toEqual(['c', 'b', 'a'])
  })

  it.each(['2024-02-29', '2000-02-29', '2026-11-05'])('accepte le jour civil %s', (value) => {
    expect(isCivilDate(value)).toBe(true)
  })

  it.each([
    '2025-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-11-00',
    '2026-1-1',
    '0000-01-01',
    '2026-11-05T00:00:00Z',
  ])('refuse le jour civil %s', (value) => {
    expect(isCivilDate(value)).toBe(false)
  })

  it('construit une date depuis les composantes locales, sans passer par UTC', () => {
    const date = new Date(2026, 10, 5, 0, 15)
    expect(localDate(date)).toBe('2026-11-05')
    expect(() => localDate(new Date('invalid'))).toThrow()
  })
})

describe('sauvegardes non fiables', () => {
  it('exporte un JSON compact terminé par une seule nouvelle ligne et préserve les caractères UTF-8', () => {
    const data = snapshot()
    data.entries[0]!.notes = 'Épaules : 7,5 kg 💪\nRéglage nº 3'
    const backup = serializeBackup(data)
    expect(backup).toBe(`${JSON.stringify(data)}\n`)
    expect(new TextEncoder().encode(backup).byteLength).toBeGreaterThan(backup.length)
    expect(parseBackup(backup)).toEqual(data)
  })

  it('accepte exactement 10 Mio, nouvelle ligne comprise, et refuse un seul octet UTF-8 de plus', () => {
    const data = snapshotAtBackupLimit()
    expect(data.entries.length).toBeLessThan(50_000)
    expect(data.entries.every((entry) => entry.notes.length <= 2_000)).toBe(true)
    const backup = serializeBackup(data)
    expect(new TextEncoder().encode(backup).byteLength).toBe(MAX_BACKUP_BYTES)
    expect(backup.length).toBeLessThan(MAX_BACKUP_BYTES)
    expect(parseBackup(backup)).toEqual(data)

    // All structural limits still hold; only the canonical UTF-8 size changes.
    data.entries[0]!.notes = `€${data.entries[0]!.notes.slice(1)}`
    expect(() => validateTrainingData(data)).toThrow(/carnet est trop volumineux.*10 Mio/)
    expect(() => serializeBackup(data)).toThrow(/carnet est trop volumineux.*10 Mio/)
    const oversizedBackup = `${JSON.stringify(data)}\n`
    expect(oversizedBackup.length).toBeLessThan(MAX_BACKUP_BYTES)
    expect(new TextEncoder().encode(oversizedBackup).byteLength).toBe(MAX_BACKUP_BYTES + 1)
    expect(() => parseBackup(oversizedBackup)).toThrow(/fichier de sauvegarde.*10 Mio/)
  })

  it('retourne une copie indépendante et conserve les relations lors du renommage', () => {
    const data = snapshot()
    data.exercises[0]!.name = 'Curl personnalisé'
    const result = validateTrainingData(data)
    expect(result.entries[0]?.exerciseId).toBe(result.exercises[0]?.id)
    result.entries[0]!.sets[0]!.weight = 20
    expect(data.entries[0]?.sets[0]?.weight).toBe(10)
  })

  it('crée un catalogue modifiable indépendant sans historique fictif', () => {
    const a = emptyTrainingData()
    const b = emptyTrainingData()
    a.exercises[0]!.name = 'Modifié'
    expect(b.exercises[0]?.name).not.toBe('Modifié')
    expect(b.entries).toEqual([])
  })

  it.each(['null', '[]', '{}', '{', '{"version":2,"exercises":[],"entries":[]}'])(
    'refuse le document %s',
    (text) => {
      expect(() => parseBackup(text)).toThrow()
    },
  )

  it('refuse les champs inconnus et les clés de prototype', () => {
    expect(() =>
      parseBackup('{"version":1,"exercises":[],"entries":[],"__proto__":{"polluted":true}}'),
    ).toThrow()
    expect(() =>
      validateTrainingData(Object.assign(Object.create({ polluted: true }) as object, snapshot())),
    ).toThrow()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('refuse un exercice en doublon', () => {
    const data = snapshot()
    data.exercises.push({ ...data.exercises[0]! })
    expect(() => validateTrainingData(data)).toThrow(/même identifiant/)
  })

  it('refuse une séance en doublon', () => {
    const data = snapshot()
    data.entries.push(structuredClone(curl))
    expect(() => validateTrainingData(data)).toThrow(/même identifiant/)
  })

  it('refuse les références à un exercice absent', () => {
    const data = snapshot()
    data.entries[0]!.exerciseId = 'missing'
    expect(() => validateTrainingData(data)).toThrow(/absent/)
  })

  it('refuse les identifiants de série dupliqués dans une séance et les séries vides', () => {
    const data = snapshot()
    data.entries[0]!.sets[1]!.id = 's1'
    expect(() => validateTrainingData(data)).toThrow(/même identifiant/)
    data.entries[0]!.sets = []
    expect(() => validateTrainingData(data)).toThrow(/au moins une série/)
  })

  it.each([-1, NaN, Infinity, -Infinity, 10001])('refuse une charge non valide : %s', (weight) => {
    const data = snapshot()
    data.entries[0]!.sets[0]!.weight = weight
    expect(() => validateTrainingData(data)).toThrow()
  })

  it.each([-1, 0, 1.5, NaN, Infinity, 10001])('refuse des répétitions non valides : %s', (reps) => {
    const data = snapshot()
    data.entries[0]!.sets[0]!.reps = reps
    expect(() => validateTrainingData(data)).toThrow()
  })

  it('refuse les dates normalisées silencieusement, les horodatages inversés et les textes trop longs', () => {
    const data = snapshot()
    data.entries[0]!.date = '2026-02-30'
    expect(() => validateTrainingData(data)).toThrow(/Date/)
    data.entries[0]!.date = curl.date
    data.entries[0]!.updatedAt = '2026-11-04T10:00:00.000Z'
    expect(() => validateTrainingData(data)).toThrow(/précède/)
    data.entries[0]!.updatedAt = timestamp
    data.entries[0]!.notes = 'x'.repeat(2001)
    expect(() => validateTrainingData(data)).toThrow(/Notes/)
  })
})
