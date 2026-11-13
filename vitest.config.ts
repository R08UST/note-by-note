import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `src/score/libraryExpression.test.ts` parses a sample of the bundled scores. A few of
    // them are megabytes of MusicXML, and happy-dom keeps a DOM tree for each parsed
    // document, so a worker needs more heap than Node's default.
    execArgv: ['--max-old-space-size=8192'],
  },
})
