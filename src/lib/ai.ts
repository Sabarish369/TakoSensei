/**
 * Compact AI provider layer. Uses whichever key is present:
 *   OPENAI_API_KEY      → api.openai.com
 *   OPENROUTER_API_KEY  → openrouter.ai (OpenAI-compatible)
 *   GROQ_API_KEY        → api.groq.com (OpenAI-compatible, free tier)
 * All three speak the same /chat/completions protocol, so one fetch covers all.
 */

type Provider = {
  baseURL: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

export function getProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      baseURL: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "openai/gpt-4o-mini",
      extraHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "TakoSensei",
      },
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      // Do not inherit AI_MODEL here: an OpenRouter model name is not valid on Groq.
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    });
  }
  return providers;
}

/** Primary provider, for backwards-compatible callers. */
export function getProvider(): Provider | null {
  return getProviders()[0] ?? null;
}

export function hasAIProvider(): boolean {
  return getProvider() !== null;
}

export function getOpenAIKey(): string | null {
  return getProvider()?.apiKey ?? null;
}

export function getOpenAIModel(): string {
  return getProvider()?.model ?? "gpt-4o-mini";
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  // Try every configured provider. This is critical for the demo: an
  // exhausted OpenRouter credit balance (402) falls through to Groq instead
  // of silently degrading the paper into a generic scaffold.
  for (const p of getProviders()) {
    try {
      const res = await fetch(`${p.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
          ...(p.extraHeaders || {}),
        },
        body: JSON.stringify({
          model: p.model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 400,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content: unknown = data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content.trim();
    } catch {
      // Try the next configured provider.
    }
  }
  return null;
}

/** Parse JSON out of an LLM reply even when fenced or surrounded by prose. */
export function parseJSONLoose<T = any>(raw: string | null): T | null {
  if (!raw) return null;
  const text = raw.trim();
  try {
    return JSON.parse(text) as T;
  } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {}
  }
  const firstBrace = text.search(/[{[]/);
  if (firstBrace >= 0) {
    const open = text[firstBrace];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(firstBrace, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export async function chatCompletionJSON<T = any>(opts: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<T | null> {
  const raw = await chatCompletion({ ...opts, json: true });
  return parseJSONLoose<T>(raw);
}

/** Whisper: Groq's free tier first, then OpenAI. */
export function getWhisperProvider(): { baseURL: string; apiKey: string; model: string } | null {
  if (process.env.GROQ_API_KEY) {
    return {
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: "whisper-large-v3-turbo",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      baseURL: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: "whisper-1",
    };
  }
  return null;
}
