import { z } from 'zod'

// Zod schemas shared by several routes

// Body of the rename (PATCH) routes for chats, resumes and jobs
export const RenameSchema = z.object({
  name: z.string().trim().min(1).max(200).meta({ example: 'Backend engineer at Acme' }),
})
