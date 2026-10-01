import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: async () => {
      const res = await api.resumes.$get()
      if (!res.ok) throw new Error('Failed to load CVs')
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
