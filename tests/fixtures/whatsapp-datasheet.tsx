import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MockDatasheetDialog } from '../../components/whatsapp/MockDatasheetDialog';
import { createMockRepository } from '../../lib/whatsapp/repository';

function Fixture() {
  const [repo] = useState(() => createMockRepository(1800000000000));
  const [scenario, setScenario] = useState('seller');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [last, setLast] = useState('ninguno');
  const chat = repo.get(scenario === 'closed' ? 'demo-4' : scenario === 'waiting' ? 'demo-1' : 'demo-3')!;
  return <>
    <label>Escenario<select value={scenario} onChange={event => setScenario(event.target.value)}>
      <option value="seller">Disponible</option><option value="waiting">Sin tomar</option>
      <option value="closed">Cerrada</option><option value="expired">Plazo vencido</option>
      <option value="reject">Rechazar confirmación</option>
    </select></label>
    <button onClick={() => setOpen(true)}>Enviar ficha técnica</button>
    <output aria-label="Confirmaciones">{count}</output>
    <output aria-label="Último documento">{last}</output>
    <output aria-label="Mensajes sin cambios">{JSON.stringify(chat.messages)}</output>
    <MockDatasheetDialog key={scenario} chat={chat} open={open} onClose={() => setOpen(false)}
      canSend={scenario === 'seller' || scenario === 'reject'} onConfirm={id => {
        setCount(value => value + 1);
        setLast(id);
        return scenario !== 'reject';
      }} />
  </>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
