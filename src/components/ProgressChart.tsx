import type { WorkoutEntry } from '../domain'
import { maxWeight, sortEntries } from '../domain'
import { dateLabel, number } from '../format'

export function ProgressChart({ entries }: { entries: WorkoutEntry[] }) {
  const points = sortEntries(entries).reverse().slice(-12)
  if (points.length < 2)
    return (
      <div className="chart-empty">
        <span className="chart-empty-line">↗</span>
        <p>La progression commence ici.</p>
        <span>Enregistrez deux performances pour voir évoluer votre charge maximale.</span>
      </div>
    )
  const weights = points.map(maxWeight)
  const max = Math.max(...weights, 1)
  const coords = points.map((entry, i) => ({
    x: 44 + (i * 510) / (points.length - 1),
    y: 152 - (maxWeight(entry) / max) * 116,
  }))
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ')
  return (
    <figure className="progress-chart">
      <svg viewBox="0 0 580 195" role="img" aria-labelledby="chart-title chart-description">
        <title id="chart-title">Évolution de la charge maximale par performance</title>
        <desc id="chart-description">
          {points
            .map((entry) => `${dateLabel(entry.date)} : ${number(maxWeight(entry))} kilogrammes`)
            .join('. ')}
        </desc>
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              x1="44"
              x2="554"
              y1={152 - tick * 116}
              y2={152 - tick * 116}
              stroke="currentColor"
              opacity=".12"
            />
            <text
              x="34"
              y={156 - tick * 116}
              textAnchor="end"
              fill="currentColor"
              fontSize="11"
              opacity=".6"
            >
              {number(max * tick)}
            </text>
          </g>
        ))}
        <polygon points={`44,152 ${line} 554,152`} fill="var(--lime)" opacity=".07" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--lime)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {coords.map((point, i) => (
          <circle key={points[i].id} cx={point.x} cy={point.y} r="4" fill="var(--lime)" />
        ))}
        <text x="44" y="182" fill="currentColor" fontSize="11" opacity=".65">
          {dateLabel(points[0].date)}
        </text>
        <text x="554" y="182" fill="currentColor" fontSize="11" textAnchor="end" opacity=".65">
          {dateLabel(points.at(-1)!.date)}
        </text>
      </svg>
      <figcaption>
        Charge maximale en kg · {points.length} dernières performances · points espacés par
        performance
      </figcaption>
    </figure>
  )
}
