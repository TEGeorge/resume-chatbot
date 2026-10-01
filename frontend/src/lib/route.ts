import { useCallback, useSyncExternalStore } from 'react'

// The URL hash is the router: it survives a refresh and the back button works.
//   #/                 nothing selected
//   #/chat/<id>        a chat
//   #/library/resumes  the library (or /jobs)
export type Route =
  | { view: 'chat'; chatId: string | null }
  | { view: 'library'; tab: 'resumes' | 'jobs' }

function parse(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/')
  if (first === 'library') return { view: 'library', tab: second === 'jobs' ? 'jobs' : 'resumes' }
  if (first === 'chat' && second) return { view: 'chat', chatId: decodeURIComponent(second) }
  return { view: 'chat', chatId: null }
}

export function hrefFor(route: Route): string {
  if (route.view === 'library') return `#/library/${route.tab}`
  return route.chatId ? `#/chat/${encodeURIComponent(route.chatId)}` : '#/'
}

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const navigate = useCallback((route: Route) => {
    window.location.hash = hrefFor(route)
  }, [])
  return [parse(hash), navigate]
}

// Back to the empty start page (used after the open chat is deleted)
export function goHome() {
  window.location.hash = hrefFor({ view: 'chat', chatId: null })
}
