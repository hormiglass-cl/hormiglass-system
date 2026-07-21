## Error Type
Recoverable Error

## Error Message
Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch

  ...
    <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
      <RedirectBoundary>
        <RedirectErrorBoundary router={{...}}>
          <InnerLayoutRouter url="/clientes" tree={[...]} params={{}} cacheNode={{rsc:{...}, ...}} segmentPath={[...]} ...>
            <SegmentViewNode type="page" pagePath="clientes/p...">
              <SegmentTrieNode>
              <ClientPageRoot Component={function ClientesPage} serverProvidedParams={{...}}>
                <ClientesPage params={Promise} searchParams={Promise}>
                  <div className="space-y-6 ...">
                    <div>
                    <div>
                    <div className="bg-white r...">
                      <div className="overflow-v...">
                        <table className="w-full tex...">
                          <thead>
                            <tr className="bg-[#36363...">
                              <th>
                              <th>
                              <th>
                              <th>
                              <th>
                              <th
+                               className="py-4 px-6 text-right"
-                               className="py-4 px-6"
                              >
+                               Acciones
-                               Ubicación
                          ...
                      ...
            ...
          ...



    at throwOnHydrationMismatch (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:3318:56)
    at prepareToHydrateHostInstance (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:3372:23)
    at completeWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:6922:60)
    at runWithFiberInDEV (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:965:74)
    at completeUnitOfWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9622:23)
    at performUnitOfWork (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9557:28)
    at workLoopConcurrentByScheduler (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9551:58)
    at renderRootConcurrent (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9534:71)
    at performWorkOnRoot (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:9061:150)
    at performWorkOnRootViaSchedulerTask (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_react-dom_096_9a-._.js:10255:9)
    at MessagePort.performWorkUntilDeadline (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_dist_compiled_1amofcm._.js:2647:64)
    at th (<anonymous>:null:null)
    at ClientesPage (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/_0tv4mml._.js:819:247)
    at ClientPageRoot (file:///Users/jesusrodriguez/Claude Code/projects/hormiglass-system/.next/dev/static/chunks/node_modules_next_0y4jc4a._.js:10125:50)

Next.js version: 16.2.10 (Turbopack)
