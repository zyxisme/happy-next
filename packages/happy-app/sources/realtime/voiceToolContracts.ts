import { z } from 'zod';

export const messageHappyCodeParametersSchema = z.object({
    message: z.string().min(1, 'Message cannot be empty'),
});

export const processPermissionRequestParametersSchema = z.object({
    decision: z.enum(['allow', 'deny']),
});

export const listSessionsParametersSchema = z.object({
    includeOffline: z.boolean().optional(),
});

export const switchSessionParametersSchema = z.object({
    sessionId: z.string().min(1).optional(),
});

export const changeSessionSettingsParametersSchema = z.object({
    mode: z.string(),
});

export const getLatestAssistantReplyParametersSchema = z.object({
    maxChars: z.number().int().positive().max(2000).optional(),
});

export const deleteSessionParametersSchema = z.object({
    sessionId: z.string().min(1).optional(),
});
