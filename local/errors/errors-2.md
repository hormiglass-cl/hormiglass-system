## Error Type
Console Error

## Error Message
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch

  ...
    <HotReload globalError={[...]} webSocket={WebSocket} staticIndicatorState={{pathname:null, ...}}>
      <AppDevOverlayErrorBoundary globalError={[...]}>
        <ReplaySsrOnlyErrors>
        <DevRootHTTPAccessFallbackBoundary>
          <HTTPAccessFallbackBoundary notFound={<NotAllowedRootHTTPFallbackError>}>
            <HTTPAccessFallbackErrorBoundary pathname="/clientes/..." notFound={<NotAllowedRootHTTPFallbackError>} ...>
              <RedirectBoundary>
                <RedirectErrorBoundary router={{...}}>
                  <Head>
                  <__next_root_layout_boundary__>
                    <SegmentViewNode type="layout" pagePath="layout.tsx">
                      <SegmentTrieNode>
                      <link>
                      <script>
                      <script>
                      <script>
                      <script>
                      <script>
                      <RootLayout>
                        <html lang="es">
                          <body
                            className="bg-white text-[#363636] min-h-screen antialiased font-sans"
-                           cz-shortcut-listen="true"
                          >
                  ...



    at createConsoleError (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_1ybzpk2._.js:2379:71)
    at handleConsoleError (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_1ybzpk2._.js:3165:54)
    at console.error (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_1ybzpk2._.js:3312:57)
    at <unknown> (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:3439:25)
    at runWithFiberInDEV (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:965:74)
    at emitPendingHydrationWarnings (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:3438:13)
    at completeWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:6885:102)
    at runWithFiberInDEV (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:965:131)
    at completeUnitOfWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9622:23)
    at performUnitOfWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9557:28)
    at workLoopConcurrentByScheduler (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9551:58)
    at renderRootConcurrent (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9534:71)
    at performWorkOnRoot (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9061:150)
    at performWorkOnRootViaSchedulerTask (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:10255:9)
    at MessagePort.performWorkUntilDeadline (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_1amofcm._.js:2647:64)
    at body (<anonymous>:null:null)
    at RootLayout (about://React/Server/file:///Users/jesusrodriguez/Claude%20Code/projects/hormiglass-system/.next/dev/server/chunks/ssr/_0hk1-6c._.js?1:150:270)

Next.js version: 16.2.10 (Turbopack)
