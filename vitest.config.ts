import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        // Boots the real AppModule against the `haqdar_test` Postgres database.
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          setupFiles: ['test/support/e2e-env.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/database/data-source.ts',
        'src/database/migrations/**',
        'src/database/seeds/run-seed.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      thresholds: {
        // Branch figures are lowered by the `typeof X === 'undefined'` checks TypeScript emits
        // for decorator metadata on every entity and DTO property, not by untested logic.
        lines: 95,
        statements: 95,
        functions: 92,
        branches: 80,
        // Money, legality and safety decisions must be fully tested (PRD: calculations 100% correct).
        'src/modules/calculators/domain/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/modules/contracts/domain/contract-analyzer.ts': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/modules/safety/domain/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
      },
    },
  },
});
