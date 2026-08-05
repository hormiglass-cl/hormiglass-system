## Error Type
Console Error

## Error Message
Encountered two children with the same key, `sys-op-10`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.


    at tr (<anonymous>:null:null)
    at eval (app/configuracion/page.tsx:477:21)
    at Array.map (<anonymous>:null:null)
    at ConfiguracionPage (app/configuracion/page.tsx:476:34)

## Code Frame
  475 |                 ) : (
  476 |                   filteredFields.map((f) => (
> 477 |                     <tr key={f.id} className="hover:bg-orange-50/40 transition">
      |                     ^
  478 |                       <td className="py-4 px-6 font-extrabold text-[#363636]">
  479 |                         {f.nombre}
  480 |                       </td>

Next.js version: 16.2.10 (Webpack)

--

## Error Type
Console Error

## Error Message
Encountered two children with the same key, `sys-op-11`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.


    at tr (<anonymous>:null:null)
    at eval (app/configuracion/page.tsx:477:21)
    at Array.map (<anonymous>:null:null)
    at ConfiguracionPage (app/configuracion/page.tsx:476:34)

## Code Frame
  475 |                 ) : (
  476 |                   filteredFields.map((f) => (
> 477 |                     <tr key={f.id} className="hover:bg-orange-50/40 transition">
      |                     ^
  478 |                       <td className="py-4 px-6 font-extrabold text-[#363636]">
  479 |                         {f.nombre}
  480 |                       </td>

Next.js version: 16.2.10 (Webpack)
