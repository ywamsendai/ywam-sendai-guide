interface Env {
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}

// Helper to format history into the chat structure
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
        const { question, lang, history = [] } = await request.json() as { question: string; lang: string; history: { role: string, content: string }[] };

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
          1. 回答はすべて日本語（です・ます調）で行ってください。英語を混ぜないでください。
          2. 「コンテキストに基づくと」や「ドキュメントによると」といった表現は使わないでください。
          3. **提供された「情報」だけを基に答えてください。** 情報にないことは「分かりません」と答え、公式LINE、またはメールでスタッフへの問い合わせを促してください。
          4. 書式設定には標準のMarkdown構文を使用してください。強調したい箇所には**太字**を使用してください。リンクには[リンクテキスト](URL)を使用してください。
          5. 申込フォーム（生徒・スタッフ・訪問者・チーム用）を案内する場合は、必ず [こちらの申込フォーム](/${lang}/apply) を案内してください。
          
          情報：${context}`
        : `You are the friendly, helpful YWAM Sendai Digital Assistant.
          
          RULES:
          1. Answer naturally but stay grounded in the facts provided.
          2. Do NOT mention "the context," "the text," or "the documents." 
          3. **ONLY use the provided INFORMATION to answer.** If the info is not there, say you don't know and suggest contacting a staff member via Instagram or email. Do NOT use outside knowledge.
          4. Use standard Markdown syntax for formatting. Use **bold** for emphasis. Use [Link Text](URL) for links.
          5. If referring to the application form (staff, student, visitor, or team), use: [Application Form](/${lang}/apply).

          INFORMATION: ${context}`

        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: question }
        ];


        // 3. The AI Run using the dynamic systemPrompt
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: messages,
          max_tokens: 2048
        }) as any;

        console.log("--- CONTEXT SENT TO AI ---");
        console.log(context); 
        console.log("--------------------------");

        let answer = "";

if (aiResponse) {
  if (typeof aiResponse === 'string') {
    answer = aiResponse;
  } else if (aiResponse.response) {
    answer = aiResponse.response;
  } else if (aiResponse.answer) {
    answer = aiResponse.answer;
  } else if (Array.isArray(aiResponse) && aiResponse[0]?.response) {
    answer = aiResponse[0].response;
  }
}

        if (aiResponse && typeof aiResponse === 'object') {
          answer = aiResponse.response || aiResponse.answer || "";
        }

        if (!answer.trim()) {
          if (context.trim().length === 0) {
            answer = lang === 'ja' 
              ? "申し訳ありません。その質問に関する情報がハンドブック内に見つかりませんでした。具体的な費用や日程について聞いてみてください。" 
              : "I'm sorry, I couldn't find information about that in our guide. Try asking specifically about costs, dates, or our programs.";
          } else {
            answer = lang === 'ja' 
              ? "申し訳ありません。回答を生成できませんでした。もう一度質問を変えてみてください。" 
              : "I processed your request but couldn't generate a specific answer. Could you try rephrasing your question?";
          }
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