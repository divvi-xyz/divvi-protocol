import { z } from 'zod'

const DivviGcloudProject = z.enum(['divvi-staging', 'divvi-production'])
export type DivviGcloudProject = z.infer<typeof DivviGcloudProject>

// Shared config schema for all endpoints
export const sharedConfigSchema = z.object({
  GCLOUD_PROJECT: DivviGcloudProject,
})

export type SharedConfig = z.infer<typeof sharedConfigSchema>
