/**
 * One-shot generator: reads the raw Volcano voice catalog (tmp/voices.json at the
 * repo root) and emits sources/constants/Voices.ts containing only the
 * seed-tts-2.0 voices (newer, multilingual, matching the live agent TTS resource).
 *
 * Run: npx tsx packages/happy-app/sources/scripts/genVoices.ts
 *
 * The source JSON lives in gitignored tmp/, so this script is kept only as a
 * reproducible record; the generated Voices.ts is what gets committed. English
 * names/descriptions are hand-maintained in EN below (the catalog is Chinese-only)
 * and surfaced via getVoiceName/getVoiceDescription based on the current locale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(REPO_ROOT, 'tmp', 'voices.json');
const OUT = join(__dirname, '..', 'constants', 'Voices.ts');

const RESOURCE = 'seed-tts-2.0';

interface RawSpeaker {
    VoiceType: string;
    ResourceID: string;
    Name: string;
    Avatar: string;
    TrialURL: string;
    Gender: string;
    Description: string;
    Languages?: { Language?: string; Flag?: string }[];
}

// English name/description per voiceType (catalog is Chinese-only).
const EN: Record<string, { name: string; description: string }> = {
    zh_female_vv_uranus_bigtts: { name: 'Vivi 2.0', description: 'A soothing female voice — steady tone, soft articulation, naturally calming.' },
    zh_female_xiaohe_uranus_bigtts: { name: 'Xiaohe 2.0', description: 'A sweet, energetic younger sister — lively, cheerful and bright.' },
    zh_male_wennuanahu_uranus_bigtts: { name: 'Alvin 2.0', description: 'A warm, sunny youth voice — friendly and full of energy.' },
    zh_female_wenroumama_uranus_bigtts: { name: 'Gentle Mom 2.0', description: 'A soothing motherly voice — slow, mellow and tender.' },
    zh_female_qiaopinv_uranus_bigtts: { name: 'Playful Girl 2.0', description: 'A lively, spirited girl voice — quirky and full of energy.' },
    zh_male_guanggaojieshuo_uranus_bigtts: { name: 'Ad Narrator 2.0', description: 'A bright, highly engaging professional narration voice.' },
    zh_male_tiancaitongsheng_uranus_bigtts: { name: 'Prodigy Kid 2.0', description: 'A clear, youthful child voice — bright and gifted.' },
    zh_female_wenrouxiaoya_uranus_bigtts: { name: 'Gentle Yaya 2.0', description: 'A soft, graceful lady voice — gentle and serene.' },
    zh_female_roumeinvyou_uranus_bigtts: { name: 'Sweet Girlfriend 2.0', description: 'A soft, tender voice — caring and soothing like a girlfriend.' },
    zh_male_wenrouxiaoge_uranus_bigtts: { name: 'Gentle Guy 2.0', description: 'A gentle young man voice — clean and modest.' },
    zh_female_tianmeiyueyue_uranus_bigtts: { name: 'Sweet Yueyue 2.0', description: 'A sweet, soft and playful voice full of energy.' },
    zh_female_qingchezizi_uranus_bigtts: { name: 'Clear Zizi 2.0', description: 'A clear, clean and gentle youthful voice — pure in tone.' },
    zh_male_yangguangqingnian_uranus_bigtts: { name: 'Sunny Youth 2.0', description: 'A sunny, cheerful young man voice full of energy.' },
    zh_male_yuanboxiaoshu_uranus_bigtts: { name: 'Worldly Uncle 2.0', description: 'A steady, even-toned mature voice with a sense of experience.' },
    zh_male_qingshuangnanda_uranus_bigtts: { name: 'Fresh Campus Guy 2.0', description: 'A clean, refreshing and sunny college-student voice.' },
    zh_female_zhixingnv_uranus_bigtts: { name: 'Intellectual Woman 2.0', description: 'A composed, clear mature female voice with an intellectual air.' },
    zh_female_wenjingmaomao_uranus_bigtts: { name: 'Quiet Maomao 2.0', description: 'A soft, sweet and quiet little-girl voice.' },
    zh_male_kailangxuezhang_uranus_bigtts: { name: 'Cheerful Senior 2.0', description: 'A sunny, hearty senior-schoolmate voice.' },
    zh_male_kuailexiaodong_uranus_bigtts: { name: 'Happy Xiaodong 2.0', description: 'A bright, sunny young man voice full of energy.' },
    zh_female_qinqienv_uranus_bigtts: { name: 'Friendly Woman 2.0', description: 'A gentle, warm voice — soothing like family.' },
    zh_female_sophie_uranus_bigtts: { name: 'Charming Sophie 2.0', description: 'An aloof, elegant lady — distant on the surface, tender within.' },
    zh_female_chanmeinv_uranus_bigtts: { name: 'Flattering Woman 2.0', description: 'A soft, ingratiating female voice.' },
    zh_male_kailangdidi_uranus_bigtts: { name: 'Cheerful Little Brother 2.0', description: 'A sunny, lively boy voice — warm and friendly like the kid next door.' },
    zh_female_jiaochuannv_uranus_bigtts: { name: 'Breathy Woman 2.0', description: 'A soft, tender voice with an intimate, atmospheric tone.' },
    zh_female_mengyatou_uranus_bigtts: { name: 'Cutey 2.0', description: 'A soft, sweet and playful little-girl voice full of energy.' },
    zh_female_gaolengyujie_uranus_bigtts: { name: 'Cool Lady 2.0', description: 'A cool, aloof and commanding mature-woman voice — calm and capable.' },
    zh_female_kailangjiejie_uranus_bigtts: { name: 'Cheerful Big Sister 2.0', description: 'A bright, hearty and sunny big-sister voice.' },
    zh_male_liangsangmengzai_uranus_bigtts: { name: 'Bright Kiddo 2.0', description: 'A clear, youthful child voice — lively and cheerful.' },
    zh_male_cixingjieshuonan_uranus_bigtts: { name: 'Morgan 2.0', description: 'A magnetic, deep and steady professional male narration voice.' },
    zh_female_jitangmei_uranus_bigtts: { name: 'Hope 2.0', description: 'A warm, healing voice full of positive energy.' },
    zh_female_tiexinnvsheng_uranus_bigtts: { name: 'Candy 2.0', description: 'A gentle, friendly voice — caring like a close friend.' },
    zh_male_huolixiaoge_uranus_bigtts: { name: 'Lively Guy 2.0', description: 'A brisk, sunny young man voice full of energy.' },
    zh_female_wenroushunv_uranus_bigtts: { name: 'Gentle Lady 2.0', description: 'A soft, graceful lady voice with a refined, well-bred warmth.' },
    zh_male_fanjuanqingnian_uranus_bigtts: { name: 'Easygoing Youth 2.0', description: 'A relaxed, laid-back youth voice — chill and carefree.' },
    zh_male_lanyinmianbao_uranus_bigtts: { name: 'Lazy Mianbao 2.0', description: 'A lazy, soft and cottony child voice.' },
    zh_female_popo_uranus_bigtts: { name: 'Granny 2.0', description: 'A mellow, kindly elder-woman voice with a sense of years.' },
    zh_male_naiqimengwa_uranus_bigtts: { name: 'Babyish Toddler 2.0', description: 'A soft, sweet and babyish toddler voice — adorable and cute.' },
    zh_male_linjiananhai_uranus_bigtts: { name: 'Boy Next Door 2.0', description: 'A clean, refreshing, friendly and sunny boy voice.' },
    zh_female_linjianvhai_uranus_bigtts: { name: 'Girl Next Door 2.0', description: 'A soft, gentle girl next door — understated, patient and warm.' },
    zh_male_shaonianzixin_uranus_bigtts: { name: 'Brayan 2.0', description: 'A fresh, youthful boy voice — gentle, friendly and sunny.' },
    zh_male_liufei_uranus_bigtts: { name: 'Liu Fei 2.0', description: 'A clear-thinking, rational and steady male voice.' },
    zh_female_meilinvyou_uranus_bigtts: { name: 'Charming Girlfriend 2.0', description: 'A sexy, alluring mature woman — charming and full of allure.' },
    zh_female_shuangkuaisisi_uranus_bigtts: { name: 'Easygoing Sisi 2.0', description: 'A warm, straightforward girl next door — sunny, friendly and easy to be with.' },
    zh_female_tianmeitaozi_uranus_bigtts: { name: 'Sweet Taozi 2.0', description: 'A playful, energetic girl — cheerful, outgoing and infectious.' },
    zh_female_qingxinnvsheng_uranus_bigtts: { name: 'Fresh Woman 2.0', description: 'A standout qipao beauty and career elite — bright, gracious and charming.' },
    zh_male_taocheng_uranus_bigtts: { name: 'Xiaotian 2.0', description: 'A clear-faced college guy — pure, gentle, spirited, cheerful and sincere.' },
    zh_male_m191_uranus_bigtts: { name: 'Yunzhou 2.0', description: 'A magnetic male voice — mature, rational, methodical and trustworthy.' },
    zh_female_tianmeixiaoyuan_uranus_bigtts: { name: 'Sweet Xiaoyuan 2.0', description: 'A bright, sweet professional customer-service voice — friendly, patient and attentive.' },
    saturn_zh_female_wenrouwenya_tob: { name: 'Gentle & Refined 2.0', description: 'A refined classical-style lady — gentle and graceful in every gesture.' },
    zh_male_sophie_uranus_bigtts: { name: 'Charming Sophie', description: 'An aloof, elegant lady — distant on the surface, tender within.' },
};

const raw = JSON.parse(readFileSync(SRC, 'utf8')) as { Result: { Speakers: RawSpeaker[] } };
const speakers = raw.Result.Speakers.filter((s) => s.ResourceID === RESOURCE);

const voices = speakers.map((s) => {
    // Concatenate the distinct supported-language flag emojis (each entry may itself
    // hold several, e.g. zh-cn → 🇨🇳🇺🇸). Shown after the voice name as a multilingual hint.
    const flags = [...new Set((s.Languages ?? []).map((l) => l.Flag).filter(Boolean) as string[])].join('');
    const en = EN[s.VoiceType] ?? { name: s.Name.trim(), description: s.Description ?? '' };
    return {
        voiceType: s.VoiceType,
        resourceId: s.ResourceID,
        name: s.Name.trim(),
        nameEn: en.name,
        description: (s.Description ?? '').trim(),
        descriptionEn: en.description,
        avatar: s.Avatar ?? '',
        trialUrl: s.TrialURL ?? '',
        gender: s.Gender as '女' | '男',
        flags,
    };
});

const missing = voices.filter((v) => !EN[v.voiceType]).map((v) => v.voiceType);
if (missing.length) console.warn(`⚠️  Missing EN translation for: ${missing.join(', ')}`);

const header = `// AUTO-GENERATED by sources/scripts/genVoices.ts — do not edit by hand.
// Source: Volcano voice catalog, filtered to ResourceID === '${RESOURCE}' (${voices.length} voices).

export interface Voice {
    /** Volcano VoiceType, e.g. zh_female_vv_uranus_bigtts */
    voiceType: string;
    /** Volcano ResourceID; always 'seed-tts-2.0'. Sent to the gateway alongside voiceType. */
    resourceId: string;
    /** Display name (Chinese, from the catalog) */
    name: string;
    /** Display name (English) */
    nameEn: string;
    /** Description (Chinese, from the catalog) */
    description: string;
    /** Description (English) */
    descriptionEn: string;
    /** Avatar image URL */
    avatar: string;
    /** Preview/trial audio URL (wav) */
    trialUrl: string;
    /** '女' | '男' */
    gender: '女' | '男';
    /** Concatenated supported-language flag emojis (multilingual hint), may be empty. */
    flags: string;
}

