import React, { useRef, useState, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';

interface VirtualizedListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight?: number;
  height?: number;
  emptyMessage?: React.ReactNode;
  className?: string;
  gridCols?: number;
}

export function VirtualizedList<T>({
  data,
  renderItem,
  itemHeight = 120,
  height = 500,
  emptyMessage = 'لا توجد عناصر للعرض',
  className = ''
}: VirtualizedListProps<T>) {
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

    return (
      <div style={style} className="pb-3 px-1">
        {renderItem(item, index)}
      </div>
    );
  };

  return (
    <div className={`w-full flex-1 min-h-[300px] ${className}`} ref={containerRef}>
      <List
        height={effectiveHeight}
        itemCount={data.length}
        itemSize={itemHeight}
        width="100%"
        className="custom-scrollbar"
      >
        {Row}
      </List>
    </div>
  );
}
