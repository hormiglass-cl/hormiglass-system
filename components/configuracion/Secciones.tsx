'use client';

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAjuste, ETAPAS_PIPELINE, type AjusteClave } from '../../lib/ajustes';
import { useAuth } from '../../lib/context/AuthContext';
import { createClient } from '../../lib/supabase/client';
import { ROL_NOMBRE } from '../../lib/types';
import { mensajeError } from '../../lib/errores';
import { Button, TextInput } from '../ui/crm';
import { useToast } from '../ui/feedback';

/* ─── Piezas de formulario al estilo Ajustes de iOS ──────────────────── */

export function Grupo({ titulo, pie, children }: { titulo?: string; pie?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      {titulo && <h2 className="px-4 text-xs font-medium uppercase tracking-wide text-ink-muted">{titulo}</h2>}
      <div className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line-subtle bg-surface shadow-[var(--hg-shadow-card)]">
        {children}
      </div>
      {pie && <p className="px-4 text-xs leading-relaxed text-ink-muted">{pie}</p>}
    </section>
  );
}

export function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="shrink-0 text-sm text-ink sm:w-48">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/** Campo de texto sin borde, alineado a la derecha como en iOS. */
function Entrada({ value, onChange, placeholder, type = 'text', multiline }: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  const clase = 'w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none sm:text-right';
  return multiline ? (
    <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${clase} resize-none sm:text-left`} />
  ) : (
    <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={clase} />
  );
}

/** Estado local + guardado en ajustes_sistema para una sección. */
function useFormulario<K extends AjusteClave>(clave: K) {
  const toast = useToast();
  const { valor, guardar, cargando } = useAjuste(clave);
  const [borrador, setBorrador] = useState<typeof valor | null>(null);
  const [guardando, setGuardando] = useState(false);
  const actual = borrador ?? valor;
  const sucio = borrador !== null && JSON.stringify(borrador) !== JSON.stringify(valor);

  const cambiar = (parcial: Partial<typeof valor>) => setBorrador({ ...actual, ...parcial });
  const enviar = async (validar?: (v: typeof valor) => string | null) => {
    const error = validar?.(actual);
    if (error) {
      toast({ message: error, tone: 'danger' });
      return;
    }
    setGuardando(true);
    try {
      await guardar(actual);
      setBorrador(null);
      toast({ message: 'Cambios guardados', tone: 'success' });
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo guardar. Solo el administrador puede modificar los ajustes.'), tone: 'danger' });
    } finally {
      setGuardando(false);
    }
  };
  return { actual, cambiar, enviar, sucio, guardando, cargando, descartar: () => setBorrador(null) };
}

function BarraGuardar({ sucio, guardando, onGuardar, onDescartar }: { sucio: boolean; guardando: boolean; onGuardar: () => void; onDescartar: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onDescartar} disabled={!sucio || guardando}>Descartar</Button>
      <Button variant="primary" onClick={onGuardar} disabled={!sucio || guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
    </div>
  );
}

const Contenedor = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-2xl space-y-6 pb-10">{children}</div>;

/* ─── Secciones ──────────────────────────────────────────────────────── */

export function SeccionEmpresa() {
  const f = useFormulario('empresa');
  const e = f.actual;
  return (
    <Contenedor>
      <Grupo titulo="Identidad" pie="Estos datos identifican a la empresa en el sistema y en los documentos.">
        <Fila label="Razón social"><Entrada value={e.razon_social} onChange={(v) => f.cambiar({ razon_social: v })} /></Fila>
        <Fila label="Nombre comercial"><Entrada value={e.nombre_fantasia} onChange={(v) => f.cambiar({ nombre_fantasia: v })} /></Fila>
        <Fila label="RUT"><Entrada value={e.rut} placeholder="76.123.456-7" onChange={(v) => f.cambiar({ rut: v })} /></Fila>
        <Fila label="Giro"><Entrada value={e.giro} onChange={(v) => f.cambiar({ giro: v })} /></Fila>
      </Grupo>
      <Grupo titulo="Contacto">
        <Fila label="Dirección"><Entrada value={e.direccion} onChange={(v) => f.cambiar({ direccion: v })} /></Fila>
        <Fila label="Teléfono"><Entrada value={e.telefono} type="tel" onChange={(v) => f.cambiar({ telefono: v })} /></Fila>
        <Fila label="Correo"><Entrada value={e.correo} type="email" onChange={(v) => f.cambiar({ correo: v })} /></Fila>
        <Fila label="Sitio web"><Entrada value={e.sitio_web} onChange={(v) => f.cambiar({ sitio_web: v })} /></Fila>
      </Grupo>
      <BarraGuardar sucio={f.sucio} guardando={f.guardando} onGuardar={() => void f.enviar((v) => (v.razon_social.trim() ? null : 'La razón social no puede quedar vacía.'))} onDescartar={f.descartar} />
    </Contenedor>
  );
}

export function SeccionCotizaciones() {
  const f = useFormulario('cotizaciones');
  const c = f.actual;
  return (
    <Contenedor>
      <Grupo titulo="Valores por defecto" pie="Se aplican al crear una cotización nueva. Las cotizaciones ya emitidas no cambian.">
        <Fila label="IVA (%)"><Entrada type="number" value={c.iva_porcentaje} onChange={(v) => f.cambiar({ iva_porcentaje: Number(v) })} /></Fila>
        <Fila label="Validez (días)"><Entrada type="number" value={c.validez_dias} onChange={(v) => f.cambiar({ validez_dias: Number(v) })} /></Fila>
        <Fila label="Condición de pago"><Entrada value={c.condicion_pago} onChange={(v) => f.cambiar({ condicion_pago: v })} /></Fila>
      </Grupo>
      <Grupo titulo="Textos" pie="Se agregan a las observaciones de cada cotización nueva.">
        <Fila label="Nota al pie"><Entrada multiline value={c.nota_pie} placeholder="Cotización oficial emitida desde CRM Hormiglass" onChange={(v) => f.cambiar({ nota_pie: v })} /></Fila>
        <Fila label="Condiciones comerciales"><Entrada multiline value={c.condiciones_comerciales} onChange={(v) => f.cambiar({ condiciones_comerciales: v })} /></Fila>
      </Grupo>
      <BarraGuardar
        sucio={f.sucio}
        guardando={f.guardando}
        onGuardar={() => void f.enviar((v) => (v.iva_porcentaje < 0 || v.iva_porcentaje > 100 ? 'El IVA debe estar entre 0 y 100.' : v.validez_dias < 1 ? 'La validez debe ser de al menos 1 día.' : null))}
        onDescartar={f.descartar}
      />
    </Contenedor>
  );
}

export function SeccionComisiones() {
  const f = useFormulario('comisiones');
  return (
    <Contenedor>
      <Grupo titulo="Comisión comercial" pie="Aplica a las oportunidades nuevas. Las oportunidades existentes conservan el porcentaje con que se crearon.">
        <Fila label="Porcentaje por defecto (%)">
          <Entrada type="number" value={f.actual.porcentaje_defecto} onChange={(v) => f.cambiar({ porcentaje_defecto: Number(v) })} />
        </Fila>
      </Grupo>
      <BarraGuardar
        sucio={f.sucio}
        guardando={f.guardando}
        onGuardar={() => void f.enviar((v) => (v.porcentaje_defecto < 0 || v.porcentaje_defecto > 100 ? 'El porcentaje debe estar entre 0 y 100.' : null))}
        onDescartar={f.descartar}
      />
    </Contenedor>
  );
}

function EditorLista({ clave, titulo, pie, etiqueta }: { clave: 'origenes' | 'tipos_venta'; titulo: string; pie: string; etiqueta: string }) {
  const f = useFormulario(clave);
  const [nuevo, setNuevo] = useState('');
  const lista = f.actual.lista as string[];
  const set = (l: string[]) => f.cambiar({ lista: l } as never);
  const agregar = () => {
    const v = nuevo.trim();
    if (!v || lista.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set([...lista, v]);
    setNuevo('');
  };
  return (
    <Contenedor>
      <Grupo titulo={titulo} pie={pie}>
        {lista.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <input
              value={item}
              aria-label={`${etiqueta} ${i + 1}`}
              onChange={(e) => set(lista.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink focus:outline-none"
            />
            <button type="button" aria-label={`Quitar ${item}`} onClick={() => set(lista.filter((_, j) => j !== i))} className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-ink-muted transition hover:bg-danger-soft hover:text-danger">
              <X size={15} aria-hidden />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-4 py-2">
          <TextInput value={nuevo} placeholder={`Agregar ${etiqueta.toLowerCase()}…`} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} />
          <Button icon={Plus} onClick={agregar} disabled={!nuevo.trim()}>Agregar</Button>
        </div>
      </Grupo>
      <BarraGuardar
        sucio={f.sucio}
        guardando={f.guardando}
        onGuardar={() => void f.enviar((v) => {
          const l = (v.lista as string[]).map((x) => x.trim());
          if (l.some((x) => !x)) return 'Hay elementos vacíos en la lista.';
          if (l.length === 0) return 'Debe quedar al menos un elemento.';
          if (new Set(l.map((x) => x.toLowerCase())).size !== l.length) return 'Hay elementos repetidos.';
          return null;
        })}
        onDescartar={f.descartar}
      />
    </Contenedor>
  );
}

export const SeccionOrigenes = () => (
  <EditorLista clave="origenes" etiqueta="Origen" titulo="Orígenes de oportunidad" pie="Aparecen al crear una oportunidad y en su ficha. Renombrar o quitar un origen no cambia las oportunidades que ya lo usan." />
);
export const SeccionTiposVenta = () => (
  <EditorLista clave="tipos_venta" etiqueta="Tipo" titulo="Tipos de venta" pie="Aparecen al crear oportunidades y clientes. Las rutas del pipeline siguen reconociendo «Instalación», «Suministro» y «Reventa de Material»; no los renombres si ya hay ventas con ese tipo." />
);

/* ─── Avisos y recordatorios ─────────────────────────────────────────── */

export function Interruptor({ label, activo, onChange }: { label: string; activo: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={label}
        onClick={() => onChange(!activo)}
        className={`relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors ${activo ? 'bg-success' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${activo ? 'left-[20px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export function SeccionAvisos() {
  const f = useFormulario('avisos');
  return (
    <Contenedor>
      <Grupo titulo="Avisos automáticos" pie="Si lo desactivas, el sistema deja de generar avisos de seguimiento y borra los que estaban pendientes.">
        <Interruptor label="Avisos de seguimiento comercial" activo={f.actual.seguimiento_activo} onChange={(v) => f.cambiar({ seguimiento_activo: v })} />
      </Grupo>
      <Grupo titulo="Bandeja" pie="Los avisos leídos más antiguos que este plazo dejan de mostrarse en la bandeja. Usa 0 para mostrarlos siempre.">
        <Fila label="Conservar leídos (días)">
          <Entrada type="number" value={f.actual.conservar_leidos_dias} onChange={(v) => f.cambiar({ conservar_leidos_dias: Number(v) })} />
        </Fila>
      </Grupo>
      <BarraGuardar
        sucio={f.sucio}
        guardando={f.guardando}
        onGuardar={() => void f.enviar((v) => (v.conservar_leidos_dias < 0 ? 'Los días no pueden ser negativos.' : null))}
        onDescartar={f.descartar}
      />
    </Contenedor>
  );
}

export function SeccionRecordatorios() {
  const f = useFormulario('recordatorios');
  return (
    <Contenedor>
      <Grupo titulo="Seguimiento comercial" pie="Con cuántas horas de anticipación avisa el sistema de la próxima acción de una oportunidad. Los seguimientos vencidos se avisan siempre.">
        <Fila label="Anticipación (horas)">
          <Entrada type="number" value={f.actual.anticipacion_horas} onChange={(v) => f.cambiar({ anticipacion_horas: Number(v) })} />
        </Fila>
      </Grupo>
      <BarraGuardar
        sucio={f.sucio}
        guardando={f.guardando}
        onGuardar={() => void f.enviar((v) => (v.anticipacion_horas < 0 || v.anticipacion_horas > 720 ? 'La anticipación debe estar entre 0 y 720 horas.' : null))}
        onDescartar={f.descartar}
      />
    </Contenedor>
  );
}

/* ─── Pipeline ───────────────────────────────────────────────────────── */

export function SeccionPipeline() {
  const f = useFormulario('pipeline_etapas');
  const nombres = f.actual.nombres;
  const secciones = Array.from(new Set(ETAPAS_PIPELINE.map((e) => e.seccion)));
  return (
    <Contenedor>
      {secciones.map((sec) => (
        <Grupo
          key={sec}
          titulo={sec}
          pie={sec === secciones[0] ? 'Cambia cómo se llama cada etapa en el pipeline. Déjalo vacío para usar el nombre original. El orden y las reglas de cada etapa no cambian.' : undefined}
        >
          {ETAPAS_PIPELINE.filter((e) => e.seccion === sec).map((e) => (
            <Fila key={e.id} label={e.label}>
              <Entrada
                value={nombres[e.id] ?? ''}
                placeholder={e.label}
                onChange={(v) => {
                  const siguiente = { ...nombres };
                  if (v) siguiente[e.id] = v;
                  else delete siguiente[e.id];
                  f.cambiar({ nombres: siguiente });
                }}
              />
            </Fila>
          ))}
        </Grupo>
      ))}
      <BarraGuardar sucio={f.sucio} guardando={f.guardando} onGuardar={() => void f.enviar()} onDescartar={f.descartar} />
    </Contenedor>
  );
}

/* ─── Mi perfil y seguridad ──────────────────────────────────────────── */

export function SeccionPerfil() {
  const { currentUser, updateUser } = useAuth();
  const toast = useToast();
  const [nombre, setNombre] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  if (!currentUser) return null;
  const valor = nombre ?? currentUser.nombre;
  const sucio = valor.trim() !== currentUser.nombre && valor.trim().length > 0;
  const guardar = async () => {
    setGuardando(true);
    try {
      await updateUser(currentUser.id, { nombre: valor.trim() });
      setNombre(null);
      toast({ message: 'Perfil actualizado', tone: 'success' });
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo actualizar el perfil.'), tone: 'danger' });
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Contenedor>
      <Grupo titulo="Mis datos">
        <Fila label="Nombre"><Entrada value={valor} onChange={setNombre} /></Fila>
        <Fila label="Correo"><span className="block text-sm text-ink-muted sm:text-right">{currentUser.email}</span></Fila>
        <Fila label="Rol"><span className="block text-sm text-ink-muted sm:text-right">{ROL_NOMBRE[currentUser.rol] ?? currentUser.rol}</span></Fila>
      </Grupo>
      <BarraGuardar sucio={sucio} guardando={guardando} onGuardar={() => void guardar()} onDescartar={() => setNombre(null)} />
    </Contenedor>
  );
}

export function SeccionSeguridad() {
  const supabase = React.useMemo(() => createClient(), []);
  const toast = useToast();
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = async () => {
    if (nueva.length < 8) return toast({ message: 'La contraseña debe tener al menos 8 caracteres.', tone: 'danger' });
    if (nueva !== confirmar) return toast({ message: 'Las contraseñas no coinciden.', tone: 'danger' });
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (error) return toast({ message: mensajeError(error, 'No se pudo cambiar la contraseña.'), tone: 'danger' });
    setNueva('');
    setConfirmar('');
    toast({ message: 'Contraseña actualizada', tone: 'success' });
  };
  const cerrarOtras = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    toast(error ? { message: mensajeError(error, 'No se pudieron cerrar las otras sesiones.'), tone: 'danger' } : { message: 'Se cerraron las sesiones en otros dispositivos', tone: 'success' });
  };
  return (
    <Contenedor>
      <Grupo titulo="Contraseña" pie="Mínimo 8 caracteres.">
        <Fila label="Nueva contraseña"><Entrada type="password" value={nueva} onChange={setNueva} /></Fila>
        <Fila label="Confirmar"><Entrada type="password" value={confirmar} onChange={setConfirmar} /></Fila>
      </Grupo>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => void cambiar()} disabled={guardando || !nueva}>{guardando ? 'Guardando…' : 'Cambiar contraseña'}</Button>
      </div>
      <Grupo titulo="Sesiones" pie="Cierra tu sesión en todos los demás navegadores y dispositivos; esta sigue abierta.">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-ink">Cerrar sesión en otros dispositivos</span>
          <Button onClick={() => void cerrarOtras()}>Cerrar</Button>
        </div>
      </Grupo>
    </Contenedor>
  );
}
