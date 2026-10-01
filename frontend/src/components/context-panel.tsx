import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, FileTextIcon } from 'lucide-react'
import { useState } from 'react'
import { DocumentPreview } from '@/components/document-preview'
import { BandBadge, ScoreDetails, type Score } from '@/components/score-details'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { api, errorMessage } from '@/lib/api'
import { useScores } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface Props {
  resumeId: string
  resumeName: string
  jobs: Array<{ id: string; name: string }>
}

// What the chat is about: the resume, and each job with its score
export function ContextPanel({ resumeId, resumeName, jobs }: Props) {
  const queryClient = useQueryClient()
  const scores = useScores(resumeId)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.scores.$post({ json: { resumeId, jobId } })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not score this job'))
      return res.json()
    },
    onSuccess: async (_score, jobId) => {
      await queryClient.invalidateQueries({ queryKey: ['scores', resumeId] })
      setExpandedJobId(jobId)
    },
  })

  // newest first, so the first match for a job is its latest run
  const runsFor = (jobId: string): Score[] => (scores.data ?? []).filter((s) => s.jobId === jobId)
  const scoringJobId = run.isPending ? run.variables : undefined

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Resume</h2>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileTextIcon className="size-4" />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{resumeName}</span>
          <DocumentPreview kind="resumes" id={resumeId} name={resumeName} label="View" />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Jobs and scores</h2>
        <ul className="flex flex-col gap-2">
          {jobs.map((job, index) => {
            const runs = runsFor(job.id)
            const latest = runs[0]
            const scoring = scoringJobId === job.id
            const expanded = expandedJobId === job.id && !!latest

            return (
              <li key={job.id} className="rounded-xl border bg-card">
                <div className="flex items-center gap-2 p-3">
                  <Badge variant="outline" className="shrink-0">
                    #{index + 1}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={job.name}>
                    {job.name}
                  </span>

                  {scoring ? (
                    <Button variant="outline" size="sm" disabled>
                      <Spinner /> Scoring…
                    </Button>
                  ) : latest ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`Job ${index + 1} scored ${latest.globalScore.toFixed(1)}, ${expanded ? 'hide' : 'show'} details`}
                      onClick={() => setExpandedJobId(expanded ? null : job.id)}
                      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold tabular-nums">{latest.globalScore.toFixed(1)}</span>
                      <ChevronDownIcon
                        className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                      />
                    </button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate(job.id)}>
                      Score
                    </Button>
                  )}
                </div>

                {latest && !expanded && (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <BandBadge band={latest.band} />
                    <span className="text-xs text-muted-foreground">Confidence: {latest.confidence}</span>
                  </div>
                )}

                {expanded && latest && (
                  <div className="flex flex-col gap-4 border-t p-3">
                    <ScoreDetails score={latest} />

                    {runs.length > 1 && (
                      <div className="flex flex-col gap-1 border-t pt-3 text-sm">
                        <span className="font-medium">Earlier runs</span>
                        <ul className="flex flex-col gap-1 text-muted-foreground">
                          {runs.slice(1).map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold tabular-nums text-foreground">
                                {s.globalScore.toFixed(1)}
                              </span>
                              <span>{new Date(s.createdAt).toLocaleString()}</span>
                              <Badge variant="outline">{s.promptVersion}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate(job.id)}>
                      Score again
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {run.isError && <p className="mt-2 text-sm text-destructive">{run.error.message}</p>}
        {scores.isError && <p className="mt-2 text-sm text-destructive">Could not load scores.</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          A score rates the job against your resume from 1 to 5. Ask in the chat about “Job #1” or “Job #2” to talk about a specific
          job.
        </p>
      </section>
    </div>
  )
}
