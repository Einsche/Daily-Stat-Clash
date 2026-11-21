import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import appCss from '../styles.css?url'
import appMetaJson from '../app-meta.json'
import { reportHiggsfieldError } from '../lib/higgsfield-error-reporting'

declare const __HF_DESIGN_INSPECTOR__: boolean
const meta=appMetaJson
export const Route = createRootRouteWithContext<{queryClient:QueryClient}>()({
  head:()=>({meta:[{charSet:'utf-8'},{name:'viewport',content:'width=device-width, initial-scale=1'},{title:meta.og_title||'Stat Clash | Daily Character Matchup'},{name:'description',content:meta.og_description||'Choose six characters and compete daily.'},{property:'og:title',content:meta.og_title||'Stat Clash'},{property:'og:description',content:meta.og_description||'The daily character draft game'},{property:'og:image',content:meta.og_image_url||'/assets/og.png'}],links:[{rel:'stylesheet',href:appCss},{rel:'icon',href:meta.favicon_url||'/favicon.svg'},{rel:'canonical',href:'https://daily-stat-clash.higgsfield.app/'}]}),
  shellComponent:Shell,component:Root,notFoundComponent:()=> <div className="not-found"><h1>Lost in the arena?</h1><p>That page doesn't exist.</p><Link to="/">Back to the arena →</Link></div>,errorComponent:({error,reset})=><div className="not-found"><h1>Something went wrong.</h1><p>{error.message}</p><button onClick={reset}>Try again</button></div>
})
function Shell({children}:{children:ReactNode}) {return <html lang="en"><head><HeadContent/></head><body>{children}<Scripts/></body></html>}
function Root(){const {queryClient}=Route.useRouteContext();useEffect(()=>{if(!__HF_DESIGN_INSPECTOR__)return;void import('../module/design-inspector/runtime').then(({installHiggsfieldDesignInspector})=>installHiggsfieldDesignInspector()).catch(error=>reportHiggsfieldError(error instanceof Error?error:new Error('Inspector unavailable'),{boundary:'inspector'}))},[]);return <QueryClientProvider client={queryClient}><Outlet/></QueryClientProvider>}
