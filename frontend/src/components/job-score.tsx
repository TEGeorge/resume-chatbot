import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

type JobScoreData = InferResponseType<typeof api.scores.$get, 200>
type ScoreResult = JobScoreData['result']

const VERDICTS: Record<ScoreResult['verdict'], string> = {
  strong: 'Strong match, apply now',
  apply: 'Good match, worth applying',
  maybe: 'Decent, apply only with a specific reason',
  skip: 'Recommend against applying',
}

const MATCH_LABELS: Record<ScoreResult['requirements'][number]['match'], string> = {
  strong: '✅ Strong',
  partial: '⚠️ Partial',
  missing: '❌ Missing',
  'n/a': '➖ N/A',
}

const scoreColor = (score: number) =>
  score >= 4 ? 'text-green-600 dark:text-green-400' : score >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'

// One job in the chat header: its number, name and fit score. Scoring runs on demand.
export function JobScore({
  resumeId,
  job,
  number,
}: {
  resumeId: string | null
  job: { id: string; name: string; score: number | null }
  number: number
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const queryKey = ['score', resumeId, job.id]

  const details = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.scores.$get({ query: { resumeId: resumeId!, jobId: job.id } })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not load the score'))
      return res.json()
    },
    enabled: open && resumeId !== null && job.score !== null,
  })

  const score = useMutation({
    mutationFn: async (refresh: boolean) => {
      const res = await api.scores.$post({ json: { resumeId: resumeId!, jobId: job.id, refresh } })
      if (!res.ok) throw new Error(await errorMessage(res, 'Scoring failed'))
      return res.json()
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKey, data)
      setOpen(true)
      await queryClient.invalidateQueries({ queryKey: ['chats'] })
    },
  })

  const label = `Job #${number}: ${job.name}`
  // chats from before CVs existed cannot be scored
  if (!resumeId) return <span className="text-sm text-muted-foreground">{label}</span>

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={score.isPending}
        title={score.error?.message}
        onClick={() => (job.score === null ? score.mutate(false) : setOpen(true))}
      >
        <span className="max-w-48 truncate">{label}</span>
        {score.isPending ? (
          <Spinner />
        ) : job.score === null ? (
          <span className={cn('text-muted-foreground', score.isError && 'text-destructive')}>
            {score.isError ? 'Retry score' : 'Score'}
          </span>
        ) : (
          <span className={cn('font-semibold', scoreColor(job.score))}>{job.score.toFixed(1)}</span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Fit score for your CV, judged by the model against this job's requirements.
            </DialogDescription>
          </DialogHeader>
          {details.data ? (
            <ScoreDetails result={details.data.result} />
          ) : details.isError ? (
            <p className="text-sm text-destructive">{details.error.message}</p>
          ) : (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          <DialogFooter>
            {score.isError && <p className="mr-auto text-sm text-destructive">{score.error.message}</p>}
            <Button variant="outline" disabled={score.isPending} onClick={() => score.mutate(true)}>
              {score.isPending ? <Spinner /> : <RefreshCwIcon />}
              Score again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ScoreDetails({ result }: { result: ScoreResult }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-baseline gap-3">
        <span className={cn('text-3xl font-semibold', scoreColor(result.score))}>
          {result.score.toFixed(1)}
        </span>
        <span className="text-muted-foreground">/ 5</span>
        <span className="font-medium">{VERDICTS[result.verdict]}</span>
        <span className="ml-auto text-muted-foreground">Confidence: {result.confidence}</span>
      </div>
      <p>{result.summary}</p>
      <p className="text-muted-foreground">{result.level}</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Requirement</th>
              <th className="py-1 pr-3 font-medium">Importance</th>
              <th className="py-1 pr-3 font-medium">Match</th>
              <th className="py-1 font-medium">Evidence / gap</th>
            </tr>
          </thead>
          <tbody>
            {result.requirements.map((r, i) => (
              <tr key={i} className="border-b align-top last:border-0">
                <td className="py-1.5 pr-3">
                  {r.requirement}
                  {r.jdQuote && r.tier === 'stated' && (
                    <div className="text-xs text-muted-foreground">“{r.jdQuote}”</div>
                  )}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {r.importance.replace('_', ' ')}{' '}
                  <span className="text-xs text-muted-foreground">({r.tier})</span>
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{MATCH_LABELS[r.match]}</td>
                <td className="py-1.5">
                  {r.cvEvidence ? `“${r.cvEvidence}”` : r.gap ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.gaps.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Gaps to prepare for</h3>
          {result.gaps.map((g, i) => (
            <div key={i}>
              <div className="font-medium">{g.requirement}</div>
              <div>Risk: {g.risk}</div>
              <div>Mitigation: {g.mitigation}</div>
            </div>
          ))}
        </div>
      )}

      {result.confidenceGaps.length > 0 && (
        <div>
          <h3 className="font-medium">Could change the score</h3>
          <ul className="list-disc pl-5">
            {result.confidenceGaps.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
