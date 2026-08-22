
## Error Type

Console Error

## Error Message

Ya existe una orden de compra con el numero IMC-240.

    at saveOrdenToBackend (components/OrdenCompraModal.tsx:270:15)
    at async handleSubmit (components/OrdenCompraModal.tsx:382:5)

## Code Frame

  268 |       if (duplicateError) throw new Error(duplicateError.message);
  269 |       if (duplicateOrden) {

> 270 |         throw new Error(`Ya existe una orden de compra con el numero ${finalNumeroOc}.`);
> |               ^
> 271 |       }
> 272 |
> 273 |       const payload = {

Next.js version: 16.2.10 (Webpack)
