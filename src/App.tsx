import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  HardDrive,
  History,
  Library,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { Exercise, TrainingData, WorkoutEntry } from './domain'
import {
  localDate,
  maxWeight,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  sortEntries,
  volume,
} from './domain'
import { loadData, mutateData, replaceData, subscribeToChanges } from './storage'
import { dateLabel, number, setsLabel } from './format'
import { Dialog } from './components/Dialog'
import { ExerciseEditor } from './components/ExerciseEditor'
import { EntryEditor } from './components/EntryEditor'
import { ProgressChart } from './components/ProgressChart'
import { ExerciseLibrary } from './components/ExerciseLibrary'
import { InstallPanel } from './components/InstallPanel'
import { usePwa } from './usePwa'

type Tab = 'exercises' | 'history' | 'settings'
type Confirmation = {
  title: string
  text: string
  action: string
  danger?: boolean
  run: () => Promise<void>
}
const tabs = [
  { id: 'exercises' as const, label: 'Mes exercices', icon: Library },
  { id: 'history' as const, label: 'Historique', icon: CalendarDays },
  { id: 'settings' as const, label: 'Sauvegardes', icon: HardDrive },
]

export default function App() {
  const pwa = usePwa()
  const [data, setData] = useState<TrainingData>()
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('exercises')
  const [selectedId, setSelectedId] = useState<string>()
  const [query, setQuery] = useState('')
  const [exerciseEditor, setExerciseEditor] = useState<Exercise | 'new'>()
  const [entryEditor, setEntryEditor] = useState<{ exerciseId?: string; entry?: WorkoutEntry }>()
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [backupBusy, setBackupBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      setData(await loadData())
      setLoadError('')
    } catch {
      setLoadError(
        'Le stockage de cet appareil est inaccessible ou contient des données incompatibles. Vos données n’ont pas été effacées. Autorisez le stockage dans votre navigateur, puis réessayez.',
      )
    }
  }
  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeToChanges(() => void refresh())
    const onFocus = () => void refresh()
    const onOnline = () => setOnline(navigator.onLine)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOnline)
    }
  }, [])
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 6000)
    return () => clearTimeout(timeout)
  }, [message])
  function changed(next: TrainingData, text: string) {
    setData(next)
    setLoadError('')
    setMessage(text)
  }
  function navigate(next: Tab) {
    setTab(next)
    setSelectedId(undefined)
    setQuery('')
    window.scrollTo(0, 0)
  }
  function confirm(value: Confirmation) {
    setConfirmError('')
    setConfirmation(value)
  }
  async function exportBackup() {
    setBackupBusy(true)
    try {
      const fresh = await loadData()
      const url = URL.createObjectURL(
        new Blob([serializeBackup(fresh)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `training-log-${localDate()}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setMessage('Export généré. Conservez le fichier dans un endroit sûr.')
    } catch {
      setMessage('Impossible de créer l’export. Réessayez depuis ce navigateur.')
    } finally {
      setBackupBusy(false)
    }
  }
  async function importBackup(file?: File) {
    if (!file) return
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('Le fichier dépasse la taille maximale de 10 Mio.')
      const imported = parseBackup(await file.text())
      confirm({
        title: 'Restaurer cette sauvegarde ?',
        text: `${imported.exercises.length} exercices et ${imported.entries.length} performances seront restaurés. Cette action remplacera toutes les données actuellement sur cet appareil. Exportez-les d’abord si vous souhaitez les conserver.`,
        action: 'Remplacer et restaurer',
        danger: true,
        run: async () => {
          changed(await replaceData(imported), 'Sauvegarde restaurée.')
          setSelectedId(undefined)
        },
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ce fichier de sauvegarde est invalide.')
    }
  }

  const selected = data?.exercises.find((exercise) => exercise.id === selectedId)
  const entries = data ? sortEntries(data.entries) : []
  const normalized = query
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
  const matchesQuery = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .includes(normalized)
  const filteredEntries = entries.filter((entry) =>
    matchesQuery(data?.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name ?? ''),
  )

  const renderEntry = (entry: WorkoutEntry, showName = false) => (
    <article className="history-entry" key={entry.id}>
      <div className="history-entry-icon">
        <Dumbbell size={20} />
      </div>
      <div className="history-entry-content">
        <h3>
          {showName
            ? data!.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name
            : dateLabel(entry.date, true)}
        </h3>
        <p>{setsLabel(entry)}</p>
        {entry.notes && <p className="entry-note">{entry.notes}</p>}
      </div>
      <div className="entry-volume">
        <strong>
          {number(volume(entry))} <span>kg</span>
        </strong>
        <span>volume total</span>
      </div>
      <div className="entry-actions">
        <button
          className="icon-button"
          aria-label={`Modifier la performance du ${dateLabel(entry.date)} ${showName ? data!.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name : ''}`}
          onClick={() => setEntryEditor({ entry })}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={`Supprimer la performance du ${dateLabel(entry.date)} ${showName ? data!.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name : ''}`}
          onClick={() =>
            confirm({
              title: 'Supprimer cette performance ?',
              text: `La performance du ${dateLabel(entry.date)} et ses ${entry.sets.length} séries seront supprimées.`,
              action: 'Supprimer la performance',
              danger: true,
              run: async () =>
                changed(
                  await mutateData((current) => ({
                    ...current,
                    entries: current.entries.filter((item) => item.id !== entry.id),
                  })),
                  'Performance supprimée.',
                ),
            })
          }
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            navigate('exercises')
          }}
        >
          <span className="brand-icon">
            <Dumbbell size={24} strokeWidth={2.4} />
          </span>
          <span>
            training<span className="brand-light">log</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-label">VOTRE ESPACE</div>
        <nav aria-label="Navigation principale">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {tab === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={20} />
            <strong>
              Votre rythme.
              <br />
              Vos données.
            </strong>
            <p>Un carnet personnel, enregistré sur cet appareil.</p>
            <button className="text-button" onClick={() => navigate('settings')}>
              Gérer mes sauvegardes <ArrowUpRight size={14} />
            </button>
          </div>
          <span className="sidebar-footer">UNE SÉRIE DE MIEUX.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Mon carnet <ChevronRight size={14} />
            <strong>
              {selected ? selected.name : tabs.find((item) => item.id === tab)?.label}
            </strong>
          </span>
          <div className="connection-state">
            {!online ? (
              <WifiOff size={14} />
            ) : pwa.status === 'ready' ? (
              <Check size={14} />
            ) : (
              <Wifi size={14} />
            )}
            <span>
              {!online ? 'Hors ligne' : pwa.status === 'ready' ? 'Prêt hors ligne' : 'En ligne'}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {pwa.updateAvailable && !entryEditor && !exerciseEditor && !confirmation && (
            <div className="pwa-update" role="status">
              <span>
                Une nouvelle version de Training Log est prête. Votre carnet sera conservé.
              </span>
              <button
                className="button secondary"
                disabled={pwa.updating}
                onClick={pwa.applyUpdate}
              >
                {pwa.updating ? 'Mise à jour…' : 'Recharger l’app'}
              </button>
            </div>
          )}
          {loadError ? (
            <div className="panel loading-error">
              <HardDrive size={32} />
              <h1>Accès aux données indisponible</h1>
              <p>{loadError}</p>
              <div className="recovery-actions">
                <button className="button primary" onClick={() => void refresh()}>
                  Réessayer
                </button>
                <button className="button secondary" onClick={() => importRef.current?.click()}>
                  <Upload size={17} /> Restaurer une sauvegarde
                </button>
              </div>
            </div>
          ) : !data ? (
            <div className="loading" role="status">
              Ouverture de votre carnet…
            </div>
          ) : (
            <>
              {tab === 'exercises' && !selected && (
                <ExerciseLibrary
                  data={data}
                  onAddEntry={() => setEntryEditor({})}
                  onAddExercise={() => setExerciseEditor('new')}
                  onSelectExercise={setSelectedId}
                />
              )}
              {tab === 'exercises' &&
                selected &&
                (() => {
                  const exerciseEntries = entries.filter(
                    (entry) => entry.exerciseId === selected.id,
                  )
                  const last = exerciseEntries[0]
                  return (
                    <>
                      <button className="back-link" onClick={() => setSelectedId(undefined)}>
                        <ArrowLeft size={16} /> Tous mes exercices
                      </button>
                      <section className="detail-heading">
                        <div>
                          <span className="eyebrow">{selected.muscle}</span>
                          <h1>{selected.name}</h1>
                          <p>
                            {exerciseEntries.length} performance
                            {exerciseEntries.length !== 1 ? 's' : ''} enregistrée
                            {exerciseEntries.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="detail-actions">
                          <button
                            className="icon-button bordered"
                            aria-label="Modifier l’exercice"
                            onClick={() => setExerciseEditor(selected)}
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            className="button primary"
                            onClick={() => setEntryEditor({ exerciseId: selected.id })}
                          >
                            <Plus size={19} /> Ajouter une performance
                          </button>
                        </div>
                      </section>
                      <div className="detail-grid">
                        <section className="panel latest-panel">
                          <div className="panel-heading">
                            <h2>
                              <History size={18} /> Dernière performance
                            </h2>
                            {last && <span>{dateLabel(last.date)}</span>}
                          </div>
                          {last ? (
                            <>
                              <div className="last-highlight">
                                <strong>
                                  {number(maxWeight(last))}
                                  <span>kg</span>
                                </strong>
                                <span>charge maximale</span>
                              </div>
                              <table className="performance-table">
                                <thead>
                                  <tr>
                                    <th>Série</th>
                                    <th>Répétitions</th>
                                    <th>Poids</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {last.sets.map((set, index) => (
                                    <tr key={set.id}>
                                      <td>
                                        <span className="set-number">
                                          {String(index + 1).padStart(2, '0')}
                                        </span>
                                      </td>
                                      <td>{set.reps}</td>
                                      <td>
                                        {number(set.weight)} <span>kg</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="volume-total">
                                Volume total <strong>{number(volume(last))} kg</strong>
                              </div>
                              {last.notes && <p className="entry-note">{last.notes}</p>}
                            </>
                          ) : (
                            <div className="empty-state compact">
                              <Dumbbell size={28} />
                              <h3>À vous de jouer.</h3>
                              <p>
                                Notez vos séries, une par une.
                                <br />
                                Vous les retrouverez ici à la prochaine séance.
                              </p>
                            </div>
                          )}
                        </section>
                        <section className="panel chart-panel">
                          <div className="panel-heading">
                            <h2>
                              <ArrowUpRight size={19} /> Votre progression
                            </h2>
                            <span>Charge maximale</span>
                          </div>
                          <ProgressChart entries={exerciseEntries} />
                          <p className="chart-note">
                            Comparez aussi les répétitions et les séries : la charge seule ne résume
                            pas une séance.
                          </p>
                        </section>
                      </div>
                      <section className="section">
                        <div className="section-heading">
                          <div>
                            <span className="eyebrow">CHAQUE SÉANCE COMPTE</span>
                            <h2>Historique des performances</h2>
                          </div>
                        </div>
                        <div className="history-list">
                          {exerciseEntries.map((entry) => renderEntry(entry))}
                        </div>
                        {!exerciseEntries.length && (
                          <p className="muted">Aucune performance enregistrée pour le moment.</p>
                        )}
                      </section>
                      {!exerciseEntries.length && (
                        <button
                          className="text-button danger-text"
                          onClick={() =>
                            confirm({
                              title: 'Supprimer cet exercice ?',
                              text: `« ${selected.name} » sera retiré de votre répertoire.`,
                              action: 'Supprimer l’exercice',
                              danger: true,
                              run: async () => {
                                changed(
                                  await mutateData((current) => {
                                    if (
                                      current.entries.some(
                                        (entry) => entry.exerciseId === selected.id,
                                      )
                                    )
                                      throw new Error(
                                        'Cet exercice possède maintenant des performances. Conservez-le pour préserver son historique.',
                                      )
                                    return {
                                      ...current,
                                      exercises: current.exercises.filter(
                                        (exercise) => exercise.id !== selected.id,
                                      ),
                                    }
                                  }),
                                  'Exercice supprimé.',
                                )
                                setSelectedId(undefined)
                              },
                            })
                          }
                        >
                          <Trash2 size={15} /> Supprimer cet exercice
                        </button>
                      )}
                    </>
                  )
                })()}
              {tab === 'history' && (
                <>
                  <section className="page-heading">
                    <span className="eyebrow">VOTRE PARCOURS</span>
                    <h1>Chaque séance compte.</h1>
                    <p>Toutes vos performances, du premier effort au plus récent.</p>
                  </section>
                  <label className="search-field history-search">
                    <Search size={18} />
                    <input
                      type="search"
                      aria-label="Rechercher dans l’historique"
                      placeholder="Filtrer par exercice…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  {!filteredEntries.length ? (
                    <div className="empty-state">
                      <CalendarDays size={30} />
                      <h2>{query ? 'Aucune performance trouvée' : 'L’histoire reste à écrire.'}</h2>
                      <p>
                        {query
                          ? 'Essayez un autre exercice.'
                          : 'Enregistrez votre première performance pour commencer votre suivi.'}
                      </p>
                      {!query && (
                        <button
                          className="button primary"
                          disabled={!data.exercises.length}
                          onClick={() => setEntryEditor({})}
                        >
                          <Plus size={18} /> Ajouter une performance
                        </button>
                      )}
                    </div>
                  ) : (
                    [...new Set(filteredEntries.map((entry) => entry.date))].map((date) => (
                      <section className="history-day" key={date}>
                        <div className="history-date">
                          <span className="date-dot" />
                          <h2>{dateLabel(date, true)}</h2>
                          <span>
                            {filteredEntries.filter((entry) => entry.date === date).length}{' '}
                            exercice(s)
                          </span>
                        </div>
                        <div className="history-list">
                          {filteredEntries
                            .filter((entry) => entry.date === date)
                            .map((entry) => renderEntry(entry, true))}
                        </div>
                      </section>
                    ))
                  )}
                </>
              )}
              {tab === 'settings' && (
                <>
                  <section className="page-heading">
                    <span className="eyebrow">VOTRE CARNET, EN LIEU SÛR</span>
                    <h1>Gardez une trace.</h1>
                    <p>Sauvegardez vos efforts. Emportez votre progression.</p>
                  </section>
                  <div className="settings-grid">
                    <InstallPanel status={pwa.status} />
                    <section className="panel settings-panel">
                      <span className="settings-icon">
                        <ShieldCheck size={26} />
                      </span>
                      <h2>Un carnet personnel</h2>
                      <p>
                        Vos données sont enregistrées dans ce navigateur, sur cet appareil. Chaque
                        personne utilise son propre carnet, sans compte.
                      </p>
                      <div className="info-box">
                        Changer de navigateur ou d’appareil, désinstaller l’app ou effacer les
                        données du navigateur peut supprimer votre carnet. Exportez régulièrement
                        une sauvegarde.
                      </div>
                      <div className="storage-summary">
                        <span>{data.exercises.length} exercices</span>
                        <span>{data.entries.length} performances</span>
                      </div>
                    </section>
                    <section className="panel settings-panel">
                      <span className="settings-icon">
                        <ArrowDownToLine size={26} />
                      </span>
                      <h2>Exporter ma sauvegarde</h2>
                      <p>
                        Téléchargez un fichier JSON contenant tous vos exercices, séries et notes.
                        Vous pourrez le restaurer sur un autre appareil.
                      </p>
                      <button
                        className="button primary"
                        disabled={backupBusy}
                        onClick={() => void exportBackup()}
                      >
                        <ArrowDownToLine size={17} />{' '}
                        {backupBusy ? 'Préparation…' : 'Exporter mes données'}
                      </button>
                      <p className="input-hint">
                        La sauvegarde contient vos données personnelles. Conservez-la dans un
                        endroit sûr.
                      </p>
                    </section>
                    <section className="panel settings-panel">
                      <span className="settings-icon">
                        <Upload size={26} />
                      </span>
                      <h2>Restaurer une sauvegarde</h2>
                      <p>
                        Choisissez un fichier exporté depuis Training Log. Le contenu sera vérifié
                        avant de vous proposer de remplacer votre carnet actuel.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => importRef.current?.click()}
                      >
                        <Upload size={17} /> Choisir un fichier
                      </button>
                      <p className="input-hint">
                        Format JSON · 10 Mio maximum · remplace les données existantes
                      </p>
                    </section>
                    <section className="panel settings-panel">
                      <span className="settings-icon">
                        <Settings size={26} />
                      </span>
                      <h2>Comment noter mes charges ?</h2>
                      <p>
                        Gardez la même convention pour comparer vos performances : poids par
                        haltère, ou poids total de la barre avec ses disques.
                      </p>
                      <p>
                        Le volume est la somme de répétitions × poids pour chaque série. Les séries
                        au poids du corps peuvent être notées à 0 kg.
                      </p>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer className="main-footer">
          <span>
            traininglog. <span>Votre progression, à votre rythme.</span>
          </span>
          <span>Conçu pour la prochaine séance.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={21} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Fichier de sauvegarde"
        onChange={(event) => {
          void importBackup(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <div className={`toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">
        {message && (
          <>
            <Check size={18} />
            <span>{message}</span>
            <button
              className="icon-button"
              onClick={() => setMessage('')}
              aria-label="Masquer le message"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
      {data && exerciseEditor && (
        <ExerciseEditor
          exercise={exerciseEditor === 'new' ? undefined : exerciseEditor}
          onClose={() => setExerciseEditor(undefined)}
          onSave={async (name, muscle) => {
            changed(
              await mutateData((current) => {
                if (
                  current.exercises.some(
                    (exercise) =>
                      exercise.id !== (exerciseEditor === 'new' ? undefined : exerciseEditor.id) &&
                      exercise.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'),
                  )
                )
                  throw new Error('Un exercice porte déjà ce nom.')
                if (exerciseEditor !== 'new') {
                  const saved = current.exercises.find(
                    (exercise) => exercise.id === exerciseEditor.id,
                  )
                  if (
                    !saved ||
                    saved.name !== exerciseEditor.name ||
                    saved.muscle !== exerciseEditor.muscle ||
                    saved.createdAt !== exerciseEditor.createdAt
                  )
                    throw new Error(
                      'Cet exercice a changé dans un autre onglet. Fermez ce formulaire et rouvrez l’exercice pour repartir des données à jour.',
                    )
                }
                const exercise =
                  exerciseEditor === 'new'
                    ? { id: crypto.randomUUID(), name, muscle, createdAt: new Date().toISOString() }
                    : { ...exerciseEditor, name, muscle }
                return {
                  ...current,
                  exercises:
                    exerciseEditor === 'new'
                      ? [...current.exercises, exercise]
                      : current.exercises.map((item) =>
                          item.id === exercise.id ? exercise : item,
                        ),
                }
              }),
              exerciseEditor === 'new' ? 'Exercice ajouté.' : 'Exercice modifié.',
            )
          }}
        />
      )}
      {data && entryEditor && (
        <EntryEditor
          exercises={data.exercises}
          entries={data.entries}
          initialExerciseId={entryEditor.exerciseId}
          entry={entryEditor.entry}
          onClose={() => setEntryEditor(undefined)}
          onSave={async (entry) => {
            changed(
              await mutateData((current) => {
                if (!current.exercises.some((exercise) => exercise.id === entry.exerciseId))
                  throw new Error('Cet exercice n’existe plus. Fermez puis rouvrez le formulaire.')
                if (entryEditor.entry) {
                  const saved = current.entries.find((item) => item.id === entry.id)
                  if (!saved || saved.updatedAt !== entryEditor.entry.updatedAt)
                    throw new Error(
                      'Cette performance a changé dans un autre onglet. Fermez ce formulaire et rouvrez la performance pour repartir des données à jour.',
                    )
                }
                return {
                  ...current,
                  entries: entryEditor.entry
                    ? current.entries.map((item) => (item.id === entry.id ? entry : item))
                    : [...current.entries, entry],
                }
              }),
              entryEditor.entry
                ? 'Performance modifiée.'
                : 'Performance enregistrée. Une série de mieux !',
            )
          }}
        />
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => setConfirmation(undefined)}
          busy={confirmBusy}
        >
          <p className="confirmation-text">{confirmation.text}</p>
          {confirmError && (
            <p className="error" role="alert">
              {confirmError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={confirmBusy}
              onClick={() => setConfirmation(undefined)}
            >
              Annuler
            </button>
            <button
              className={`button ${confirmation.danger ? 'danger' : 'primary'}`}
              disabled={confirmBusy}
              onClick={async () => {
                setConfirmBusy(true)
                setConfirmError('')
                try {
                  await confirmation.run()
                  setConfirmation(undefined)
                } catch (error) {
                  setConfirmError(
                    error instanceof Error
                      ? error.message
                      : 'L’opération a échoué. Vos données restent conservées.',
                  )
                } finally {
                  setConfirmBusy(false)
                }
              }}
            >
              {confirmBusy ? 'En cours…' : confirmation.action}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
