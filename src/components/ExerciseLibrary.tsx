import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  Flame,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react'
import type { TrainingData } from '../domain'
import { localDate, maxWeight, sortEntries, volume } from '../domain'
import { dateLabel, number, setsLabel } from '../format'

interface ExerciseLibraryProps {
  data: TrainingData
  onAddEntry: () => void
  onAddExercise: () => void
  onSelectExercise: (id: string) => void
}

export function ExerciseLibrary({
  data,
  onAddEntry,
  onAddExercise,
  onSelectExercise,
}: ExerciseLibraryProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tous')
  const entries = sortEntries(data.entries)
  const groups = [...new Set(data.exercises.map((exercise) => exercise.muscle))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  )
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
  const filteredExercises = data.exercises.filter(
    (exercise) => (filter === 'Tous' || exercise.muscle === filter) && matchesQuery(exercise.name),
  )
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekEntries = entries.filter(
    (entry) => entry.date >= localDate(weekStart) && entry.date <= localDate(),
  )
  const weeklySessions = new Set(weekEntries.map((entry) => entry.date)).size

  return (
    <>
      <section className="welcome">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" /> VOTRE PROCHAINE PROGRESSION COMMENCE ICI
          </div>
          <h1>
            Une série de <em>mieux.</em>
          </h1>
          <p>
            Retrouvez vos dernières performances.
            <br className="mobile-only" /> Faites le prochain pas.
          </p>
        </div>
        <button className="button primary" disabled={!data.exercises.length} onClick={onAddEntry}>
          <Plus size={19} /> Ajouter une performance
        </button>
      </section>

      <section className="stats-grid" aria-label="Votre activité">
        <div className="stat">
          <div className="stat-label">
            <CalendarDays size={17} /> Jours d’entraînement
          </div>
          <div className="stat-value">
            {String(weeklySessions).padStart(2, '0')}
            <span>cette semaine</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <Dumbbell size={18} /> Séries réalisées
          </div>
          <div className="stat-value">
            {String(weekEntries.reduce((sum, entry) => sum + entry.sets.length, 0)).padStart(
              2,
              '0',
            )}
            <span>cette semaine</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <Flame size={17} /> Volume soulevé
          </div>
          <div className="stat-value">
            {number(weekEntries.reduce((sum, entry) => sum + volume(entry), 0))}
            <span>kg cette semaine</span>
          </div>
        </div>
      </section>

      <section className="exercise-library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">VOTRE RÉPERTOIRE</span>
            <h2>
              Mes exercices <span className="count">{data.exercises.length}</span>
            </h2>
          </div>
          <button className="button secondary" onClick={onAddExercise}>
            <Plus size={17} /> Nouvel exercice
          </button>
        </div>
        <div className="library-tools">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Rechercher un exercice"
              placeholder="Rechercher un exercice…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="results-count">
            {filteredExercises.length} exercice{filteredExercises.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="filters" role="group" aria-label="Filtrer par groupe musculaire">
          {['Tous', ...groups].map((group) => (
            <button
              key={group}
              aria-pressed={filter === group}
              className={filter === group ? 'selected' : ''}
              onClick={() => setFilter(group)}
            >
              {group}
            </button>
          ))}
        </div>
        <div className="exercise-grid">
          {filteredExercises.map((exercise) => {
            const last = entries.find((entry) => entry.exerciseId === exercise.id)
            return (
              <button
                key={exercise.id}
                className="exercise-card"
                onClick={() => {
                  onSelectExercise(exercise.id)
                  window.scrollTo(0, 0)
                }}
              >
                <div className="exercise-card-top">
                  <span className={`muscle-icon muscle-${groups.indexOf(exercise.muscle) % 4}`}>
                    <Dumbbell size={22} strokeWidth={1.6} />
                  </span>
                  <ArrowUpRight size={19} className="card-arrow" />
                </div>
                <span className="muscle-tag">{exercise.muscle}</span>
                <h3>{exercise.name}</h3>
                <div className="exercise-last">
                  <span>
                    {last
                      ? `Dernière séance · ${dateLabel(last.date)}`
                      : 'Votre première séance vous attend'}
                  </span>
                  {last ? (
                    <>
                      <strong>
                        {number(maxWeight(last))} <small>kg max.</small>
                        <span className="card-divider" />
                        {last.sets.length} <small>séries</small>
                      </strong>
                      <span className="set-preview">{setsLabel(last)}</span>
                    </>
                  ) : (
                    <strong className="start-recording">
                      Ajouter une performance <ArrowRight size={16} />
                    </strong>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {!filteredExercises.length && (
          <div className="empty-state">
            <Search size={28} />
            <h3>{data.exercises.length ? 'Aucun exercice trouvé' : 'Votre carnet commence ici'}</h3>
            <p>
              {data.exercises.length
                ? 'Essayez un autre nom ou groupe musculaire.'
                : 'Ajoutez un exercice pour enregistrer votre première performance.'}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                if (data.exercises.length) {
                  setQuery('')
                  setFilter('Tous')
                } else onAddExercise()
              }}
            >
              {data.exercises.length ? 'Effacer les filtres' : 'Créer mon premier exercice'}
            </button>
          </div>
        )}
      </section>
      <div className="bottom-note">
        <ShieldCheck size={15} /> Vos performances restent sur cet appareil. Pensez à les
        sauvegarder.
      </div>
    </>
  )
}
