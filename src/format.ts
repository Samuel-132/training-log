import type { WorkoutEntry } from './domain'

export const number = (value: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)
export function dateLabel(date: string, full = false): string {
  const [year, month, day] = date.split('-').map(Number)
  const civilDate = new Date(0)
  civilDate.setFullYear(year, month - 1, day)
  civilDate.setHours(12, 0, 0, 0)
  return new Intl.DateTimeFormat(
    'fr-FR',
    full
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(civilDate)
}
export function setsLabel(entry: WorkoutEntry) {
  return entry.sets.map((set) => `${set.reps} × ${number(set.weight)} kg`).join(' · ')
}
