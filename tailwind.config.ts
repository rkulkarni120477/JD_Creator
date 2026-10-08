import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0f172a',
          slate: '#1e293b',
          mist: '#f8fafc',
          ink: '#0f172a',
          accent: '#c4b5fd'
        }
      },
      boxShadow: {
        soft: '0 12px 24px -18px rgba(15, 23, 42, 0.35)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem'
      }
    }
  },
  plugins: []
};

export default config;
