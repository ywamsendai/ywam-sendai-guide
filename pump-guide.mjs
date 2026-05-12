import fs from 'fs';
import { glob } from 'glob';

const WORKER_URL = process.env.WORKER_URL || 'https://ywam-guide-api.ywamsendai.workers.dev'; 

async function pump() {
  console.log("🚀 Starting the AI Data Engine...");
  
  // Find all Markdown and MDX files in the docs folder
  const files = await glob('src/content/docs/**/*.{md,mdx}');
  
  if (files.length === 0) {
    console.error("❌ No files found! Check your file path.");
    return;
  }

  for (const file of files) {
    const rawContent = fs.readFileSync(file, 'utf-8');
    
    // Determine language based on directory structure
    const lang = file.split(/[\\/]/).includes('ja') ? 'ja' : 'en';
    
    // 1. Extract Title from Frontmatter
    // We look for 'title:' and clean up any quotes
    const titleMatch = rawContent.match(/title:\s*(.*)/);
    const pageTitle = titleMatch ? titleMatch[1].replace(/['"]/g, '').trim() : 'General Info';

    // 2. Clean content: Remove frontmatter block and ensure a clean start
    // The \n* ensures we don't leave massive gaps at the top of the file
    const content = rawContent.replace(/^---[\s\S]*?---\n*/, '').trim();

    // Generate a clean path for the AI to reference (e.g., /about/values)
    const cleanPath = file
      .replace('src/content/docs', '')
      .replace(/\.mdx?$/, '');

    // 3. THE MAGIC: Split by Markdown Headers (## or ###)
    // The \r?\n handles Windows and Unix line endings
    // The (?=#{2,3}\s) looks ahead for ## or ### followed by a space
    const sections = content.split(/\r?\n(?=#{2,3}\s)/).filter(s => s.trim().length > 20);

    console.log(`📖 Syncing [${lang.toUpperCase()}]: ${pageTitle} (${sections.length} sections)`);

    for (let i = 0; i < sections.length; i++) {
      const sectionText = sections[i].trim();
      
      // 4. Inject Context: We prepend the Page Title and Language to every chunk
      // This is crucial so the AI doesn't lose context when looking at a single section
      const contextualText = `PAGE: ${pageTitle}\nLANG: ${lang}\nCONTENT: ${sectionText}`;

      // Create a stable, unique ID based on language, path, and section index
      const chunkId = `${lang}-${cleanPath.replace(/[\\/]/g, '-')}-sec-${i}`;

      try {
        const response = await fetch(`${WORKER_URL}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: chunkId,
            text: contextualText, 
            lang: lang,
            path: cleanPath
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`⚠️ Error on section ${i} of ${cleanPath}: ${response.status} - ${errText}`);
        }
      } catch (e) {
        console.error(`❌ Network error on file ${file}: ${e.message}`);
      }
    }
  }
  
  console.log("\n✨ Sync complete. Your AI Guide is now context-aware and optimized.");
}

pump();