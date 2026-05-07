// pump-guide.mjs
import fs from 'fs';
import { glob } from 'glob';
import crypto from 'crypto';

const WORKER_URL = process.env.WORKER_URL || 'https://ywam-guide-api.ywamsendai.workers.dev'; 

async function pump() {
  console.log("🚀 Starting the engine...");
  
  const files = await glob('src/content/docs/**/*.{md,mdx}');
  
  if (files.length === 0) {
    console.error("❌ No files found!");
    return;
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lang = file.split(/[\\/]/).includes('ja') ? 'ja' : 'en';
    const cleanPath = file
      .replace('src/content/docs', '')
      .replace(/\.mdx?$/, '');

    // Split by double newlines
    const chunks = content.split(/\n\n+/).filter(c => c.trim().length > 40);

    console.log(`📖 Syncing [${lang.toUpperCase()}]: ${cleanPath} (${chunks.length} chunks)`);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i].trim();
      
      // Create a deterministic ID: "en-dts-costs-chunk-0"
      // This ensures that if the file is updated, the same ID is overwritten
      const chunkId = `${lang}-${cleanPath.replace(/\//g, '-')}-chunk-${i}`;

      try {
        const response = await fetch(`${WORKER_URL}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: chunkId, // We send the stable ID to the worker
            text: `Source: ${cleanPath}\nContent: ${text.substring(0, 3000)}`,
            lang: lang,
            path: cleanPath
          })
        });

        if (!response.ok) {
          console.error(`⚠️ Error on chunk ${i} of ${cleanPath}: ${response.status}`);
        }
      } catch (e) {
        console.error(`❌ Network error: ${e.message}`);
      }
    }
  }
  
  console.log("\n✨ Sync complete. Your AI Guide is now up to date with no duplicates.");
}

pump();