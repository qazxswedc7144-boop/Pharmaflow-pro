import React, { useRef, useState, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';

export interface ColumnDef<T> {
  header: React.ReactNode;
  headerClassName?: string;
  cell: (item: T, index: number) => React.ReactNode;
  width?: string | number; // e.g. '20%', '150px', 'flex-1'
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  itemHeight?: number;
  height?: number;
  onRowClick?: (item: T, index: number) => void;
  rowClassName?: string | ((item: T, index: number) => string);
  emptyMessage?: React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
}

export function VirtualizedTable<T>({
  data,
  columns,
  itemHeight = 60,
  height = 500,
  onRowClick,
  rowClassName = '',
  emptyMessage = 'لا توجد بيانات للعرض',
  keyExtractor
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(height);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const measured = containerRef.current.clientHeight;
        if (measured > 100) {
          setContainerHeight(measured);
        }
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const effectiveHeight = containerHeight || height;

  if (data.length === 0) {
    return (
      <div className="w-full bg-white rounded-3xl border border-slate-100 p-12 text-center text-slate-300 font-black italic">
        {emptyMessage}
      </div>
    );
  }

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = data[index];
    if (!item) return null;

    const rowClass = typeof rowClassName === 'function' ? rowClassName(item, index) : rowClassName;

    return (
      <div
        style={style}
        onClick={() => onRowClick?.(item, index)}
        className={`flex items-center border-b border-slate-50 transition-colors hover:bg-slate-50/80 ${
          onRowClick ? 'cursor-pointer' : ''
        } ${rowClass}`}
      >
        {columns.map((col, cIdx) => (
          <div
            key={cIdx}
            className={`px-6 py-3 truncate ${col.headerClassName || ''}`}
            style={col.width ? { width: col.width, flexShrink: 0 } : { flex: 1 }}
          >
            {col.cell(item, index)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col dir-rtl text-right">
      {/* Header */}
      <div className="bg-[#F8FAFA] text-[#1E4D4D] font-black text-[10px] uppercase tracking-widest border-b border-slate-100 flex shrink-0">
        {columns.map((col, cIdx) => (
          <div
            key={cIdx}
            className={`px-6 py-4 font-black text-right ${col.headerClassName || ''}`}
            style={col.width ? { width: col.width, flexShrink: 0 } : { flex: 1 }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Body List */}
      <div className="flex-1 min-h-[300px] h-full" ref={containerRef}>
        <List
          height={effectiveHeight}
          itemCount={data.length}
          itemSize={itemHeight}
          width="100%"
          itemKey={(index) => (keyExtractor && data[index] ? keyExtractor(data[index]!, index) : index)}
          className="custom-scrollbar"
        >
          {Row}
        </List>
      </div>
    </div>
  );
}
