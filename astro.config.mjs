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
        label: 'About',
        translations: { 'ja': 'について' },
        autogenerate: { directory: 'about' },
      },
      {
        label: 'Community',
        translations: { 'ja': 'コミュニティー' },
        autogenerate: { directory: 'community' },
      },
      {
        label: 'Schools',
        translations: { 'ja': '学校' },
        autogenerate: { directory: 'schools' },
      },
      {
        label: 'Wellbeing',
        translations: { 'ja': '福祉' },
        autogenerate: { directory: 'wellbeing' },
      },
      {
        label: 'Your Role',
        translations: { 'ja': 'あなたの役割' },
        items: [
          { 
            label: 'Staff', 
            translations: { 'ja': 'スタッフ' },
            autogenerate: { directory: 'roles/staff' },
            collapsed: true 
          },
          { 
            label: 'Students', 
            translations: { 'ja': '生徒' },
            autogenerate: { directory: 'roles/students' },
            collapsed: true 
          },
          { 
            label: 'Short-term', 
            translations: { 'ja': '短期' },
            autogenerate: { directory: 'roles/short-term' },
            collapsed: true 
          },
        ],
      },
      {
        label: 'Apply',
        translations: { 'ja': '応募' },
        autogenerate: { directory: 'apply' },
        collapsed: true,
      },
      {
        label: 'Finance',
        translations: { 'ja': '財務' },
        autogenerate: { directory: 'finance' },
        collapsed: true,
      },
      {
        label: 'Giving',
        translations: { 'ja': '寄付' },
        autogenerate: { directory: 'giving' },
        collapsed: true,
      },
      {
        label: 'Contact',
        translations: { 'ja': 'お問い合わせ' },
        autogenerate: { directory: 'contact' },
        collapsed: true,
      },
      {
        label: 'History',
        translations: { 'ja': '歴史' },
        autogenerate: { directory: 'history' },
        collapsed: true,
      },
      {
        label: 'YWAM Global',
        translations: { 'ja': 'YWAM Global' },
        autogenerate: { directory: 'ywam' },
        collapsed: true,
      },
      {
        label: 'Appendix',
        translations: { 'ja': '付録' },
        autogenerate: { directory: 'appendix' },
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