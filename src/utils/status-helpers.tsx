import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Move, XCircle } from 'lucide-react';
import { DeviceStatus, Motor } from '../types/device';

export const getStatusColor = (status: DeviceStatus) => {
  switch (status) {
    case 'normal': return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
    case 'warning': return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
    case 'alarm': return 'bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.6)] animate-pulse';
    case 'moving': return 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]';
    case 'disabled': return 'bg-slate-600';
  }
};

export const getStatusBorder = (status: DeviceStatus) => {
  switch (status) {
    case 'normal': return 'border-emerald-500/50';
    case 'warning': return 'border-amber-500/50';
    case 'alarm': return 'border-rose-600/80';
    case 'disabled': return 'border-slate-600/50';
    case 'moving': return 'border-blue-500/50';
  }
};

export const getStatusBg = (status: DeviceStatus) => {
  switch (status) {
    case 'normal': return '';
    case 'warning': return 'bg-amber-500';
    case 'alarm': return 'bg-rose-500';
    case 'disabled': return 'bg-slate-500';
    case 'moving': return 'bg-blue-500';
  }
};

export const getStatusIcon = (status: DeviceStatus) => {
  switch (status) {
    case 'normal': return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
    case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />;
    case 'alarm': return <Activity className="w-6 h-6 text-rose-500 animate-bounce" />;
    case 'disabled': return <XCircle className="w-6 h-6 text-slate-500" />;
    case 'moving': return <Move className="w-6 h-6 text-blue-500" />;
  }
};

export const getStatusText = (status: DeviceStatus): string => {
  switch (status) {
    case 'normal': return '正常';
    case 'warning': return '预警';
    case 'alarm': return '报警';
    case 'disabled': return '禁用';
    case 'moving': return '移动';
  }
};

export const getEffectiveStatus = (motors: Motor[]): DeviceStatus => {
  if (motors.some(m => m.status === 'alarm')) return 'alarm';
  if (motors.some(m => m.status === 'warning')) return 'warning';
  if (motors.every(m => m.status === 'disabled')) return 'disabled';
  if (motors.some(m => m.status === 'moving')) return 'moving';
  return 'normal';
};

export const formatValue = (val: number, unit: string) => `${val}${unit}`;

