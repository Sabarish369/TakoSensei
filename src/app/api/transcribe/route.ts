import { getWhisperProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/transcribe — Whisper voice-to-text.
// Accepts multipart/form-data with an `audio` file field.
// Provider: Groq whisper-large-v3-turbo (free tier) or OpenAI whisper-1.
export async function POST(req: Request) {
  const provider = getWhisperProvider();
  if (!provider) {
    return Response.json(
      { error: "No transcription provider configured (set GROQ_API_KEY or OPENAI_API_KEY)" },
      { status: 501 }
    );
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return Response.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (audio.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Audio too large" }, { status: 413 });
    }

    const forward = new FormData();
    const filename = audio instanceof File && audio.name ? audio.name : "speech.webm";
    forward.append("file", audio, filename);
    forward.append("model", provider.model);

    const res = await fetch(`${provider.baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: forward,
    });

    if (!res.ok) {
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }

    const data = await res.json();
    const text: string = typeof data?.text === "string" ? data.text.trim() : "";
    return Response.json({ text });
  } catch {
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
