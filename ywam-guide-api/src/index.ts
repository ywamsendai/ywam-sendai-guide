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
        const { question, lang } = await request.json() as { question: string; lang: string };

        const questionQuery = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: question }) as any;
        const vector = questionQuery.data[0];

        // 1. Query with Filter (Only looks at English or Japanese data based on site version)
        const matches = await env.VECTORIZE.query(vector, { 
          topK: 3, 
          returnMetadata: true,
          filter: { lang: lang } 
        });

        const context = matches.matches
          .map(m => (m.metadata as any)?.text || "")
          .filter(t => t.length > 0)
          .join("\n\n");

        // 2. Define the Bilingual System Prompt
        const systemPrompt = lang === 'ja' 
          ? `あなたは親切で温かい YWAM Sendai（ワイワム仙台）のデジタルガイドです。
             
             ルール：
             1. 提供された情報を基に、自然な日本語（です・ます調）で答えてください。
             2. 「コンテキストに基づくと」や「ドキュメントによると」といった表現は使わないでください。
             3. 答えが分からない場合は、公式LINE、Instagram、またはメールでスタッフに問い合わせるよう丁寧に案内してください。
             4. **太字**を使って重要な情報を強調してください。
             
             情報：${context}`
          : `You are the friendly, helpful YWAM Sendai Digital Assistant.
             
             RULES:
             1. Use the provided information to answer, but speak naturally as a person.
             2. Do NOT mention "the context," "the text," or "the documents." 
             3. If you don't know the answer, politely suggest they contact us on LINE, Instagram, or email.
             4. Use **bold** for emphasis. Use [Link Text](URL) for links.
             5. If referring to the application form, use: [Application Form](https://ywamsendai.org/apply).

             INFORMATION: ${context}`;

        // 3. The AI Run using the dynamic systemPrompt
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ],
          stream: false,
          max_tokens: 2048
        }) as any;

        let answer = aiResponse?.response || "";

        if (!answer) {
            answer = lang === 'ja' 
              ? "申し訳ありません。回答を生成できませんでした。もう一度質問を変えてみてください。" 
              : "I processed your request but couldn't generate a specific answer. Could you try rephrasing your question?";
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