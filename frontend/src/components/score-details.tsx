import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { useScores } from '@/lib/queries'

export type Score = NonNullable<ReturnType<typeof useScores>['data']>[number]

const BAND_LABEL: Record<Score['band'], string> = {
  strong: 'Strong match',
  good: 'Good match',
  decent: 'Decent match',
  weak: 'Weak match',
}

const BAND_STYLE: Record<Score['band'], string> = {
  strong: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  good: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  decent: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  weak: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
}

const DIMENSIONS: Array<[keyof Score['dimensions'], string]> = [
  ['cvMatch', 'CV match'],
  ['trajectoryFit', 'Trajectory fit'],
  ['comp', 'Compensation'],
  ['culture', 'Culture'],
  ['redFlags', 'Red flags (5 = none)'],
]

const EVIDENCE_STYLE = {
  supported: 'text-emerald-700 dark:text-emerald-300',
  partial: 'text-amber-700 dark:text-amber-300',
  unknown: 'text-muted-foreground',
} as const

export function BandBadge({ band, className }: { band: Score['band']; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(BAND_STYLE[band], className)}>
      {BAND_LABEL[band]}
    </Badge>
  )
}

// One stored score: the verdict, the five dimensions with their evidence, and what to check
export function ScoreDetails({ score }: { score: Score }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-3xl font-semibold tabular-nums">{score.globalScore.toFixed(1)}</span>
        <span className="text-muted-foreground">/ 5</span>
        <BandBadge band={score.band} />
        <Badge variant="outline">Confidence: {score.confidence}</Badge>
      </div>
      <p className="text-muted-foreground">{score.recommendation}</p>

      <p>{score.summary}</p>

      {!score.postingComplete && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The job posting looked too short or incomplete to assess properly.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {DIMENSIONS.map(([key, label]) => {
          const dimension = score.dimensions[key]
          return (
            <li key={key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-40 shrink-0 font-medium">{label}</span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${dimension.score} out of 5`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(dimension.score / 5) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums">{dimension.score}/5</span>
              </div>
              <p className="text-muted-foreground">
                <span className={cn('font-medium', EVIDENCE_STYLE[dimension.evidence])}>
                  {dimension.evidence}
                </span>
                {' · '}
                {dimension.rationale}
              </p>
            </li>
          )
        })}
      </ul>

      {score.checks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-medium">Worth checking</span>
          <ul className="list-disc pl-5 text-muted-foreground">
            {score.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {score.promptVersion} · {score.model} · {new Date(score.createdAt).toLocaleString()}
      </p>
    </div>
  )
}
