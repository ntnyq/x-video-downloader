import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig } from 'bumpp'
import { prepareReleaseChangelog } from './scripts/prepareRelease'

export default defineConfig({
  files: ['package.json'],
  noGitCheck: false,
  /**
   * Synchronizes and checks release notes before bumpp commits, tags or pushes.
   */
  execute(operation) {
    const cwd = operation.options.cwd
    const files = prepareReleaseChangelog(cwd)

    execFileSync('pnpm', ['release:check'], { cwd, stdio: 'inherit' })
    operation.update({
      updatedFiles: [
        ...operation.state.updatedFiles,
        ...files.map(path => resolve(cwd, path)),
      ],
    })
  },
})
