import { Service } from '@volcengine/openapi';
import { env } from './env';
import { logError, logInfo } from './log';
import { TOOL_DEFINITIONS } from './toolDefs';

// One signed Service client for all RTC OpenAPI calls.
const rtc = new Service({
    host: 'rtc.volcengineapi.com',
    serviceName: 'rtc',
    region: env.VOLC_RTC_REGION,
    accessKeyId: env.VOLC_ACCESS_KEY_ID,
    secretKey: env.VOLC_SECRET_ACCESS_KEY,
});

async function call(action: string, body: Record<string, unknown>): Promise<any> {
    return await (rtc as any).fetchOpenAPI({
        Action: action,
        Version: env.VOLC_RTC_API_VERSION,
        method: 'POST',
        data: body,
    });
}

export interface StartVoiceChatParams {
    roomId: string;
    taskId: string;
    uid: string;
    agentUid: string;
    welcomeMessage: string;
    systemPrompt: string;
}

/**
 * Start the built-in (ArkV3) conversational agent in an RTC room.
 * Volcano runs ASR → Doubao (streaming) → bidirectional TTS server-side.
 * Function calls are declared via LLMConfig.Tools and — with no ServerMessageUrl —
 * delivered to the CLIENT over RTC binary messages for client-side execution.
 */
export async function startVoiceChat(params: StartVoiceChatParams): Promise<void> {
    const body = {
        AppId: env.VOLC_RTC_APP_ID,
        RoomId: params.roomId,
        TaskId: params.taskId,
        Config: {
            ASRConfig: {
                Provider: 'volcano',
                ProviderParams: {
                    Mode: 'bigmodel',
                    ApiResourceId: env.VOLC_ASR_RESOURCE_ID,
                    StreamMode: env.VOLC_ASR_STREAM_MODE,
                    VolcanoASRParameters: '{"request":{"enable_nonstream":true}}',
                },
                VADConfig: { SilenceTime: env.VOLC_ASR_SILENCE_MS },
            },
            LLMConfig: {
                Mode: 'ArkV3',
                ModelName: env.DOUBAO_MODEL,
                SystemMessages: [params.systemPrompt],
                ThinkingType: env.LLM_THINKING_TYPE,
                HistoryLength: env.LLM_HISTORY_LENGTH,
                Temperature: env.LLM_TEMPERATURE,
                TopP: env.LLM_TOP_P,
                MaxTokens: env.LLM_MAX_TOKENS,
                Tools: TOOL_DEFINITIONS,
            },
            TTSConfig: {
                Provider: 'volcano_bidirection',
                ProviderParams: {
                    Credential: { ResourceId: env.VOLC_AGENT_TTS_RESOURCE_ID },
                    VolcanoTTSParameters: JSON.stringify({
                        req_params: { speaker: env.VOLC_TTS_VOICE },
                    }),
                },
            },
            InterruptMode: 0,
            SubtitleConfig: { DisableRTSSubtitle: false, SubtitleMode: 1 },
            // No ServerMessageUrl → function calls are delivered to the client.
            FunctionCallingConfig: {},
        },
        AgentConfig: {
            UserId: params.agentUid,
            TargetUserId: [params.uid],
            WelcomeMessage: params.welcomeMessage,
            EnableConversationStateCallback: true,
        },
    };

    const res = await call('StartVoiceChat', body);
    if (res?.ResponseMetadata?.Error) {
        logError('StartVoiceChat returned error', res.ResponseMetadata.Error);
        throw new Error(`StartVoiceChat failed: ${JSON.stringify(res.ResponseMetadata.Error)}`);
    }
    logInfo('StartVoiceChat ok', { roomId: params.roomId, taskId: params.taskId });
}

export async function stopVoiceChat(roomId: string, taskId: string): Promise<void> {
    try {
        await call('StopVoiceChat', {
            AppId: env.VOLC_RTC_APP_ID,
            RoomId: roomId,
            TaskId: taskId,
        });
        logInfo('StopVoiceChat ok', { roomId, taskId });
    } catch (error) {
        logError('StopVoiceChat failed', { roomId, taskId, error });
    }
}
