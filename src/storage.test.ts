import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, mutateData, replaceData, subscribeToChanges } from './storage'
import type { Exercise, TrainingData } from './domain'

const exercise = (id: string): Exercise => ({
  id,
  name: `Exercice ${id}`,
  muscle: 'Biceps',
  createdAt: '2026-11-05T09:00:00.000Z',
})

beforeEach(async () => {
  await deleteDB('training-log')
})

describe('IndexedDB repository', () => {
  it('initializes once and persists updates across separate connections', async () => {
    const initial = await loadData()
    expect(initial.version).toBe(1)
    expect(initial.entries).toEqual([])
    expect(await loadData()).toEqual(initial)

    await mutateData((data) => ({
      ...data,
      exercises: [...data.exercises, exercise('custom-curl')],
    }))
    const reopened = await loadData()
    expect(reopened.exercises).toContainEqual(exercise('custom-curl'))
    expect(reopened.exercises).toHaveLength(initial.exercises.length + 1)
  })

  it('serializes concurrent mutations rather than losing an update', async () => {
    const initial = await loadData()
    await Promise.all([
      mutateData((data) => ({ ...data, exercises: [...data.exercises, exercise('tab-one')] })),
      mutateData((data) => ({ ...data, exercises: [...data.exercises, exercise('tab-two')] })),
    ])
    const stored = await loadData()
    expect(stored.exercises).toHaveLength(initial.exercises.length + 2)
    expect(stored.exercises.map((item) => item.id)).toEqual(
      expect.arrayContaining(['tab-one', 'tab-two']),
    )
  })

  it('round-trips independent repetitions and loads for each set', async () => {
    const initial = await loadData()
    const entry = {
      id: 'curl-workout',
      exerciseId: initial.exercises[0]!.id,
      date: '2026-11-05',
      sets: [
        { id: 'set-1', reps: 10, weight: 10 },
        { id: 'set-2', reps: 8, weight: 10 },
        { id: 'set-3', reps: 9, weight: 8 },
      ],
      notes: '',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    }
    await mutateData((data) => ({ ...data, entries: [entry] }))
    expect((await loadData()).entries).toEqual([entry])
  })

  it('leaves the committed state intact after invalid backup or update', async () => {
    const initial = await loadData()
    await expect(
      replaceData({ ...initial, version: 2 } as unknown as TrainingData),
    ).rejects.toThrow()
    await expect(
      mutateData((data) => ({
        ...data,
        exercises: [exercise('duplicate'), exercise('duplicate')],
      })),
    ).rejects.toThrow()
    await expect(
      mutateData((data) => {
        data.exercises.length = 0
        throw new Error('Annulation')
      }),
    ).rejects.toThrow('Annulation')
    expect(await loadData()).toEqual(initial)
  })

  it('reports corrupted stored data without silently resetting it', async () => {
    await loadData()
    const rawDatabase = await openDB('training-log', 1)
    await rawDatabase.put('state', { version: 99, data: 'preserve me' }, 'data')
    rawDatabase.close()

    await expect(loadData()).rejects.toThrow()
    await expect(mutateData((data) => data)).rejects.toThrow()
    const inspectDatabase = await openDB('training-log', 1)
    expect(await inspectDatabase.get('state', 'data')).toEqual({ version: 99, data: 'preserve me' })
    inspectDatabase.close()
  })

  it('preserves the last committed data when a write fails due to quota', async () => {
    const initial = await loadData()
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota atteint', 'QuotaExceededError')
    })
    await expect(
      mutateData((data) => ({ ...data, exercises: [...data.exercises, exercise('over-quota')] })),
    ).rejects.toThrow('Quota atteint')
    put.mockRestore()
    expect(await loadData()).toEqual(initial)
  })

  it('restores a valid backup even when the previous record is damaged', async () => {
    const initial = await loadData()
    const rawDatabase = await openDB('training-log', 1)
    await rawDatabase.put('state', { invalid: true }, 'data')
    rawDatabase.close()
    await expect(loadData()).rejects.toThrow()
    await replaceData(initial)
    expect(await loadData()).toEqual(initial)
  })

  it('does not delete or downgrade a database from a future app version', async () => {
    const futureDatabase = await openDB('training-log', 2, {
      upgrade(database) {
        database.createObjectStore('state')
      },
    })
    await futureDatabase.put('state', 'future-version-data', 'data')
    futureDatabase.close()

    await expect(loadData()).rejects.toThrow()
    const inspectDatabase = await openDB('training-log', 2)
    expect(await inspectDatabase.get('state', 'data')).toBe('future-version-data')
    inspectDatabase.close()
  })

  it('notifies subscribers only after successful commits', async () => {
    await loadData()
    const listener = vi.fn()
    const unsubscribe = subscribeToChanges(listener)
    await mutateData((data) => ({ ...data, exercises: [...data.exercises, exercise('notify')] }))
    expect(listener).toHaveBeenCalledOnce()
    await expect(
      mutateData((data) => ({ ...data, version: 2 }) as unknown as TrainingData),
    ).rejects.toThrow()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    await mutateData((data) => data)
    expect(listener).toHaveBeenCalledOnce()
  })
})
