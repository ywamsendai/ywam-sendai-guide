import fs from 'fs';
import { glob } from 'glob';
import matter from 'gray-matter';

const WORKER_URL =
  process.env.WORKER_URL || 'https://ywam-guide-api.ywamsendai.workers.dev';

const MIN_CHUNK_LENGTH = 120;
const MAX_CHUNK_LENGTH = 1800;

function normalizeFilePath(file) {
  return file.replace(/\\/g, '/');
}

function detectLang(file) {
  const normalized = normalizeFilePath(file);
  return normalized.split('/').includes('ja') ? 'ja' : 'en';
}

function cleanPath(file) {
  const normalized = normalizeFilePath(file);
  return normalized
    .replace(/^src\/content\/docs/, '')
    .replace(/\.mdx?$/, '');
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitByHeadings(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,4})\s+(.*)$/);

    if (headingMatch) {
      if (currentHeading || currentBody.length) {
        sections.push({
          heading: currentHeading || 'Untitled Section',
          text: currentBody.join('\n').trim(),
        });
      }

      currentHeading = headingMatch[2].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeading || currentBody.length) {
    sections.push({
      heading: currentHeading || 'Untitled Section',
      text: currentBody.join('\n').trim(),
    });
  }

  return sections.filter((section) => section.text.length > 0);
}

function splitLargeSection(text, maxLen = MAX_CHUNK_LENGTH) {
  if (text.length <= maxLen) return [text];

  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function mergeTinySections(sections, minLen = MIN_CHUNK_LENGTH) {
  const merged = [];

  for (const section of sections) {
    if (merged.length > 0 && section.text.length < minLen) {
      merged[merged.length - 1].text += `\n\n${section.heading}\n${section.text}`;
    } else {
      merged.push({ ...section });
    }
  }

  return merged;
}

function shouldIncludeFile(file) {
  const normalized = normalizeFilePath(file);

  if (!/\.(md|mdx)$/.test(normalized)) return false;
  if (!normalized.startsWith('src/content/docs/')) return false;
  if (normalized.endsWith('/index.mdx')) return false;

  return true;
}

async function deleteExistingChunks(path, lang) {
  const response = await fetch(`${WORKER_URL}/delete-by-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, lang }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Delete failed for ${lang}:${path} -> ${response.status} - ${errText}`
    );
  }
}

async function ingestChunk(payload) {
  const response = await fetch(`${WORKER_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ingest failed -> ${response.status} - ${errText}`);
  }
}

async function getFilesToProcess() {
  const cliFiles = process.argv.slice(2).filter(Boolean);

  if (cliFiles.length > 0) {
    return cliFiles
      .map(normalizeFilePath)
      .filter(shouldIncludeFile);
  }

  const allFiles = await glob('src/content/docs/**/*.{md,mdx}');
  return allFiles
    .map(normalizeFilePath)
    .filter(shouldIncludeFile);
}

async function processFile(file) {
  const normalizedFile = normalizeFilePath(file);
  const rawContent = fs.readFileSync(normalizedFile, 'utf-8');
  const { data, content } = matter(rawContent);

  const lang = detectLang(normalizedFile);
  const path = cleanPath(normalizedFile);

  const title = String(data.title || 'General Info').trim();
  const description = String(data.description || '').trim();
  const audience = String(data.audience || 'mixed').trim();
  const contentType = String(data.content_type || 'reference').trim();
  const scope = String(data.scope || 'local').trim();
  const status = String(data.status || 'active').trim();
  const topic = String(data.topic || '').trim();
  const priority = String(data.priority || 'normal').trim();
  const lastReviewed = String(data.last_reviewed || '').trim();

  const normalizedContent = normalizeText(content);
  let sections = splitByHeadings(normalizedContent);
  sections = mergeTinySections(sections);

  console.log(
    `📖 Syncing [${lang.toUpperCase()}]: ${title} (${sections.length} sections)`
  );

  await deleteExistingChunks(path, lang);

  let chunkIndex = 0;

  for (const section of sections) {
    const subchunks = splitLargeSection(section.text);

    for (let subIndex = 0; subIndex < subchunks.length; subIndex++) {
      const chunkBody = subchunks[subIndex];
      const sectionLabel =
        subchunks.length > 1
          ? `${section.heading} (Part ${subIndex + 1})`
          : section.heading;

      const contextualText = [
        `Title: ${title}`,
        description ? `Description: ${description}` : '',
        `Path: ${path}`,
        `Language: ${lang}`,
        `Audience: ${audience}`,
        `Content Type: ${contentType}`,
        `Scope: ${scope}`,
        `Status: ${status}`,
        topic ? `Topic: ${topic}` : '',
        `Priority: ${priority}`,
        lastReviewed ? `Last Reviewed: ${lastReviewed}` : '',
        `Section: ${sectionLabel}`,
        '',
        chunkBody,
      ]
        .filter(Boolean)
        .join('\n');

      const chunkId = `${lang}-${path.replace(/\//g, '-')}-chunk-${chunkIndex++}`;

      await ingestChunk({
        id: chunkId,
        text: contextualText,
        lang,
        path,
        title,
        description,
        audience,
        content_type: contentType,
        scope,
        status,
        topic,
        priority,
        last_reviewed: lastReviewed,
        section: sectionLabel,
      });
    }
  }
}

async function runIngestion() {
  console.log('🚀 Starting ingestion...');

  const files = await getFilesToProcess();

  if (!files.length) {
    console.log('ℹ️ No eligible documentation files to process.');
    return;
  }

  for (const file of files) {
    try {
      await processFile(file);
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('✨ Ingestion complete.');
}

runIngestion();