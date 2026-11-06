import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MockQuoteDialog } from '../../components/whatsapp/MockQuoteDialog';
import { createMockRepository } from '../../lib/whatsapp/repository';

const repository = createMockRepository(1000);
const chat = repository.list()[1]; // Preparation does not require claiming the chat.
const original = JSON.stringify(chat);
function Fixture() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Crear cotización</button>
    <output aria-label="Chat original">{original}</output>
    <output aria-label="Chat actual">{JSON.stringify(chat)}</output>
    <output aria-label="Repositorio actual">{JSON.stringify(repository.get(chat.id))}</output>
    <MockQuoteDialog chat={chat} open={open} onClose={() => setOpen(false)} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
