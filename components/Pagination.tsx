import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white border-t border-gray-200 text-xs">
      <div className="flex items-center gap-2 text-gray-600 mb-4 sm:mb-0">
        <span>Mostrar</span>
        <select
          value={itemsPerPage}
          onChange={(e) => {
            onItemsPerPageChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-[#F7931F]"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>elementos por página</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-gray-600">
          Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-gray-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              if (
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`w-7 h-7 rounded-lg font-bold transition flex items-center justify-center ${
                      currentPage === page
                        ? 'bg-[#F7931F] text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                );
              } else if (
                page === currentPage - 2 ||
                page === currentPage + 2
              ) {
                return <span key={page} className="text-gray-400">...</span>;
              }
              return null;
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-gray-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
