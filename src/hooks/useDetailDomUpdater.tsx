import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckCircle2, AlertTriangle, Activity, XCircle, Move } from 'lucide-react';
import { DeviceStatus } from '../types/device';
import { transformCache } from '../utils/transformCache';

const STATUS_ICONS: Record<DeviceStatus, string> = {
  normal: renderToStaticMarkup(<CheckCircle2 className="w-6 h-6 text-emerald-500" />),
  warning: renderToStaticMarkup(<AlertTriangle className="w-6 h-6 text-amber-500" />),
  alarm: renderToStaticMarkup(<Activity className="w-6 h-6 text-rose-500 animate-bounce" />),
  disabled: renderToStaticMarkup(<XCircle className="w-6 h-6 text-slate-500" />),
  moving: renderToStaticMarkup(<Move className="w-6 h-6 text-blue-500" />),
};

export type DevicePatch = {
  id: string;
  value?: number;
  status?: DeviceStatus;
  height?: number;
  heightPercent?: number;
  angle?: number;
  anglePercent?: number;
  deflection?: number;
  deflectionPercent?: number;
  heightTargetPercent?: number;
  angleTargetPercent?: number;
  deflectionTargetPercent?: number;
  hideHeightTarget?: boolean;
  hideAngleTarget?: boolean;
  hideDeflectionTarget?: boolean;
  hasWeight?:boolean;
};

export type MotorPatch = {
  id: string;
  value?: number;
  status?: DeviceStatus;
  height?: number;
  heightPercent?: number;
  weight?: number;
  weightPercent?: number;
  loadRatePercent?: number;
  offset?: number;
  offsetPercent?: number;
  speed?: number;
  speedPercent?: number;
  maxOffset?: number;
};

export type DetailPatch = DevicePatch & {
  motors: Map<string, MotorPatch>;
};

export type MotorDomRefs = {
  root: HTMLElement;
  statusEl: HTMLElement | null;
  heightEl: HTMLElement | null;
  heightPercentEl: HTMLElement | null;
  weightEl: HTMLElement | null;
  weightPercentEl: HTMLElement | null;
  offsetEl: HTMLElement | null;
  offsetPercentEl: HTMLElement | null;
  isVisible: boolean;
  speedEl: HTMLElement | null;
  speedPercentEl: HTMLElement | null;
};


export type DeviceDomRefs = {
  root: HTMLElement;
  valueEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  isVisible: boolean;
  heightEl: HTMLElement | null;
  heightPercentEl: HTMLElement | null;
  angleEl: HTMLElement | null;
  anglePercentEl: HTMLElement | null;
  deflectionEl: HTMLElement | null;
  deflectionPercentEl: HTMLElement | null;
  heightTargetEl: HTMLElement | null;
  angleTargetEl: HTMLElement | null;
  deflectionTargetEl: HTMLElement | null;
  statusIconEl: HTMLElement | null;
};

export type DetailDomRefs = DeviceDomRefs & {
  motors: Map<string, MotorDomRefs>;
};

const CLASS_POOL = new Map<string, string[]>();
const getClasses = (cls: string) => {
  if (!CLASS_POOL.has(cls)) CLASS_POOL.set(cls, cls.split(' ').filter(Boolean));
  return CLASS_POOL.get(cls)!;
};

const LAST_STATUS_MAP = new WeakMap<HTMLElement, string>();

const MOTION_DEBOUNCE_MS = 500;
const motionTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const markMoving = (el: HTMLElement) => {
  el.classList.remove('opacity-dark');
  const prev = motionTimers.get(el);
  if (prev) clearTimeout(prev);
  motionTimers.set(el, setTimeout(() => {
    el.classList.add('opacity-dark');
    motionTimers.delete(el);
  }, MOTION_DEBOUNCE_MS));
};

export const updateStatusClasses = (el: HTMLElement | null, status: DeviceStatus, classMap: Record<string, string>) => {
  if (!el || LAST_STATUS_MAP.get(el) === status) return;
  const prevStatus = LAST_STATUS_MAP.get(el);
  if (prevStatus && classMap[prevStatus]) getClasses(classMap[prevStatus]).forEach(c => el.classList.remove(c));
  else Object.values(classMap).forEach(cls => getClasses(cls).forEach(c => el.classList.remove(c)));
  if (classMap[status]) getClasses(classMap[status]).forEach(c => el.classList.add(c));
  LAST_STATUS_MAP.set(el, status);
};

