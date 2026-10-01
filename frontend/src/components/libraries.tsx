import { DocumentLibrary } from '@/components/document-library'
import { api } from '@/lib/api'
import { useJobs, useResumes } from '@/lib/queries'

export function ResumeLibrary() {
  return (
    <DocumentLibrary
      title="CVs"
      noun="CV"
      queryKey="resumes"
      documents={useResumes()}
      add={(form) => api.resumes.$post({ form })}
      remove={(id) => api.resumes[':id'].$delete({ param: { id } })}
      className="max-h-44"
    />
  )
}

export function JobLibrary() {
  return (
    <DocumentLibrary
      title="Jobs"
      noun="job"
      queryKey="jobs"
      documents={useJobs()}
      add={(form) => api.jobs.$post({ form })}
      remove={(id) => api.jobs[':id'].$delete({ param: { id } })}
      className="max-h-44"
    />
  )
}
