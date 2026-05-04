// REPLACE THE URL BELOW with your actual Worker URL
const WORKER_URL = 'https://ywam-guide-api.ywamsendai.workers.dev'; 

import fs from 'fs';
import { glob } from 'glob';

async function pump() {
  console.log("🚀 Starting the engine...");
  
  const files = await glob('src/content/docs/**/*.{md,mdx}');
  
  if (files.length === 0) {
    console.error("❌ No files found! Are you running this in the Guide directory?");
    return;
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lang = file.includes('/ja/') ? 'ja' : 'en';
    const cleanPath = file
      .replace('src/content/docs', '')
      .replace(/\.mdx?$/, '');

    const chunks = content.split(/\n\n+/).filter(c => c.trim().length > 40);

    console.log(`📖 Reading [${lang.toUpperCase()}]: ${cleanPath} (${chunks.length} chunks)`);

    for (const text of chunks) {
      try {
        const response = await fetch(`${WORKER_URL}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // ADDED SUBSTRING HERE TO CAP LARGE PARAGRAPHS
            text: text.trim().substring(0, 3000), 
            lang: lang,
            path: cleanPath
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`⚠️ Error in ${cleanPath}: ${response.status} - ${errorText}`);
        }
      } catch (e) {
        console.error(`❌ Network error on ${cleanPath}: ${e.message}`);
      }
    }
  }
  
  console.log("\n✨ Transformation complete. The AI is now a Sendai Guide expert.");
}

pump();