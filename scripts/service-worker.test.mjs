import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { buildServiceWorker } from './build-service-worker.mjs'

async function fixture(t, basePath = '/training-log/') {
  const directory = await mkdtemp(join(tmpdir(), 'training-log-sw-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'assets'))
  await mkdir(join(directory, 'icons'))
  await writeFile(join(directory, 'index.html'), '<html>Training Log</html>')
  await writeFile(join(directory, 'manifest.webmanifest'), '{"name":"Training Log"}')
  await writeFile(join(directory, 'assets/app-abc123.js'), 'console.log("app")')
  await writeFile(join(directory, 'icons/icon.svg'), '<svg/>')
  const result = await buildServiceWorker({ directory, basePath })
  const source = await readFile(join(directory, 'sw.js'), 'utf8')
  return { directory, source, result }
}

function environment(
  source,
  { scope = 'https://samuel-132.github.io/training-log/', offline = false, addAllError } = {},
) {
  const handlers = new Map()
  const stores = new Map()
  const requests = []
  const deletedCaches = []
  let skipped = 0
  let claimed = 0
  let isOffline = offline
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        async addAll(inputs) {
          if (addAllError) throw addAllError
          for (const input of inputs) {
            assert.equal(input.cache, 'reload')
            store.set(input.url, `cached:${new URL(input.url).pathname}`)
          }
        },
        async match(input) {
          return store.get(typeof input === 'string' ? input : input.url)
        },
      }
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name) {
      deletedCaches.push(name)
      return stores.delete(name)
    },
  }
  vm.runInNewContext(source, {
    URL,
    Request,
    Set,
    caches,
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      clients: {
        async claim() {
          claimed++
        },
      },
      async skipWaiting() {
        skipped++
      },
      addEventListener(type, handler) {
        handlers.set(type, handler)
      },
    },
    async fetch(request) {
      requests.push(request.url)
      if (isOffline) throw new Error('Offline')
      return `network:${request.url}`
    },
  })
  return {
    stores,
    requests,
    deletedCaches,
    get skipped() {
      return skipped
    },
    get claimed() {
      return claimed
    },
    setOffline(value) {
      isOffline = value
    },
    async dispatch(type, values = {}) {
      let promise
      let intercepted = false
      handlers.get(type)({
        ...values,
        waitUntil(value) {
          promise = value
        },
        respondWith(value) {
          intercepted = true
          promise = value
        },
      })
      return { intercepted, response: await promise }
    },
  }
}

const request = (url, { method = 'GET', mode = 'cors' } = {}) => ({ url, method, mode })

test('build includes recursive assets, normalizes base and deterministically versions file contents', async (t) => {
  const { directory, result, source } = await fixture(t, '/training-log')
  assert.equal(result.basePath, '/training-log/')
  assert.equal(result.files, 4)
  assert.match(source, /\/training-log\/assets\/app-abc123\.js/)
  const rebuilt = await buildServiceWorker({ directory, basePath: '/training-log/' })
  assert.equal(rebuilt.version, result.version)
  assert.equal(rebuilt.files, 4, 'the worker itself must not be cached')
  await writeFile(join(directory, 'assets/app-abc123.js'), 'console.log("changed")')
  const changed = await buildServiceWorker({ directory, basePath: '/training-log/' })
  assert.notEqual(changed.version, result.version)
  await assert.rejects(
    buildServiceWorker({ directory, basePath: 'https://example.com/' }),
    /BASE_PATH/,
  )
  await assert.rejects(buildServiceWorker({ directory, basePath: '/../other/' }), /BASE_PATH/)
})

test('build supports root hosting and refuses an incomplete build', async (t) => {
  const { directory, source } = await fixture(t, '/')
  assert.match(source, /"\/index.html"/)
  await rm(join(directory, 'manifest.webmanifest'))
  await assert.rejects(buildServiceWorker({ directory }), /manifest.webmanifest/)
})

test('install precaches the emitted shell and assets without activating a waiting update', async (t) => {
  const { source } = await fixture(t)
  const worker = environment(source)
  await worker.dispatch('install')
  assert.equal(worker.stores.size, 1)
  assert.equal([...worker.stores.values()][0].size, 4)
  assert.equal(worker.skipped, 0)
  await worker.dispatch('message', { data: { type: 'UNKNOWN' } })
  assert.equal(worker.skipped, 0)
  await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } })
  assert.equal(worker.skipped, 1)
})

