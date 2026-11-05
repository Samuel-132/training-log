import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { emptyTrainingData, validateTrainingData, type TrainingData } from './domain'

interface TrainingDatabase extends DBSchema {
  state: {
    key: string
    value: TrainingData
  }
}

const DATABASE_NAME = 'training-log'
const DATABASE_VERSION = 1
const DATA_KEY = 'data'
const listeners = new Set<() => void>()
let channel: BroadcastChannel | undefined

function storageError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : 'Erreur inconnue.'
  return new Error(`Impossible d’accéder aux données sur cet appareil. ${detail}`, { cause: error })
}

async function openDatabase(): Promise<IDBPDatabase<TrainingDatabase>> {
  try {
    const database = await openDB<TrainingDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database, oldVersion) {
        // Never recreate an existing store: unknown versions must be preserved.
        if (oldVersion === 0) database.createObjectStore('state')
      },
      blocking(_currentVersion, _blockedVersion, event) {
        // Let another tab upgrade the database rather than retaining a stale connection.
        const connection = event.target as IDBDatabase
        connection.close()
      },
    })
    if (!database.objectStoreNames.contains('state')) {
      database.close()
      throw new Error(
        'La structure de la base locale est inconnue. Vos données ont été conservées.',
      )
    }
    return database
  } catch (error) {
    throw storageError(error)
  }
}

function notifyLocalListeners(): void {
  for (const listener of listeners) {
    // A view's refresh failure must not turn a committed write into a reported failure.
    try {
      listener()
    } catch {
      /* The subscriber owns its refresh errors. */
    }
  }
}

function notifyChanges(): void {
  notifyLocalListeners()
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  try {
    if (channel) channel.postMessage('changed')
    else {
      const temporary = new BroadcastChannel('training-log-changes')
      temporary.postMessage('changed')
      temporary.close()
    }
  } catch {
    /* Cross-tab refresh is optional; the transaction already committed. */
  }
}

/** Refresh views after local writes and writes from other tabs on the same origin. */
export function subscribeToChanges(listener: () => void): () => void {
  listeners.add(listener)
  if (!channel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel('training-log-changes')
      channel.onmessage = notifyLocalListeners
    } catch {
      /* The caller can also refresh on focus where channels are unavailable. */
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      channel?.close()
      channel = undefined
    }
  }
}

/** Read existing data or initialize a new installation in one atomic transaction. */
export async function loadData(): Promise<TrainingData> {
  const database = await openDatabase()
  const transaction = database.transaction('state', 'readwrite')
  try {
    const existing = await transaction.store.get(DATA_KEY)
    const data = validateTrainingData(existing === undefined ? emptyTrainingData() : existing)
    if (existing === undefined) await transaction.store.put(data, DATA_KEY)
    await transaction.done
    return data
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      /* The transaction may already have aborted. */
    }
    await transaction.done.catch(() => undefined)
    throw storageError(error)
  } finally {
    database.close()
  }
}

/**
 * Apply a synchronous update to the latest stored state. IndexedDB serializes
 * read/write transactions, so simultaneous changes in two tabs cannot overwrite
 * each other with stale snapshots. Rejected validation leaves the store intact.
 */
export async function mutateData(
  update: (latest: TrainingData) => TrainingData,
): Promise<TrainingData> {
  const database = await openDatabase()
  const transaction = database.transaction('state', 'readwrite')
  let result: TrainingData
  try {
    const existing = await transaction.store.get(DATA_KEY)
    const current = validateTrainingData(existing === undefined ? emptyTrainingData() : existing)
    result = validateTrainingData(update(current))
    await transaction.store.put(result, DATA_KEY)
    await transaction.done
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      /* The transaction may already have aborted. */
    }
    await transaction.done.catch(() => undefined)
    throw storageError(error)
  } finally {
    database.close()
  }
  notifyChanges()
  return result
}

/** Validate and replace a backup atomically, only after the UI confirms replacement. */
export async function replaceData(data: TrainingData): Promise<TrainingData> {
  const validated = validateTrainingData(data)
  // Restoration is an explicit replacement: a damaged previous record must not
  // prevent recovery from a valid backup. Opening a future DB version still fails.
  const database = await openDatabase()
  const transaction = database.transaction('state', 'readwrite')
  try {
    await transaction.store.put(validated, DATA_KEY)
    await transaction.done
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      /* May already be aborted. */
    }
    await transaction.done.catch(() => undefined)
    throw storageError(error)
  } finally {
    database.close()
  }
  notifyChanges()
  return validated
}
