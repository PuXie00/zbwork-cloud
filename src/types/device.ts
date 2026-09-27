export type DeviceStatus = 'normal' | 'warning' | 'alarm' | 'disabled' | 'moving';
export type DeviceType = 'single' | 'dual' | 'multi' | 'quad';
export type ViewMode = 'overview' | 'detail' | 'table';

export interface Motor {
  id: string;
  axisNumber: number;
  number: number;
  weight: number;
  maxWeight: number;
  height: number;
  deviation: number;
  status: DeviceStatus;
  speed: number;
  maxSpeed: number;
  maxDeviation: number;
  minWeight: number;
  maxHeight: number;
  minHeight: number;
  maxLoadRate: number
  minLoadRate: number
}

export interface Device {
  id: string;
  uniqueId: string;
  modelId: string;
  name: string;
  status: DeviceStatus;
  currentWeight: number;
  maxWeight: {val:number,minW:number,maxW:number,index:number};
  type: DeviceType;
  height?: number;
  maxHeight?: number;
  minHeight?: number;
  maxAngle?: number;
  minAngle?: number;
  maxDeflection?: number;
  minDeflection?: number;
  angle?: number;
  deflection?: number;
  targetHeight?: number;
  targetAngle?: number;
  targetDeflection?: number;
  hasWeight?: boolean;
  motors: Motor[];
  effectiveStatus?: DeviceStatus;
}