const applyMotorLogic = (dom: MotorDomRefs, patch: MotorPatch, weightVal={
  hasWeight : false,
  isChangeWeight : false
}) => {
  const { hasWeight, isChangeWeight } = weightVal;
  if (patch.height !== undefined && dom.heightEl) {
    const valStr = String(patch.height);
    if (dom.heightEl.textContent !== valStr) {
      dom.heightEl.textContent = valStr;
      // if (dom.heightPercentEl) markMoving(dom.heightPercentEl);
    }
  }
  if (patch.heightPercent !== undefined && dom.heightPercentEl) {
    const height = `${patch.heightPercent}%`;
    if (dom.heightPercentEl.style.height !== height) {
      dom.heightPercentEl.style.height = height;
    }
  }
  if (patch.weight !== undefined && dom.weightEl) {
    const valStr = String(patch.weight);
    if (dom.weightEl.textContent !== valStr) {
      dom.weightEl.textContent = valStr;
      // if (dom.weightPercentEl) markMoving(dom.weightPercentEl);
    }
  }
  if (patch.weightPercent !== undefined && dom.weightPercentEl) {
    const height = `${patch.weightPercent}%`;
    if (dom.weightPercentEl.style.height !== height) {
      dom.weightPercentEl.style.height = height;
    }
  }
  
  if (patch.offset !== undefined && dom.offsetEl) {
    const valStr = String(patch.offset);
    if (dom.offsetEl.textContent !== valStr) dom.offsetEl.textContent = valStr;
    if (patch.maxOffset !== undefined && dom.offsetPercentEl) {
      dom.offsetPercentEl.classList.toggle('bg-amber-400!', patch.offset > patch.maxOffset * 0.8);
    }
  }
  if (patch.offsetPercent !== undefined && dom.offsetPercentEl) {
    const width = `${patch.offsetPercent}%`;
    if (dom.offsetPercentEl.style.width !== width) dom.offsetPercentEl.style.width = width;
  }
  if (patch.speed !== undefined && dom.speedEl) {
    const valStr = String(patch.speed);
    if (dom.speedEl.textContent !== valStr) {
      dom.speedEl.textContent = valStr;
      // if (dom.speedPercentEl) markMoving(dom.speedPercentEl);
    }
  }
  if (patch.speedPercent !== undefined && dom.speedPercentEl) {
    const height = `${patch.speedPercent}%`;
    if (dom.speedPercentEl.style.height !== height) dom.speedPercentEl.style.height = height;
  }
  if (patch.status !== undefined && dom.statusEl) {
    updateStatusClasses(dom.statusEl, patch.status, {
      normal: 'bg-emerald-900/30',
      warning: 'bg-amber-500',
      alarm: 'bg-rose-500',
      disabled: 'bg-slate-500'
    });
  }
};

