export const dynamic = "force-dynamic";

/**
 * Health check. The app is fully client-persisted (localStorage), so there
 * is no database to ping — we only report that the server is up and whether
 * an AI provider is configured.
 */
export async function GET() {
  const aiConfigured = !!(
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY
  );
  return Response.json({ ok: true, storage: "localStorage", aiConfigured });
}