/** Default voice used when the user hasn't picked one (matches the gateway env default). */
export const DEFAULT_VOICE_TYPE = 'zh_female_vv_uranus_bigtts';

export const VOICES: Voice[] = ${JSON.stringify(voices, null, 4)};

/** Look up a voice by its voiceType. Returns undefined for null/unknown. */
export function findVoiceByType(voiceType: string | null | undefined): Voice | undefined {
    if (!voiceType) return undefined;
    return VOICES.find((v) => v.voiceType === voiceType);
}

// Localized accessors: Chinese UI shows the catalog (Chinese) text, everything else English.
// @/text is required lazily (not imported at module top) to avoid an import cycle:
// @/text → @/sync/persistence → … → @/sync/apiHappyVoice → Voices, which would
// otherwise leave React null and crash the voice settings screen.
function isChineseLocale(): boolean {
    const { getCurrentLanguage } = require('@/text') as typeof import('@/text');
    return getCurrentLanguage().startsWith('zh');
}

/** Localized display name for a voice. */
export function getVoiceName(voice: Voice): string {
    return isChineseLocale() ? voice.name : voice.nameEn;
}

/** Localized description for a voice. */
export function getVoiceDescription(voice: Voice): string {
    return isChineseLocale() ? voice.description : voice.descriptionEn;
}
`;

writeFileSync(OUT, header, 'utf8');
console.log(`Wrote ${voices.length} voices to ${OUT}`);
