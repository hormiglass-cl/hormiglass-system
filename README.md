This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## WhatsApp frontend demo

Open `/conversaciones` to try the in-memory chat. No WhatsApp messages, CRM records or documents are sent or persisted.

| Shortcut | Demo behavior |
| --- | --- |
| **Crear cotización** | Opens a local draft with the mock client/contact/opportunity already selected. Enter items, quantities and CLP prices; review net, 19% IVA and total, then select **Guardar cotización demo**. This prepares a nonofficial draft without taking the chat or sending it. |
| **Enviar ficha técnica** | Select a fictional product/document and review its text preview and message. Take the conversation before selecting **Confirmar envío demo**; confirmation adds the preview text and a sample attachment to that mock chat only. An expired or closed chat cannot send. |
| **Agendar visita a terreno** | Existing text shortcut: fills the message box for review; it does not create a calendar visit. |

Closing/reopening the quotation dialog retains its draft for the current mounted chat. Changing chats, leaving the screen or reloading discards it. Changing chats closes any open preview. Sample datasheets contain no valid technical specifications, real PDF bytes or download links. The same shortcuts are available in the opportunity's explicitly unlinked WhatsApp demo, never against the real opportunity.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
