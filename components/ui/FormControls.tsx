'use client';

import React from 'react';
import clsx from 'clsx';
import { SearchSelect, type SearchSelectOption } from './SearchSelect';
import { DatePicker } from './DatePicker';

/**
 * Reemplazos directos de `<select>` e `<input type="date">` nativos.
 * Mantienen la misma API (value + onChange(e) con e.target.value) pero usan
 * el buscador y el calendario del sistema.
 */

const LAYOUT_CLASS = /^((sm|md|lg|xl):)?(w-|min-w-|max-w-|col-span-|flex-1$|shrink|grow|self-)|^m[trblxy]?-/;

function layoutClasses(className?: string): string {
  if (!className) return '';
  return className.split(/\s+/).filter((c) => LAYOUT_CLASS.test(c)).join(' ');
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function collectOptions(children: React.ReactNode, out: SearchSelectOption[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; children?: React.ReactNode };
    if (child.type === 'option') {
      const label = textOf(props.children);
      out.push({ value: props.value !== undefined ? String(props.value) : label, label });
    } else if (child.type === 'optgroup' || child.type === React.Fragment) {
      collectOptions(props.children, out);
    }
  });
}

function fakeChange<T extends HTMLElement>(value: string) {
  return { target: { value }, currentTarget: { value } } as unknown as React.ChangeEvent<T>;
}

/** Input invisible que conserva la validación nativa `required` del formulario. */
function RequiredProxy({ value }: { value: string }) {
  return (
    <input
      tabIndex={-1}
      aria-hidden
      required
      value={value}
      onChange={() => {}}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
    />
  );
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  selectClassName?: string;
  value?: string | number | readonly string[] | null;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
};

export function Select({ value, onChange, children, className, required, disabled, 'aria-label': ariaLabel }: SelectProps) {
  const options: SearchSelectOption[] = [];
  collectOptions(children, options);
  const current = value == null || Array.isArray(value) ? '' : String(value);
  return (
    <div className={clsx('relative min-w-0', layoutClasses(className))}>
      <SearchSelect
        value={current}
        onChange={(v) => onChange?.(fakeChange<HTMLSelectElement>(v))}
        options={options}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder="Seleccionar..."
        searchPlaceholder="Buscar..."
      />
      {required && <RequiredProxy value={current} />}
    </div>
  );
}

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value?: string | null;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function DateInput({ value, onChange, className, required, disabled, placeholder, 'aria-label': ariaLabel }: DateInputProps) {
  const current = value ?? '';
  return (
    <div className={clsx('relative min-w-0', layoutClasses(className))}>
      <DatePicker
        value={current}
        onChange={(v) => onChange?.(fakeChange<HTMLInputElement>(v))}
        clearable={!required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
      />
      {required && <RequiredProxy value={current} />}
    </div>
  );
}

/** Fecha (calendario del sistema) + hora. Valor en formato `YYYY-MM-DDTHH:mm`. */
export function DateTimeInput({ value, onChange, className, required, disabled, 'aria-label': ariaLabel }: DateInputProps) {
  const [fecha = '', hora = ''] = (value ?? '').split('T');
  const emit = (f: string, h: string) => onChange?.(fakeChange<HTMLInputElement>(f ? `${f}T${h || '00:00'}` : ''));
  return (
    <div className={clsx('relative flex min-w-0 items-center gap-2', layoutClasses(className))}>
      <DatePicker
        className="min-w-0 flex-1"
        value={fecha}
        onChange={(f) => emit(f, hora)}
        clearable={!required}
        disabled={disabled}
        ariaLabel={ariaLabel}
      />
      <input
        type="time"
        aria-label={ariaLabel ? `${ariaLabel} (hora)` : 'Hora'}
        value={hora.slice(0, 5)}
        disabled={disabled || !fecha}
        onChange={(e) => emit(fecha, e.target.value)}
        className="hg-field-compact t-num w-28 shrink-0"
      />
      {required && <RequiredProxy value={value ?? ''} />}
    </div>
  );
}
