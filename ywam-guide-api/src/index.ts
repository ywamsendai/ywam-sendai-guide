interface Env {
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/ingest" && request.method === "POST") {
      try {
        const body = await request.json() as { id: string; text: string; lang: string; path: string };
        const { id, text, lang, path } = body;

        const aiResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: text }) as any;
        const values = aiResponse.data[0];

        await env.VECTORIZE.upsert([{
          id: id,
          values: values,
          metadata: { text, lang, path }
        }]);

        return new Response("Ingested", { headers: corsHeaders });
      } catch (err: any) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/ask" && request.method === "POST") {
      try {
        const { question } = await request.json() as { question: string };

        const questionQuery = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: question }) as any;
        const vector = questionQuery.data[0];

        // 1. Reduce topK to 3 to stay under token limits
const matches = await env.VECTORIZE.query(vector, { 
  topK: 3, 
  returnMetadata: true 
});

const context = matches.matches
  .map(m => (m.metadata as any)?.text || "")
  .filter(t => t.length > 0)
  .join("\n\n");

// 2. Use a more direct, high-priority prompt structure
const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
  messages: [
    { 
      role: 'system', 
      content: `You are the friendly, helpful YWAM Sendai Digital Assistant. 
      Your goal is to answer questions about the YWAM community, local life in Sendai, missionary life, and the programs that are run.
      
      RULES:
      1. Use the provided information to answer, but speak naturally as a person.
      2. Do NOT mention "the context," "the text," or "the documents." 
      3. If you don't know the answer, politely suggest they contact us on LINE, Instagram, or email.
      4. Keep answers warm and welcoming.

      FORMATTING RULES:
      1. Use Markdown for formatting.
      2. Use **bold** for emphasis on important terms.
      3. Use clickable links if the URL is in the context. Format them as [Link Text](URL).
      4. If referring to the application form, always use: [Application Form](https://ywamsendai.org/apply).
          
      INFORMATION: ${context}` 
    },
    { 
      role: 'user', 
      content: question 
    }
  ],
  stream: false,
  max_tokens: 1024
}) as any;

// 3. Extract the response (Llama 3 usually uses the .response key)
let answer = aiResponse?.response || "";

// Final check: if the AI still blanks out, send a friendly error
if (!answer) {
    answer = "I processed your request but couldn't generate a specific answer. Could you try rephrasing your question?";
}

return new Response(JSON.stringify({ answer: answer }), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

      } catch (err: any) {
        return new Response(JSON.stringify({ answer: `Error: ${err.message}` }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
} satisfies ExportedHandler<Env>;