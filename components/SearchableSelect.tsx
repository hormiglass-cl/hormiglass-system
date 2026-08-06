'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar o seleccionar...',
  label,
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && <label className="block font-bold text-gray-700 mb-1">{label}</label>}

      {/* Select Display / Trigger Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] flex items-center justify-between cursor-pointer text-xs font-medium transition hover:border-[#F7931F] ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
        } ${isOpen ? 'ring-2 ring-[#F7931F]/30 border-[#F7931F]' : ''}`}
      >
        <span className={value ? 'font-semibold text-[#363636]' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 text-gray-400">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="hover:text-red-500 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-[#F7931F]' : ''}`} />
        </div>
      </div>

      {/* Popover Dropdown with Filter Input */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1.5 animate-fadeIn text-xs max-h-60 flex flex-col">
          <div className="relative shrink-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              autoFocus
              placeholder="Escribe para buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#363636] focus:outline-none focus:border-[#F7931F] font-medium"
            />
          </div>

          <div className="overflow-y-auto flex-1 scrollbar-thin pr-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-gray-400 font-medium text-xs">
                No se encontraron opciones
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between font-medium transition ${
                      isSelected
                        ? 'bg-orange-50 text-[#F7931F] font-bold'
                        : 'text-[#363636] hover:bg-gray-100'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#F7931F]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
