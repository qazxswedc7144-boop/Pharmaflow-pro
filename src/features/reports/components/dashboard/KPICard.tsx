import React from 'react';
import { motion } from 'motion/react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, icon, trend, color }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between"
  >
    <div>
      <p className="text-slate-500 text-xs font-bold mb-1">{title}</p>
      <h4 className="text-2xl font-black text-slate-800">{value}</h4>
      {trend && <p className="text-emerald-600 text-[10px] font-black mt-1">{trend}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color} text-white`}>
      {icon}
    </div>
  </motion.div>
);
