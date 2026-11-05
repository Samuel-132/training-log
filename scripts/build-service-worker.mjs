import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))

function normalizeBasePath(value) {
  const basePath = value.endsWith('/') ? value : `${value}/`
  if (
    !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath) ||
    basePath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('BASE_PATH doit être un chemin local, par exemple /training-log/.')
  }
  return basePath
}

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const relativePath = `${prefix}${entry.name}`
    if (entry.isDirectory())
      paths.push(...(await collectFiles(join(directory, entry.name), `${relativePath}/`)))
    else if (entry.isFile() && relativePath !== 'sw.js') paths.push(relativePath)
    else if (entry.isSymbolicLink())
      throw new Error(`Lien symbolique interdit dans dist : ${relativePath}`)
  }
  return paths.sort()
}

/** Build after Vite so the precache includes the exact emitted asset filenames. */
export async function buildServiceWorker({
  directory = resolve(scriptsDirectory, '../dist'),
  basePath = process.env.BASE_PATH || '/',
} = {}) {
  const base = normalizeBasePath(basePath)
  const files = await collectFiles(directory)
  for (const required of ['index.html', 'manifest.webmanifest']) {
    if (!files.includes(required)) throw new Error(`Fichier requis absent de dist : ${required}`)
  }

  const template = await readFile(join(scriptsDirectory, 'sw-template.js'), 'utf8')
  const hash = createHash('sha256').update(base).update('\0').update(template)
  for (const file of files)
    hash
      .update('\0')
      .update(file)
      .update('\0')
      .update(await readFile(join(directory, file)))
  const version = hash.digest('hex').slice(0, 24)
  const precacheUrls = files.map((file) => base + file.split('/').map(encodeURIComponent).join('/'))
  const worker = template
    .replace('__BUILD_VERSION__', () => JSON.stringify(version))
    .replace('__BASE_PATH__', () => JSON.stringify(base))
    .replace('__PRECACHE_URLS__', () => JSON.stringify(precacheUrls, null, 2))
  await writeFile(join(directory, 'sw.js'), worker)
  return { version, basePath: base, files: precacheUrls.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await buildServiceWorker()
    console.log(
      `Service worker : ${result.files} fichiers, scope ${result.basePath}, version ${result.version}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