test('a failed first install rejects without activation or deletion of existing caches', async (t) => {
  const { source } = await fixture(t)
  const networkError = new Error('Network unavailable')
  const worker = environment(source, { offline: true, addAllError: networkError })
  const existingName =
    'training-log-pwa:https%3A%2F%2Fsamuel-132.github.io%2Ftraining-log%2F:existing-build'
  const existingData = new Map([
    ['https://samuel-132.github.io/training-log/index.html', 'old shell'],
  ])
  const unrelatedData = new Map([['https://samuel-132.github.io/other/', 'other app']])
  worker.stores.set(existingName, existingData)
  worker.stores.set('unrelated-app-cache', unrelatedData)

  await assert.rejects(worker.dispatch('install'), (error) => error === networkError)

  assert.equal(worker.skipped, 0)
  assert.equal(worker.claimed, 0)
  assert.deepEqual(worker.deletedCaches, [])
  assert.equal(worker.stores.get(existingName), existingData)
  assert.equal(worker.stores.get('unrelated-app-cache'), unrelatedData)
  assert.equal(
    existingData.get('https://samuel-132.github.io/training-log/index.html'),
    'old shell',
  )
  assert.equal(unrelatedData.get('https://samuel-132.github.io/other/'), 'other app')
})

test('an installed worker serves in-scope navigations and known assets while offline', async (t) => {
  const { source } = await fixture(t)
  const worker = environment(source)
  await worker.dispatch('install')
  worker.setOffline(true)
  const navigation = await worker.dispatch('fetch', {
    request: request('https://samuel-132.github.io/training-log/exercises/curl?view=history', {
      mode: 'navigate',
    }),
  })
  assert.equal(navigation.intercepted, true)
  assert.equal(navigation.response, 'cached:/training-log/index.html')
  const asset = await worker.dispatch('fetch', {
    request: request('https://samuel-132.github.io/training-log/assets/app-abc123.js'),
  })
  assert.equal(asset.intercepted, true)
  assert.equal(asset.response, 'cached:/training-log/assets/app-abc123.js')
  assert.deepEqual(worker.requests, [])
})

test('does not intercept another app, an external origin, non-GET requests, or unknown APIs', async (t) => {
  const { source } = await fixture(t)
  const worker = environment(source)
  await worker.dispatch('install')
  for (const input of [
    request('https://samuel-132.github.io/another-app/', { mode: 'navigate' }),
    request('https://samuel-132.github.io/training-log-other/', { mode: 'navigate' }),
    request('https://external.example/training-log/', { mode: 'navigate' }),
    request('https://samuel-132.github.io/training-log/assets/app-abc123.js', { method: 'POST' }),
    request('https://samuel-132.github.io/training-log/api/private-data'),
    request('https://samuel-132.github.io/training-log/assets/unknown.js'),
  ]) {
    assert.equal((await worker.dispatch('fetch', { request: input })).intercepted, false)
  }
  assert.deepEqual(worker.requests, [])
  assert.equal([...worker.stores.values()][0].size, 4)
})

test('falls back to network on a cache miss without caching runtime or personal data', async (t) => {
  const { source } = await fixture(t)
  const worker = environment(source)
  await worker.dispatch('install')
  const store = [...worker.stores.values()][0]
  store.delete('https://samuel-132.github.io/training-log/assets/app-abc123.js')
  const response = await worker.dispatch('fetch', {
    request: request('https://samuel-132.github.io/training-log/assets/app-abc123.js'),
  })
  assert.equal(
    response.response,
    'network:https://samuel-132.github.io/training-log/assets/app-abc123.js',
  )
  assert.equal(store.size, 3)
})

test('activation removes only obsolete caches for this exact registration scope', async (t) => {
  const { source } = await fixture(t)
  const worker = environment(source)
  await worker.dispatch('install')
  const currentName = [...worker.stores.keys()][0]
  const prefix = 'training-log-pwa:https%3A%2F%2Fsamuel-132.github.io%2Ftraining-log%2F:'
  const otherScope = 'training-log-pwa:https%3A%2F%2Fsamuel-132.github.io%2Fanother-app%2F:old'
  worker.stores.set(`${prefix}obsolete-build`, new Map())
  worker.stores.set(otherScope, new Map())
  worker.stores.set('unrelated-app-cache', new Map())
  await worker.dispatch('activate')
  assert.deepEqual(
    [...worker.stores.keys()].sort(),
    [currentName, otherScope, 'unrelated-app-cache'].sort(),
  )
  assert.equal(worker.claimed, 1)
  assert.equal(worker.skipped, 0)
})
