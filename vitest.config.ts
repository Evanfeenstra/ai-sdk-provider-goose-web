import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'examples/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
    },
    // Define projects for different environments
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts', '**/*.spec.ts'],
        },
      },
    ],
  },
});