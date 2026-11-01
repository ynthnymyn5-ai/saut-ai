# In-app assistant "SO" — talking face

Date: 1 Nov 2026. Status: **implemented and browser-tested with test doubles; real providers not yet called** (no keys in this workspace).

## What the user sees
A round SO button at the bottom of every dashboard screen (above the phone tab bar). Tapping it opens a panel with:
- **The face** — a photoreal AI-generated human face (Simli) when configured; otherwise SO's built-in face. Both move their mouth with the actual speech audio and change expression with the assistant's emotion (happy, thinking, concerned, celebrating).
- **Voice** — tap the mic and speak (Gulf Arabic or English). Recording stops automatically after you stop talking. Tapping the mic while SO speaks interrupts it.
- **Text** — type instead; suggestion chips for common questions.
- **Mute** — keep the face and text, no sound.

## What SO can do
| Ask | What happens |
|---|---|
| "افتح المواعيد", "ودني للفوترة", "open billing" | Opens the screen instantly (no AI call) |
| "كيف الوضع الحين؟" | Live status: employees online, calls, conversations, approvals waiting |
| "وش مواعيد اليوم/بكرة؟" | Appointments for the day (first names only) |
| "كم مكالمة هالشهر؟" | Measured metrics — owners, admins and managers with whole-business access only |
| "شلون أربط واتساب؟" | Explains the feature and opens Integrations |

SO is **read-only**: it never changes data, sends messages, calls or charges. Numbers come only from tool results; in demo mode it says there is no live data.

## Voices (Arabic + English)
With `ELEVENLABS_API_KEY` set, SO speaks with ElevenLabs human voices: `ELEVENLABS_VOICE_AR` for Arabic replies and `ELEVENLABS_VOICE_EN` for English, chosen per reply from the text itself. Emotion adjusts expressiveness. If ElevenLabs is missing or fails, OpenAI voices are used automatically. (Live phone calls still use OpenAI Realtime speech-to-speech for lowest latency.)

## How it works
`AssistantLauncher` (tiny) → on tap, lazy-loads `AssistantPanel`.
1. Text or `/api/assistant/listen` (OpenAI STT) → `/api/assistant/chat`: navigation fast-path, else OpenAI with role-scoped read-only tools; returns `{reply, emotion, actions}`.
2. `/api/assistant/speak`: OpenAI TTS with an emotion-specific voice direction → PCM 24 kHz → resampled to **PCM16 16 kHz** (the format Simli lip-syncs to).
3. Face: `/api/assistant/face` mints a Simli session token server-side (key never reaches the browser) → `simli-client` streams lip-synced video over WebRTC. Without it, `SoFace` plays the audio with Web Audio and moves the mouth from the live audio level every frame.

## Tests
- Units (`npm test`): resampling keeps duration and waveform, speech level, navigation phrases in Arabic and English (questions aren't hijacked; "سو" the name isn't a verb), emotion/voice/speakable text.
- **Browser (Chromium, real components, mocked APIs, fake microphone):** nothing loads before opening; built-in face fallback; typed question → reply → 20 distinct mouth shapes while speaking → back to ready; spoken command recorded, auto-stopped (~3 s) and "افتح المحادثات" opened Conversations; no overflow at 390 px; photoreal path streams all audio (80,000 bytes PCM16 16 kHz, chunks ≤ 6,000) and closing ends the session; zero page errors.

## Not verified here
Real OpenAI voice/answers and a real Simli face need your keys; `simli-client` (^3.0.2) is declared but couldn't be installed here (no npm access) — run `npm install && npm run build` and check one real conversation.
