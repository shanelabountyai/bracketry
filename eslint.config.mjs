import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'src/generated/**', 'spikes/**', 'next-env.d.ts'] },
  // Spec §4: core never reaches into modules or app. This is what keeps the D-7
  // package extraction mechanical, so it is an error from the first commit.
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/modules/*', '@/modules/**', '**/modules/**'], message: 'src/core must not import from src/modules (spec §4).' },
          { group: ['@/app/*', '@/app/**', '**/app/**'], message: 'src/core must not import from src/app (spec §4).' },
        ],
      }],
    },
  },
  // D-3/D-4: the engine is pure and deterministic. No clock, no randomness, no I/O layers.
  {
    files: ['src/lib/league/**'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use mulberry32(seed) from prng.ts (D-3).' },
        { object: 'Date', property: 'now', message: 'The engine has no clock (D-3).' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'The engine has no clock (D-3).' },
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/core', '@/core/**', '@/app', '@/app/**', '@/modules', '@/modules/**', '**/core/**', '**/app/**', '**/modules/**'], message: 'src/lib/league is pure: no imports from core, app or modules (D-3).' },
          { group: ['@prisma/*', '@/generated', '@/generated/**', '**/generated/**', 'prisma'], message: 'src/lib/league is pure: no Prisma (D-3).' },
        ],
      }],
    },
  },
];

export default config;
