import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckCircle2, AlertTriangle, Activity, XCircle, Move } from 'lucide-react';
import { DeviceStatus } from '../types/device';

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
	zoom?: number;
	maxMotorWeight?: number;
	maxMotorPercent?: number;
	maxMotorNum?: number;
	heightTargetPercent?: number;
	angleTargetPercent?: number;
	deflectionTargetPercent?: number;
	hideHeightTarget?: boolean;
	hideAngleTarget?: boolean;
	hideDeflectionTarget?: boolean;
	hasWeight?: boolean,
};

export type DeviceDomRefs = {
	root: HTMLElement;
	valueEl: HTMLElement | null;
	statusEl: HTMLElement | null;
	isVisible: boolean;
	heightEl: HTMLElement | null;
	heightPercentEl: HTMLElement | null;
	heightTargetEl: HTMLElement | null;
	angleEl: HTMLElement | null;
	anglePercentEl: HTMLElement | null;
	angleTargetEl: HTMLElement | null;
	deflectionEl: HTMLElement | null;
	deflectionPercentEl: HTMLElement | null;
	deflectionTargetEl: HTMLElement | null;
	lastZoom?: number;
	labelContainers: HTMLElement[];
	minEls: HTMLElement[];
	maxEls: HTMLElement[];
	valueTracks: HTMLElement[];
	maxMotorValueEl: HTMLElement | null;
	maxMotorPercentEl: HTMLElement | null;
	maxMotorNumEl: HTMLElement | null;
	maxMotorBadgeEl: HTMLElement | null;
	statusIconEl: HTMLElement | null;
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

const applyLogic = (dom: DeviceDomRefs, patch: DevicePatch) => {
	if (patch.zoom !== undefined && patch.zoom !== dom.lastZoom) {
		const showLabels = patch.zoom >= 130;
		dom.labelContainers.forEach(el => {
			el.classList.toggle('hidden', !showLabels);
			el.classList.toggle('flex', showLabels);
		});
		dom.minEls.forEach(el => el.classList.toggle('hidden', !showLabels));
		dom.maxEls.forEach(el => el.classList.toggle('hidden', !showLabels));
		dom.valueTracks.forEach(el => el.classList.toggle('hidden', showLabels));
		dom.lastZoom = patch.zoom;
		dom.root.classList.toggle('h-[220px]', patch.zoom >= 130);
	}
	if (patch.hasWeight !== undefined) {
		const prevHasWeight = dom.root.dataset.hasWeight === 'true';
		if (patch.hasWeight !== prevHasWeight) {
			dom.root.dataset.hasWeight = patch.hasWeight ? 'true' : 'false';
			const isWeight = patch.hasWeight;

			// 标签文本
			const labelEl = dom.root.querySelector('.patch-max-motor-label');
			if (labelEl) labelEl.innerHTML = isWeight ? '最大电机<br />承重' : '最大电机<br />负载率';
			const totalLabelEl = dom.root.querySelector('.patch-total-weight-label');
			if (totalLabelEl) totalLabelEl.innerHTML = isWeight ? '总承重:' : '平均负载率:';
			const weightUnitEl = dom.root.querySelector('.patch-weight-unit');
			if (weightUnitEl) weightUnitEl.innerHTML = isWeight ? 'kg' : '%';

			// 进度条颜色
			if (dom.maxMotorPercentEl) {
				dom.maxMotorPercentEl.classList.toggle('bg-blue-500', isWeight);
				dom.maxMotorPercentEl.classList.toggle('bg-violet-500', !isWeight);
			}

			// 电机编号 badge 颜色
			if (dom.maxMotorBadgeEl) {
				const badgeBase = 'patch-max-motor-num mb-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono';
				dom.maxMotorBadgeEl.className = isWeight
					? `${badgeBase} bg-blue-900/40 border border-blue-500/30 text-blue-400`
					: `${badgeBase} bg-violet-900/40 border border-violet-500/30 text-violet-400`;
			}
		}
	}
	if (patch.maxMotorNum !== undefined && dom.maxMotorNumEl) {
		const valStr = `#${String(patch.maxMotorNum)}`;
		if (dom.maxMotorNumEl.textContent !== valStr) dom.maxMotorNumEl.textContent = valStr;
	}
	if (patch.maxMotorWeight !== undefined && dom.maxMotorValueEl) {
		const isWeight = dom.root.dataset.hasWeight !== 'false';
		const valStr = isWeight ? String(patch.maxMotorWeight) : `${patch.maxMotorWeight}`;
		if (dom.maxMotorValueEl.textContent !== valStr) dom.maxMotorValueEl.textContent = valStr;
	}
	if (patch.maxMotorPercent !== undefined && dom.maxMotorPercentEl) {
		const height = `${patch.maxMotorPercent}%`;
		if (dom.maxMotorPercentEl.style.height !== height) {
			dom.maxMotorPercentEl.style.height = height;
		}
	}
	if (patch.status !== undefined) {
		updateStatusClasses(dom.statusEl, patch.status, {
			normal: 'bg-emerald-500',
			warning: 'bg-amber-500',
			alarm: 'bg-rose-500',
			disabled: 'bg-slate-500',
			moving: 'bg-blue-500'
		});
		if (dom.statusIconEl) {
			const iconHtml = STATUS_ICONS[patch.status];
			if (dom.statusIconEl.innerHTML !== iconHtml) {
				dom.statusIconEl.innerHTML = iconHtml;
			}
		}
		updateStatusClasses(dom.root, patch.status, {
			normal: 'border-emerald-500/50',
			warning: 'border-amber-500/50',
			alarm: 'border-rose-600/80',
			disabled: 'border-slate-600/50',
			moving: 'border-blue-500/50'
		});
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
};

export function useDeviceDomUpdater() {
	const cardMapRef = useRef<Map<string, DeviceDomRefs>>(new Map());
	const observerRef = useRef<IntersectionObserver | null>(null);
	const pendingPatchesRef = useRef<Map<string, DevicePatch>>(new Map());
	const rafHandleRef = useRef<number | null>(null);

	const applyLogicRef = useRef(applyLogic);
	applyLogicRef.current = applyLogic;

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

	const enqueuePatch = useCallback((patch: DevicePatch) => {
		const pending = pendingPatchesRef.current;
		const existing = pending.get(patch.id);
		
		if (existing) {
			Object.assign(existing, patch);
		} else {
			pending.set(patch.id, patch);
		}

		if (rafHandleRef.current === null) {
			rafHandleRef.current = requestAnimationFrame(flushPatches);
		}
	}, [flushPatches]);

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
		cardMapRef.current.set(id, {
			root: el,
			valueEl: el.querySelector('.patch-value'),
			statusEl: el.querySelector('.patch-status'),
			heightEl: el.querySelector('.patch-height'),
			heightPercentEl: el.querySelector('.patch-height-percent'),
			heightTargetEl: el.querySelector('.patch-height-target'),
			angleEl: el.querySelector('.patch-angle'),
			anglePercentEl: el.querySelector('.patch-angle-percent'),
			angleTargetEl: el.querySelector('.patch-angle-target'),
			deflectionEl: el.querySelector('.patch-deflection'),
			deflectionPercentEl: el.querySelector('.patch-deflection-percent'),
			deflectionTargetEl: el.querySelector('.patch-deflection-target'),
			isVisible: true,
			labelContainers: Array.from(el.querySelectorAll('.patch-label-container')),
			minEls: Array.from(el.querySelectorAll('.patch-min')),
			maxEls: Array.from(el.querySelectorAll('.patch-max')),
			valueTracks: Array.from(el.querySelectorAll('.patch-value-track')),
			maxMotorValueEl: el.querySelector('.patch-max-motor-value'),
			maxMotorPercentEl: el.querySelector('.patch-max-motor-percent'),
			maxMotorNumEl: el.querySelector('.patch-max-motor-num'),
			maxMotorBadgeEl: el.querySelector('.patch-max-motor-num'),
			statusIconEl: el.querySelector('.patch-status-icon')
		});
		observerRef.current?.observe(el);
	}, []);

	const unregisterCard = useCallback((id: string) => {
		const dom = cardMapRef.current.get(id);
		if (dom) observerRef.current?.unobserve(dom.root);
		cardMapRef.current.delete(id);
		pendingPatchesRef.current.delete(id);
	}, []);

	return useMemo(() => ({ registerCard, unregisterCard, enqueuePatch }), [registerCard, unregisterCard, enqueuePatch]);
}
