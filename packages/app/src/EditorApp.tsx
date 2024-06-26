import { FC, PropsWithChildren, useEffect, useRef } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { isProd, isServer } from '@penx/constants'
import { emitter } from '@penx/event'
import { appLoader, useLoaderStatus } from '@penx/loader'
import { useSession } from '@penx/session'
import { StoreProvider } from '@penx/store'
import { runWorker } from '@penx/worker'
import { AppProvider } from './AppProvider'
import { ClientOnly } from './components/ClientOnly'
import { Fallback } from './Fallback/Fallback'
import { HotkeyBinding } from './HotkeyBinding'
import { UserQuery } from './UserQuery'
import { HomePage } from './Workbench/HomePage/HomePage'
import { Workbench } from './Workbench/Workbench'

if (!isServer) {
  appLoader.init()

  // emitter.on('ADD_NODE', () => {
  //   const spaces = store.get(spacesAtom)
  //   const activeSpace = spaces.find((space) => space.isActive)!
  //   // TODO:
  //   store.createDoc()
  // })

  let inited = false

  setTimeout(
    () => {
      if (inited) return
      inited = true
      runWorker()
    },
    isProd ? 5000 : 3000,
  )
}

export const EditorApp = () => {
  const { isLoaded } = useLoaderStatus()
  const { data: session } = useSession()

  // console.log('======session:', session)

  if (!isLoaded) {
    return null
  }

  // console.log('render........ EditorApp')

  return (
    <>
      <HomePage />
      <ClientOnly>
        <StoreProvider>
          <ErrorBoundary fallback={<Fallback />}>
            {session && <UserQuery userId={session.userId} />}
            <HotkeyBinding />
            <AppProvider>
              <Workbench />
            </AppProvider>
          </ErrorBoundary>
        </StoreProvider>
      </ClientOnly>
    </>
  )
}
