import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindv4 from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // No 'base' needed if using a subdomain like guide.ywamsendai.org
  site: 'https://guide.ywamsendai.org',
  
  integrations: [starlight({
    title: 'YWAM Sendai Guide',
    defaultLocale: 'en',
    expressiveCode: {
      themes: ['github-dark'], // Forces code blocks to stay dark
      useVariableFonts: true,
    },
    credits: false,
    locales: {
      en: { label: 'English', lang: 'en' },
      ja: { label: '日本語', lang: 'ja' },
    },
      logo: {
        src: './src/assets/ywamsendailogo.png', // Copy your logo into this repo
        replacesTitle: false,
    },
      social: [
      { 
      label: 'Main Site', 
      href: 'https://ywamsendai.org', 
      icon: 'external' 
      },
      ],
      head: [
        {
        tag: 'script',
        content: `
          // Force data-theme attribute state globally
          document.documentElement.setAttribute('data-theme', 'dark');
          
          // Intercept Starlight's mutation observers trying to toggle back to light mode
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                if (document.documentElement.getAttribute('data-theme') === 'light') {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              }
            });
          });
          observer.observe(document.documentElement, { attributes: true });
        `,
      },
    {
      tag: 'meta',
      attrs: { property: 'og:image', content: 'https://guide.ywamsendai.org/og-image.jpg' },
    },
    {
      tag: 'meta',
      attrs: { name: 'twitter:card', content: 'summary_large_image' },
    },
  ],
    sidebar: [
      {
        label: '1. Foundations',
        translations: { 'ja': '1. 基盤（ファウンデーション）' },
        autogenerate: { directory: 'foundations' },
      },
      {
        label: '2. Community Life',
        translations: { 'ja': '2. 共同体生活' },
        autogenerate: { directory: 'community' },
      },
      {
        label: '3. Training',
        translations: { 'ja': '3. 訓練' },
        autogenerate: { directory: 'training' },
      },
      {
        label: '4. Your Role',
        translations: { 'ja': '4. あなたの役割' },
        items: [
          { 
            label: 'Staff Portal', 
            translations: { 'ja': 'スタッフ・ポータル' },
            autogenerate: { directory: 'roles/staff' },
            collapsed: true 
          },
          { 
            label: 'Student Portal', 
            translations: { 'ja': '生徒・ポータル' },
            autogenerate: { directory: 'roles/students' },
            collapsed: true 
          },
          { 
            label: 'Short-term Portal', 
            translations: { 'ja': '短期・ポータル' },
            autogenerate: { directory: 'roles/short-term' },
            collapsed: true 
          },
        ],
      },
      {
        label: '5. Operations',
        translations: { 'ja': '5. オペレーション' },
        autogenerate: { directory: 'operations' },
        collapsed: true,
      },
    ],
    // Add your brand colors here to match the Vibe site
    customCss: ['./src/styles/custom.css'],
      disable404Route: true,
  }), mdx(), sitemap()],
  vite: {
    plugins: [tailwindv4()],
  },
});