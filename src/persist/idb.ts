import type { Workspace } from '../domain/workspace'

const DB_NAME = 'pmo-offline'
const STORE = 'drafts'
const KEY = 'workspace-v2'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDraft(workspace: Workspace | object): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(workspace, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadDraft(): Promise<Workspace | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  const data = await new Promise<Workspace | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as Workspace | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  if (!data || data.version !== 2 || !Array.isArray(data.scenarios)) return null
  return data
}