const applyLogic = (dom: DetailDomRefs, patch: DetailPatch) => {
  if (patch.status !== undefined) {
    updateStatusClasses(dom.statusEl, patch.status, {
      normal: 'bg-emerald-500',
      warning: 'bg-amber-500',
      alarm: 'bg-rose-500',
      disabled: 'bg-slate-500',
      moving: 'bg-blue-500'
    });
    updateStatusClasses(dom.root, patch.status, {
      normal: 'border-emerald-500/50',
      warning: 'border-amber-500/50',
      alarm: 'border-rose-600/80',
      disabled: 'border-slate-600/50',
      moving: 'border-blue-500/50'
    });
    if (dom.statusIconEl) {
      const iconHtml = STATUS_ICONS[patch.status];
      if (dom.statusIconEl.innerHTML !== iconHtml) {
        dom.statusIconEl.innerHTML = iconHtml;
      }
    }
  }
  if (patch.value !== undefined && dom.valueEl) {
    const valStr = String(patch.value);
    if (dom.valueEl.textContent !== valStr) dom.valueEl.textContent = valStr;
  }
  if (patch.height !== undefined && dom.heightEl) {
    const valStr = String(patch.height);
    if (dom.heightEl.textContent !== valStr) {
      dom.heightEl.textContent = valStr;
      if (dom.heightPercentEl) markMoving(dom.heightPercentEl);
    }
  }
  if (patch.angle !== undefined && dom.angleEl) {
    const valStr = String(patch.angle);
    if (dom.angleEl.textContent !== valStr) {
      dom.angleEl.textContent = valStr;
      if (dom.anglePercentEl) markMoving(dom.anglePercentEl);
    }
  }
  if (patch.deflection !== undefined && dom.deflectionEl) {
    const valStr = String(patch.deflection);
    if (dom.deflectionEl.textContent !== valStr) {
      dom.deflectionEl.textContent = valStr;
      if (dom.deflectionPercentEl) markMoving(dom.deflectionPercentEl);
    }
  }

  if (patch.heightPercent !== undefined && dom.heightPercentEl) {
    const width = `${patch.heightPercent}%`;
    if (dom.heightPercentEl.style.width !== width) {
      dom.heightPercentEl.style.width = width;
    }
  }
  if (patch.anglePercent !== undefined && dom.anglePercentEl) {
    const width = `${patch.anglePercent}%`;
    if (dom.anglePercentEl.style.width !== width) {
      dom.anglePercentEl.style.width = width;
    }
  }
  if (patch.deflectionPercent !== undefined && dom.deflectionPercentEl) {
    const width = `${patch.deflectionPercent}%`;
    if (dom.deflectionPercentEl.style.width !== width) {
      dom.deflectionPercentEl.style.width = width;
    }
  }

  if (patch.heightTargetPercent !== undefined && dom.heightTargetEl) {
    dom.heightTargetEl.classList.remove('hidden');
    const left = `${patch.heightTargetPercent}%`;
    if (dom.heightTargetEl.style.left !== left) dom.heightTargetEl.style.left = left;
  }
  if (patch.hideHeightTarget && dom.heightTargetEl) {
    dom.heightTargetEl.classList.add('hidden');
  }
  if (patch.angleTargetPercent !== undefined && dom.angleTargetEl) {
    dom.angleTargetEl.classList.remove('hidden');
    const left = `${patch.angleTargetPercent}%`;
    if (dom.angleTargetEl.style.left !== left) dom.angleTargetEl.style.left = left;
  }
  if (patch.hideAngleTarget && dom.angleTargetEl) {
    dom.angleTargetEl.classList.add('hidden');
  }
  if (patch.deflectionTargetPercent !== undefined && dom.deflectionTargetEl) {
    dom.deflectionTargetEl.classList.remove('hidden');
    const left = `${patch.deflectionTargetPercent}%`;
    if (dom.deflectionTargetEl.style.left !== left) dom.deflectionTargetEl.style.left = left;
  }
  if (patch.hideDeflectionTarget && dom.deflectionTargetEl) {
    dom.deflectionTargetEl.classList.add('hidden');
  }
  let isChangeWeight = false;
  const currentHasWeight = dom.root.dataset.hasWeight !== 'false';
  if (patch.hasWeight !== undefined && patch.hasWeight !== currentHasWeight) {
    isChangeWeight = true;
    dom.root.dataset.hasWeight = patch.hasWeight ? 'true' : 'false';

    // 切换详情页标签文本
    const totalLabelEl = dom.root.querySelector('.patch-total-weight-label');
    if (totalLabelEl) totalLabelEl.innerHTML = patch.hasWeight ? '总承重:' : '平均负载率:';
    const weightUnitEl = dom.root.querySelector('.patch-weight-unit');
    if (weightUnitEl) weightUnitEl.innerHTML = patch.hasWeight ? 'kg' : '%';

    // 切换所有电机承重条颜色
    dom.motors.forEach(motorDom => {
      if (motorDom.weightPercentEl) {
        motorDom.weightPercentEl.classList.toggle('bg-blue-500', patch.hasWeight!);
        motorDom.weightPercentEl.classList.toggle('bg-violet-500', !patch.hasWeight!);
      }
    });
  }
  if (patch.motors) {
    patch.motors.forEach((motor, id) => {
      const motorDom = dom.motors.get(id);
      if (motorDom) applyMotorLogic(motorDom, motor, { hasWeight: patch.hasWeight ?? currentHasWeight, isChangeWeight });
    });
  }
};

