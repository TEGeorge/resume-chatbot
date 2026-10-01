import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: async () => {
      const res = await api.resumes.$get()
      if (!res.ok) throw new Error('Failed to load resumes')
      return res.json()
    },
  })
}

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.jobs.$get()
      if (!res.ok) throw new Error('Failed to load jobs')
      return res.json()
    },
  })
}

// Stored scores for a resume (all its jobs), newest first
export function useScores(resumeId: string) {
  return useQuery({
    queryKey: ['scores', resumeId],
    queryFn: async () => {
      const res = await api.scores.$get({ query: { resumeId } })
      if (!res.ok) throw new Error('Failed to load scores')
      return res.json()
    },
  })
}

// Chats, newest first. Components read this with useQuery so they update when it changes.
export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await api.chat.$get()
      if (!res.ok) throw new Error('Failed to load chats')
      return res.json()
    },
  })
}

// The full extracted text of a resume or job, loaded only when `enabled` (for the preview dialog)
export function useDocumentText(kind: 'resumes' | 'jobs', id: string, enabled: boolean) {
  return useQuery({
    queryKey: [kind, id, 'text'],
    enabled,
    queryFn: async () => {
      const res =
        kind === 'resumes'
          ? await api.resumes[':id'].$get({ param: { id } })
          : await api.jobs[':id'].$get({ param: { id } })
      if (!res.ok) throw new Error('Could not load the text')
      return (await res.json()) as { name: string; text: string }
    },
  })
}
