'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

/* Pantallas de acceso (login, recuperar, nueva contraseña).
   Escena propia sobre carbón de marca (#363636) con brillo naranja de horizonte.
   Los tokens de la app son solo claros; esta escena define los suyos aquí y no
   toca globals.css (salvo el anillo de foco, que necesita más luz sobre fondo oscuro). */

const FIELD =
  'w-full min-h-11 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[14px] text-white placeholder:text-[#a9a59d] transition-colors hover:border-white/25 focus-visible:border-[#f7931f]';

export const authPrimaryButton =
  'w-full min-h-12 rounded-xl bg-gradient-to-b from-[#fbab45] to-[#f7931f] text-[#363636] text-[13px] font-semibold uppercase tracking-[0.08em] ' +
  'shadow-[0_10px_28px_-10px_rgba(247,147,31,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] transition-[filter,opacity] ' +
  'hover:brightness-95 disabled:opacity-50 flex items-center justify-center gap-2 px-4';

export const authSecondaryButton =
  'w-full min-h-11 rounded-xl border border-white/15 bg-white/[0.06] text-[13px] font-medium text-white transition-colors hover:bg-white/10 flex items-center justify-center gap-2 px-4';

export const authLink =
  'text-[12px] font-medium text-[#ffb866] hover:text-[#ffd09b] hover:underline rounded-md px-1';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="hg-auth relative isolate min-h-screen overflow-hidden bg-[linear-gradient(180deg,#2d2b29_0%,#1d1c1b_55%,#141413_100%)] text-white">
      {/* Trama de puntos que se desvanece hacia abajo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
      />
      {/* Horizonte: arco naranja con halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[54%] -z-10 h-[120vh] w-[170vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_50%_0%,rgba(247,147,31,0.30),rgba(247,147,31,0.06)_38%,transparent_62%)] bg-[#141413] shadow-[inset_0_2px_0_rgba(255,196,128,0.55),0_-14px_70px_rgba(247,147,31,0.32)]"
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="relative mt-14 w-full max-w-[420px]">
          {/* Logo en baldosa de vidrio, montado sobre el borde superior */}
          <div className="absolute -top-12 left-1/2 z-10 grid h-24 w-24 -translate-x-1/2 place-items-center rounded-[28px] bg-gradient-to-br from-[#fff7ec] via-[#ffe2bd] to-[#f8bd78] shadow-[0_18px_40px_-12px_rgba(247,147,31,0.7),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/50">
            <Image
              src="/logo-only-h-removebg-preview.png"
              alt="Hormiglass"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
              priority
            />
          </div>

          <section
            aria-labelledby="auth-title"
            className="rounded-[28px] border border-white/12 bg-gradient-to-b from-white/[0.09] to-white/[0.02] px-6 pb-8 pt-16 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-md sm:px-8"
          >
            <header className="mb-6 text-center">
              <h1 id="auth-title" className="text-[22px] font-bold tracking-tight text-white">
                {title}
              </h1>
              {subtitle && <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-[#d2cec6]">{subtitle}</p>}
            </header>
            {children}
            {footer && <div className="mt-6 border-t border-white/10 pt-5 text-center">{footer}</div>}
          </section>
        </div>

      </div>
    </main>
  );
}

/** Carga entre pantallas de acceso: misma escena oscura, sin el esqueleto claro de la app. */
export function AuthLoading() {
  return (
    <AuthShell title="Hormiglass">
      <div aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-4">
        <div className="h-11 rounded-xl bg-white/[0.06]" />
        <div className="h-11 rounded-xl bg-white/[0.06]" />
        <div className="h-12 rounded-xl bg-white/[0.08]" />
      </div>
    </AuthShell>
  );
}

/** Código de un solo uso: un campo numérico con espaciado, apto para autocompletar del teléfono. */
export function AuthCodeField({
  id,
  label,
  length,
  value,
  onChange,
}: {
  id: string;
  label: string;
  length: number;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <FieldLabel id={id} label={label} />
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${length}}`}
        maxLength={length}
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        placeholder={'•'.repeat(length)}
        className={`${FIELD} text-center text-[22px] font-semibold tracking-[0.5em] pl-[0.5em]`}
      />
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: 'danger' | 'success'; children: React.ReactNode }) {
  const isDanger = tone === 'danger';
  const Icon = isDanger ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isDanger ? 'alert' : 'status'}
      className={`mb-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px] ${
        isDanger ? 'border-[#ff8f86]/40 bg-[#ff8f86]/10 text-[#ffc1bb]' : 'border-[#7fd6a3]/40 bg-[#7fd6a3]/10 text-[#b4ecc9]'
      }`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  /** Elemento a la derecha de la etiqueta (p. ej. "¿Olvidaste tu contraseña?"). */
  labelAction?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

function FieldLabel({ id, label, labelAction }: Pick<FieldProps, 'id' | 'label' | 'labelAction'>) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <label htmlFor={id} className="block text-[12px] font-medium text-[#d2cec6]">
        {label}
      </label>
      {labelAction}
    </div>
  );
}

export function AuthField({ id, label, labelAction, ...input }: FieldProps) {
  return (
    <div>
      <FieldLabel id={id} label={label} labelAction={labelAction} />
      <input id={id} className={FIELD} {...input} />
    </div>
  );
}

export function AuthPasswordField({ id, label, labelAction, ...input }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel id={id} label={label} labelAction={labelAction} />
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className={`${FIELD} pr-11`} {...input} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#c4c0b8] hover:text-white"
        >
          {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
