// Zod Schemas for Tool Validation

import { z } from 'zod';

export const CreateBriefingSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters').max(100, 'Topic too long'),
  description: z.string().max(500, 'Description too long').optional(),
});

export const GetBriefingsSchema = z.object({
  limit: z.number().int().positive().max(50).optional().default(10),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const GetBriefingConfigSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
});

export const UpdateBriefingSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
  settings: z.object({
    schedule: z.enum(['daily', 'weekly', 'monthly']).optional(),
    sources: z.array(z.string().url('Invalid source URL')).optional(),
    categories: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }),
});

export const GetEditionsSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
  limit: z.number().int().positive().max(30).optional().default(10),
});

export const GetEditionContentSchema = z.object({
  editionId: z.string().uuid('Invalid edition ID'),
});

export const SuggestSourcesSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters').max(100),
  limit: z.number().int().positive().max(20).optional().default(5),
});

export const DeleteBriefingSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
});
