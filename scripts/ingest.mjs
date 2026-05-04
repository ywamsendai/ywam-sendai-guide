import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Configuration
const BINDING_NAME = "VECTORIZE"; // Must match wrangler.toml
const MODEL = "@cf/baai/bge-small-en-v1.5"; // Fast & free on Workers AI

async function runIngestion() {
  // 1. Find all Markdown files
  const files = await glob('src/content/docs/**/*.{md,mdx}');
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lang = file.includes('/ja/') ? 'ja' : 'en'; // Detect language from path
    const url = file.replace('src/content/docs', '').replace(/\.mdx?$/, '');

    console.log(`Processing [${lang}]: ${file}`);

    // 2. Simple Chunking (split by double newline or paragraph)
    const chunks = content.split(/\n\s*\n/).filter(c => c.trim().length > 50);

    for (const [index, text] of chunks.entries()) {
      // Note: You would normally call the Cloudflare AI API here to get the vector.
      // For a local script, we'll use a temporary "Worker" approach or the CF API.
      
      const vectorId = `${lang}-${url}-${index}`.replace(/\//g, '_');
      
      // LOGIC: Send 'text' to Cloudflare AI -> Receive Vector -> Upload to Vectorize
      // We will implement this as a Cloudflare Worker command below.
    }
  }
}