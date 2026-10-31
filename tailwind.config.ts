/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/client/**/*.{js,ts,jsx,tsx}',
    './src/client/index.html',
  ],
  theme: {
    extend: {
      colors: {
        // TrimNova Design System
        canvas: '#F4F6FB',
        primary: {
          DEFAULT: '#4F46E5',
          50: '#EEEEFF',
          100: '#E0E7FF',
          500: '#4F46E5',
          600: '#4338CA',
          700: '#3730A3',
        },
        slate: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9',
          50: '#F8FAFC',
        },
        emerald: {
          DEFAULT: '#10B981',
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
        },
        amber: {
          DEFAULT: '#F59E0B',
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
        },
        coral: {
          DEFAULT: '#EF4444',
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.07), 0 4px 16px 0 rgba(0,0,0,0.05)',
        'card-hover': '0 4px 24px 0 rgba(79,70,229,0.12), 0 1px 3px 0 rgba(0,0,0,0.08)',
        'elevated': '0 8px 40px 0 rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
};

