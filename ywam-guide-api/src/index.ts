interface Env {
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS for your Vibe homepage
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. The Ingestion Endpoint
    if (url.pathname === "/ingest" && request.method === "POST") {
      try {
        const body = await request.json() as { text: string; lang: string; path: string };
        const { text, lang, path } = body;

        // Generate Vector
        const aiResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [text] }) as any;
        const values = aiResponse.data[0];

        // Upload to Vectorize
        await env.VECTORIZE.upsert([{
          id: crypto.randomUUID(),
          values: values,
          metadata: { text, lang, path }
        }]);

        return new Response("Ingested", { headers: corsHeaders });
      } catch (err: any) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    // 3. The Chat Endpoint
    if (url.pathname === "/ask" && request.method === "POST") {
      try {
        const { question, lang } = await request.json() as { question: string; lang: string };

        const questionQuery = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [question] }) as any;
        const vector = questionQuery.data[0];

        const matches = await env.VECTORIZE.query(vector, { 
          topK: 3, 
          filter: { lang: lang },
          returnMetadata: true 
        });

        const context = matches.matches.map(m => m.metadata?.text || "").join("\n\n");

        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: `You are the YWAM Sendai Guide. Use this context to answer in ${lang === 'ja' ? 'Japanese' : 'English'}: ${context}` },
            { role: 'user', content: question }
          ]
        });

        return new Response(JSON.stringify({ answer: response.response }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err: any) {
		console.error("Ingestion Error:", err.message);
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;