export function useDetailDomUpdater() {
  const cardMapRef = useRef<Map<string, DetailDomRefs>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingPatchesRef = useRef<Map<string, DetailPatch>>(new Map());
  const rafHandleRef = useRef<number | null>(null);

  const applyLogicRef = useRef(applyLogic);
  applyLogicRef.current = applyLogic;

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = (entry.target as HTMLElement).dataset.deviceId;
        if (id) {
          const dom = cardMapRef.current.get(id);
          if (dom) dom.isVisible = entry.isIntersecting;
        }
      });
    }, { threshold: 0.01 });

    return () => {
      observerRef.current?.disconnect();
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
    };
  }, []);

  const registerCard = useCallback((id: string, ref: React.RefObject<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    el.dataset.deviceId = id;
    const motors = el.querySelectorAll('.patch-device-motor');
    const motorsMap = new Map<string, MotorDomRefs>();
    // const hasWeight = el.dataset.hasWeight === 'true' ? true : false;
    motors.forEach(motor => {
      const motorId = (motor as HTMLElement).dataset.motorId;
      if (motorId) {
        motorsMap.set(motorId, {
          root: motor as HTMLElement,
          statusEl: motor.querySelector('.patch-motor-status'),
          heightEl: motor.querySelector('.patch-motor-height'),
          heightPercentEl: motor.querySelector('.patch-motor-height-percent'),
          weightEl: motor.querySelector('.patch-motor-weight'),
          weightPercentEl: motor.querySelector('.patch-motor-weight-percent'),
          offsetEl: motor.querySelector('.patch-motor-offset'),
          offsetPercentEl: motor.querySelector('.patch-motor-offset-percent'),
          speedEl: motor.querySelector('.patch-motor-speed'),
          speedPercentEl: motor.querySelector('.patch-motor-speed-percent'),
          isVisible: true
        });
      }
    });
    
    cardMapRef.current.set(id, {
      root: el,
      valueEl: el.querySelector('.patch-value'),
      statusEl: el.querySelector('.patch-status'),
      isVisible: true,
      heightEl: el.querySelector('.patch-height'),
      heightPercentEl: el.querySelector('.patch-height-percent'),
      angleEl: el.querySelector('.patch-angle'),
      anglePercentEl: el.querySelector('.patch-angle-percent'),
      deflectionEl: el.querySelector('.patch-deflection'),
      deflectionPercentEl: el.querySelector('.patch-deflection-percent'),
      heightTargetEl: el.querySelector('.patch-height-target'),
      angleTargetEl: el.querySelector('.patch-angle-target'),
      deflectionTargetEl: el.querySelector('.patch-deflection-target'),
      statusIconEl: el.querySelector('.patch-status-icon'),
      motors: motorsMap
    });
    observerRef.current?.observe(el);
  }, []);

  const unregisterCard = useCallback((id: string) => {
    const dom = cardMapRef.current.get(id);
    if (dom) observerRef.current?.unobserve(dom.root);
    cardMapRef.current.delete(id);
    pendingPatchesRef.current.delete(id);
  }, []);

  const flushPatches = useCallback(() => {
    const patches = pendingPatchesRef.current;
    const cardMap = cardMapRef.current;

    if (patches.size === 0) {
      rafHandleRef.current = null;
      return;
    }

    patches.forEach((patch, id) => {
      const dom = cardMap.get(id);
      if (dom && dom.isVisible) {
        applyLogicRef.current(dom, patch);
      }
    });

    patches.clear();
    rafHandleRef.current = null;
  }, []);

  const enqueuePatch = useCallback((patch: DetailPatch) => {
    const pending = pendingPatchesRef.current;
    const existing = pending.get(patch.id);
    
    if (existing) {
      // 合并基础属性
      const { motors: newMotors, ...rest } = patch;
      Object.assign(existing, rest);
      
      // 合并 motors Map
      if (newMotors) {
        if (!existing.motors) {
          existing.motors = new Map(newMotors);
        } else {
          newMotors.forEach((motorPatch, motorId) => {
            const existingMotor = existing.motors.get(motorId);
            if (existingMotor) {
              Object.assign(existingMotor, motorPatch);
            } else {
              existing.motors.set(motorId, { ...motorPatch });
            }
          });
        }
      }
    } else {
      // 深拷贝 motors Map 避免引用污染
      const { motors, ...rest } = patch;
      pending.set(patch.id, {
        ...rest,
        motors: motors ? new Map(motors) : new Map()
      });
    }

    if (rafHandleRef.current === null) {
      rafHandleRef.current = requestAnimationFrame(flushPatches);
    }
  }, [flushPatches]);

  return useMemo(() => ({ registerCard, unregisterCard, enqueuePatch }), [registerCard, unregisterCard, enqueuePatch]);
}
