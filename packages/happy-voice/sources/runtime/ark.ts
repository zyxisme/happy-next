import { env } from './env';

const CLEAN_SYSTEM = `你是文本朗读清洗器。把用户给的文本改写成适合 TTS 朗读的纯口语文本：
- 去掉 markdown 标记、代码块、行内代码、URL、表情符号、多余的符号。
- 保留原意和关键信息，不要总结、不要补充、不要加任何解释或前后缀。
- 涉及代码或命令时，用简短口语描述代替，不要逐字念符号。
直接输出清洗后的文本本身，不要任何标签或格式。`;

/**
 * Stream cleaned, TTS-friendly text from Ark (Doubao). Calls onDelta for each
 * content piece as it arrives so the caller can synthesize sentence-by-sentence.
 */
export async function streamCleanForSpeech(
    text: string,
    onDelta: (piece: string) => void | Promise<void>,
    signal: AbortSignal,
): Promise<void> {
    if (!env.ARK_API_KEY) throw new Error('ARK_API_KEY not set');
    const res = await fetch(`${env.ARK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ARK_API_KEY}`,
        },
        body: JSON.stringify({
            model: env.TTS_CLEAN_MODEL,
            stream: true,
            thinking: { type: 'disabled' },
            temperature: 0.1,
            messages: [
                { role: 'system', content: CLEAN_SYSTEM },
                { role: 'user', content: text },
            ],
        }),
        signal,
    });
    if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '');
        throw new Error(`Ark clean ${res.status}: ${t.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') return;
            try {
                const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
                if (piece) await onDelta(piece);
            } catch {
                // ignore keep-alive / partial lines
            }
        }
    }
}

/** Non-streaming LLM clean: accumulates the streamed deltas into the full text. */
export async function cleanForSpeechOnce(text: string, signal: AbortSignal): Promise<string> {
    let out = '';
    await streamCleanForSpeech(text, (piece) => { out += piece; }, signal);
    return out.trim();
}

/** Regex-only TTS cleanup — instant fallback when the LLM is unavailable. */
export function regexCleanForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[*#_>~|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
