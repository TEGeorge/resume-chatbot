import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { BandBadge, ScoreDetails, type Score } from '@/components/score-details'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { api, errorMessage } from '@/lib/api'
import { useScores } from '@/lib/queries'

interface Props {
  resumeId: string
  jobs: Array<{ id: string; name: string }>
}

// One chip per job in the chat: score it, see its latest score, open the full breakdown
export function JobScores({ resumeId, jobs }: Props) {
  const queryClient = useQueryClient()
  const scores = useScores(resumeId)
  const [openJobId, setOpenJobId] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.scores.$post({ json: { resumeId, jobId } })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not score this job'))
      return res.json()
    },
    onSuccess: async (_score, jobId) => {
      await queryClient.invalidateQueries({ queryKey: ['scores', resumeId] })
      setOpenJobId(jobId)
    },
  })

  // newest first, so the first match for a job is its latest run
  const runsFor = (jobId: string): Score[] => (scores.data ?? []).filter((s) => s.jobId === jobId)

  const openJob = jobs.find((j) => j.id === openJobId)
  const openRuns = openJobId ? runsFor(openJobId) : []
  const scoringJobId = run.isPending ? run.variables : undefined

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <div className="flex flex-wrap gap-2">
        {jobs.map((job, index) => {
          const latest = runsFor(job.id)[0]
          const scoring = scoringJobId === job.id
          const label = `Job #${index + 1}: ${job.name}`

          if (scoring) {
            return (
              <Button key={job.id} variant="outline" size="sm" disabled>
                <Spinner /> Scoring {label}…
              </Button>
            )
          }
          if (!latest) {
            return (
              <Button
                key={job.id}
                variant="outline"
                size="sm"
                disabled={run.isPending}
                onClick={() => run.mutate(job.id)}
              >
                Score {label}
              </Button>
            )
          }
          return (
            <Button
              key={job.id}
              variant="secondary"
              size="sm"
              onClick={() => setOpenJobId(job.id)}
              aria-label={`${label}, scored ${latest.globalScore.toFixed(1)}, view details`}
            >
              <span className="max-w-48 truncate">{label}</span>
              <span className="font-semibold tabular-nums">{latest.globalScore.toFixed(1)}</span>
              <BandBadge band={latest.band} />
            </Button>
          )
        })}
      </div>

      {run.isError && <p className="text-xs text-destructive">{run.error.message}</p>}
      {scores.isError && <p className="text-xs text-destructive">Could not load scores.</p>}

      <Dialog open={!!openJob} onOpenChange={(open) => !open && setOpenJobId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{openJob?.name}</DialogTitle>
            <DialogDescription>
              Scored against {openRuns[0]?.resumeName ?? 'this chat’s CV'}
            </DialogDescription>
          </DialogHeader>

          {openRuns[0] && <ScoreDetails score={openRuns[0]} />}

          {openRuns.length > 1 && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <span className="font-medium">Earlier runs</span>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {openRuns.slice(1).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{new Date(s.createdAt).toLocaleString()}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {s.globalScore.toFixed(1)}
                    </span>
                    <Badge variant="outline">{s.promptVersion}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.isError && <p className="text-sm text-destructive">{run.error.message}</p>}

          <Button
            variant="outline"
            disabled={run.isPending}
            onClick={() => openJobId && run.mutate(openJobId)}
          >
            {run.isPending ? (
              <>
                <Spinner /> Scoring…
              </>
            ) : (
              'Score again'
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
