interface Env {
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  INGEST_MANIFEST: KVNamespace;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface IngestBody {
  id: string;
  text: string;
  lang: string;
  path: string;
  title?: string;
  description?: string;
  audience?: string;
  content_type?: string;
  scope?: string;
  status?: string;
  topic?: string;
  priority?: string;
  last_reviewed?: string;
  section?: string;
}

interface DeleteByPathBody {
  path: string;
  lang: string;
}

interface AskBody {
  question: string;
  lang: string;
  history?: { role: string; content: string }[];
}

interface ManifestRecord {
  chunkIds: string[];
  updatedAt: string;
  path: string;
  lang: string;
}

interface SourceLink {
  title: string;
  path: string;
  url: string;
  type: 'doc';
}

type MatchMetadata = {
  text?: string;
  lang?: string;
  path?: string;
  title?: string;
  description?: string;
  audience?: string;
  content_type?: string;
  scope?: string;
  status?: string;
  topic?: string;
  priority?: string;
  last_reviewed?: string;
  section?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const EMBEDDING_MODEL = '@cf/baai/bge-m3';
const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const DOCS_BASE_URL = 'https://guide.ywamsendai.org';

function toDocUrl(path?: string): string {
  if (!path) return DOCS_BASE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${DOCS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function manifestKey(path: string, lang: string): string {
  return `manifest:${lang}:${path}`;
}

function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase();
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

async function getManifest(
  env: Env,
  path: string,
  lang: string
): Promise<ManifestRecord | null> {
  const raw = await env.INGEST_MANIFEST.get(manifestKey(path, lang));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ManifestRecord;
  } catch {
    return null;
  }
}

async function putManifest(
  env: Env,
  path: string,
  lang: string,
  chunkIds: string[]
): Promise<void> {
  const record: ManifestRecord = {
    chunkIds,
    updatedAt: new Date().toISOString(),
    path,
    lang,
  };

  await env.INGEST_MANIFEST.put(manifestKey(path, lang), JSON.stringify(record));
}

async function deleteManifest(env: Env, path: string, lang: string): Promise<void> {
  await env.INGEST_MANIFEST.delete(manifestKey(path, lang));
}

async function deleteVectorIds(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;

  await (env.VECTORIZE as any).deleteByIds(ids);
}

async function deleteChunksForPath(
  env: Env,
  path: string,
  lang: string
): Promise<{ deleted: number }> {
  const manifest = await getManifest(env, path, lang);

  if (!manifest || !Array.isArray(manifest.chunkIds) || manifest.chunkIds.length === 0) {
    return { deleted: 0 };
  }

  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < manifest.chunkIds.length; i += batchSize) {
    const batch = manifest.chunkIds.slice(i, i + batchSize);
    await deleteVectorIds(env, batch);
    deleted += batch.length;
  }

  await deleteManifest(env, path, lang);

  return { deleted };
}

function scoreMatch(
  question: string,
  metadata: MatchMetadata,
  originalScore: number
): number {
  let score = originalScore || 0;
  const q = normalizeQuestion(question);

  const title = safeString(metadata.title).toLowerCase();
  const section = safeString(metadata.section).toLowerCase();
  const scope = safeString(metadata.scope);
  const priority = safeString(metadata.priority);
  const audience = safeString(metadata.audience);
  const path = safeString(metadata.path).toLowerCase();

  if (title && q.includes(title)) score += 0.08;
  if (section && q.includes(section)) score += 0.05;

  if (scope === 'local') score += 0.04;
  if (priority === 'high') score += 0.03;

  if (
    q.includes('apply') ||
    q.includes('application') ||
    q.includes('応募') ||
    q.includes('申し込み')
  ) {
    if (path.includes('/apply')) score += 0.08;
  }

  if (
    q.includes('student') ||
    q.includes('students') ||
    q.includes('生徒') ||
    q.includes('学生')
  ) {
    if (audience === 'student' || path.includes('/roles/students')) score += 0.08;
  }

  if (q.includes('staff') || q.includes('スタッフ')) {
    if (audience === 'staff' || path.includes('/roles/staff')) score += 0.08;
  }

  if (
    q.includes('short-term') ||
    q.includes('visitor') ||
    q.includes('team') ||
    q.includes('短期')
  ) {
    if (audience === 'short-term' || path.includes('/roles/short-term')) score += 0.08;
  }

  if (q.includes('dts') && path.includes('/schools/dts')) score += 0.08;
  if (q.includes('dbs') && path.includes('/schools/dbs')) score += 0.08;

  if (
    q.includes('what is ywam') ||
    q.includes('ywam values') ||
    q.includes('ywam beliefs') ||
    q.includes('ywamとは') ||
    q.includes('価値観') ||
    q.includes('信条')
  ) {
    if (scope === 'ywam-global' || path.includes('/ywam')) score += 0.06;
  }

  return score;
}

function buildContext(matches: Array<{ metadata?: MatchMetadata }>): string {
  return matches
    .map((m, i) => {
      const md = m.metadata || {};
      return [
        `SOURCE ${i + 1}`,
        `Title: ${safeString(md.title)}`,
        `Section: ${safeString(md.section)}`,
        `Audience: ${safeString(md.audience)}`,
        `Content Type: ${safeString(md.content_type)}`,
        `Scope: ${safeString(md.scope)}`,
        `Priority: ${safeString(md.priority)}`,
        `Text: ${safeString(md.text)}`,
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

function buildSystemPrompt(lang: string, context: string): string {
  if (lang === 'ja') {
    return `あなたは親切で温かい YWAM Sendai（ワイワム仙台）のデジタルガイドです。

ルール:
1. 回答はすべて自然な日本語（です・ます調）で行ってください。
2. 提供された情報だけを使って答えてください。
3. 情報にないことは、分からないと正直に伝えてください。
4. 「コンテキストによると」「資料によると」などの言い方は使わないでください。
5. 推測で断定しないでください。
6. 必要に応じて、ユーザーの次の行動に役立つ案内をしてください。
7. 申込フォームを案内する場合は、必ずこの正確なリンクを使ってください: [申込フォーム](https://ywamsendai.org/ja/apply)
8. お問い合わせを案内する場合は、必ずこの正確なリンクを使ってください: [お問い合わせ](https://ywamsendai.org/ja/contact)
9. ハンドブックのURLを推測・生成・出力しないでください。ハンドブックへの参照リンクは別途提供されます。
10. donateのリンクは、正確な承認済みリンクがある場合のみ案内してください。
11. 書式はMarkdownを使い、必要な箇所は太字で分かりやすくしてください。

情報:
${context}`;
  }

  return `You are the friendly, helpful YWAM Sendai Digital Assistant.

RULES:
1. Answer naturally and clearly in English.
2. Use only the provided information.
3. If the answer is not in the provided information, say you do not know rather than guessing.
4. Do not mention "the context," "the documents," or "the provided information."
5. Do not use outside knowledge.
6. When helpful, you may point the user to a relevant next step.
7. If referring to the application form, always use this exact link: [Application Form](https://ywamsendai.org/en/apply).
8. If referring to the contact page, always use this exact link: [Contact Us](https://ywamsendai.org/en/contact).
9. Do not create, guess, or output handbook URLs. Handbook source links are provided separately.
10. Do not invent donate links unless exact approved links are provided.
11. Use Markdown formatting clearly and naturally.

INFORMATION:
${context}`;
}

function extractAnswer(aiResponse: any): string {
  if (typeof aiResponse === 'string') return aiResponse;
  if (aiResponse?.response) return aiResponse.response;
  if (aiResponse?.answer) return aiResponse.answer;
  if (Array.isArray(aiResponse) && aiResponse[0]?.response) return aiResponse[0].response;
  return '';
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/ingest' && request.method === 'POST') {
      try {
        const body = (await request.json()) as IngestBody;

        const {
          id,
          text,
          lang,
          path,
          title = '',
          description = '',
          audience = 'mixed',
          content_type = 'reference',
          scope = 'local',
          status = 'active',
          topic = '',
          priority = 'normal',
          last_reviewed = '',
          section = '',
        } = body;

        if (!id || !text || !lang || !path) {
          return new Response('Missing required fields: id, text, lang, path', {
            status: 400,
            headers: corsHeaders,
          });
        }

        const aiResponse = (await env.AI.run(EMBEDDING_MODEL, { text })) as any;
        const values = aiResponse?.data?.[0];

        if (!values) {
          return new Response('Failed to generate embedding', {
            status: 500,
            headers: corsHeaders,
          });
        }

        await env.VECTORIZE.upsert([
          {
            id,
            values,
            metadata: {
              text,
              lang,
              path,
              title,
              description,
              audience,
              content_type,
              scope,
              status,
              topic,
              priority,
              last_reviewed,
              section,
            },
          },
        ]);

        const existingManifest = await getManifest(env, path, lang);
        const existingIds = existingManifest?.chunkIds || [];
        const mergedIds = Array.from(new Set([...existingIds, id]));
        await putManifest(env, path, lang, mergedIds);

        return new Response(
          JSON.stringify({
            success: true,
            id,
            path,
            lang,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        return new Response(err?.message || 'Ingest error', {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if (url.pathname === '/delete-by-path' && request.method === 'POST') {
      try {
        const body = (await request.json()) as DeleteByPathBody;
        const { path, lang } = body;

        if (!path || !lang) {
          return new Response('Missing required fields: path, lang', {
            status: 400,
            headers: corsHeaders,
          });
        }

        const result = await deleteChunksForPath(env, path, lang);

        return new Response(
          JSON.stringify({
            success: true,
            path,
            lang,
            deleted: result.deleted,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        return new Response(err?.message || 'Delete error', {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if (url.pathname === '/ask' && request.method === 'POST') {
      try {
        const { question, lang, history = [] } = (await request.json()) as AskBody;

        if (!question || !lang) {
          return new Response(
            JSON.stringify({
              answer: 'Missing required fields: question, lang',
              sources: [],
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const questionQuery = (await env.AI.run(EMBEDDING_MODEL, {
          text: question,
        })) as any;

        const vector = questionQuery?.data?.[0] as number[] | undefined;

        if (!vector) {
          return new Response(
            JSON.stringify({
              answer:
                lang === 'ja'
                  ? '申し訳ありません。検索の準備中に問題が発生しました。'
                  : 'Sorry, there was a problem preparing the search.',
              sources: [],
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const rawMatches = await env.VECTORIZE.query(vector, {
          topK: 8,
          returnMetadata: true,
          filter: { lang },
        } as any);

        const reranked = (rawMatches.matches || [])
          .map((m: any) => ({
            ...m,
            rerankScore: scoreMatch(
              question,
              (m.metadata || {}) as MatchMetadata,
              m.score || 0
            ),
          }))
          .sort((a: any, b: any) => b.rerankScore - a.rerankScore)
          .slice(0, 4);

        const hasUsableMatches =
          reranked.length > 0 &&
          typeof reranked[0].score === 'number' &&
          reranked[0].score > 0.15;

        const context = hasUsableMatches ? buildContext(reranked) : '';

        const sourceMap = new Map<string, SourceLink>();

        if (hasUsableMatches) {
          for (const m of reranked) {
            const md = (m.metadata || {}) as MatchMetadata;
            const path = safeString(md.path);
            if (!path) continue;

            const title = safeString(md.title, path || 'Documentation');

            sourceMap.set(path, {
              title,
              path,
              url: toDocUrl(path),
              type: 'doc',
            });
          }
        }

        const sources: SourceLink[] = Array.from(sourceMap.values());

        if (!context.trim()) {
          const fallback =
            lang === 'ja'
              ? '申し訳ありません。その質問に関する情報がハンドブック内では見つかりませんでした。別の言い方で質問するか、スタッフにお問い合わせください。'
              : "I'm sorry, I couldn't find that in the handbook. Please try rephrasing your question or contact a staff member.";

          return new Response(
            JSON.stringify({
              answer: fallback,
              sources: [],
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const systemPrompt = buildSystemPrompt(lang, context);

        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-4).map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: question },
        ];

        const aiResponse = (await env.AI.run(CHAT_MODEL, {
          messages,
          max_tokens: 900,
        })) as any;

        let answer = extractAnswer(aiResponse);

        if (!answer.trim()) {
          answer =
            lang === 'ja'
              ? '申し訳ありません。回答を生成できませんでした。質問を少し変えてもう一度お試しください。'
              : "I'm sorry, I couldn't generate a clear answer. Please try rephrasing your question.";
        }

        return new Response(
          JSON.stringify({
            answer,
            sources,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        console.error('WORKER_ERROR:', err?.message || err);
        return new Response(
          JSON.stringify({
            answer: "I'm having trouble right now. Please try again in a minute.",
            sources: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler<Env>;