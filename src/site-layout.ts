import type { SiteSection } from './site-content';

export type LayoutBreakpoint = 'desktop' | 'tablet' | 'mobile';
export type LayoutAlign = 'left' | 'center' | 'right';
export type TextAlign = 'left' | 'center' | 'right';
export type LayoutItemType = 'text' | 'card' | 'button' | 'panel' | 'logo';
export type CoordinateSpace = 'world' | 'parent';

/**
 * Panels and standalone world objects use DDNet map coordinates. Text and cards
 * nested in a panel store local offsets and their explicit parent ID.
 */
export interface ElementLayout {
	worldX: number;
	worldY: number;
	width: number;
	height: number;
	zIndex: number;
	align: LayoutAlign;
	background: string;
	backgroundOpacity: number;
	blur: number;
	borderColor: string;
	borderWidth: number;
	radius: number;
	shadowColor: string;
	shadowIntensity: number;
	innerShadowIntensity: number;
	glowIntensity: number;
	gradient: string;
	padding: number;
	fontSize: number;
	fontFamily: string;
	fontWeight: number;
	opacity?: number;
	letterSpacing?: number;
	subtitleFontSize?: number;
	subtitleColor?: string;
	subtitleFontWeight?: number;
	subtitleGap?: number;
	subtitleLetterSpacing?: number;
	subtitleOpacity?: number;
	color: string;
	textAlign: TextAlign;
	lineHeight: number;
	visible: boolean;
	groupId?: string;
	coordinateSpace: CoordinateSpace;
	parentId?: string;
}

export type LayoutProfile = Record<string, Partial<ElementLayout>>;
export type LayoutProfiles = Partial<Record<LayoutBreakpoint, LayoutProfile>>;
export interface LayoutExtra { id: string; sourceId: string; title?: string; text?: string; label?: string; href?: string }
export interface LayoutItem { id: string; type: LayoutItemType; title: string; text: string; sectionId?: string; href?: string }
export interface WorldAnchor { x: number; y: number }
export interface WorldView { x: number; y: number; width: number; height: number }
export interface ScreenPoint { x: number; y: number }
export interface ProjectedLayoutBox { x: number; y: number; width: number; height: number; scaleX: number; scaleY: number; scale: number }

export const PANEL_LAYOUT_ID = 'nova-panel';
export const LAYOUT_BREAKPOINTS: LayoutBreakpoint[] = ['desktop', 'tablet', 'mobile'];

/** The saved user frame can replace the default section frame without moving either one. */
export function sectionContentFrameId(section: SiteSection): string {
	if (!section.layoutRemoved?.includes(PANEL_LAYOUT_ID)) return PANEL_LAYOUT_ID;
	return section.layoutItems?.find(item => item.type === 'panel' && !section.layoutRemoved?.includes(item.id))?.id ?? PANEL_LAYOUT_ID;
}

export function currentBreakpoint(width = typeof window === 'undefined' ? 1280 : window.innerWidth): LayoutBreakpoint {
	if (typeof document !== 'undefined' && document.body.classList.contains('layout-edit-mode') && width === window.innerWidth) {
		const override = document.body.dataset.layoutBreakpoint;
		if (LAYOUT_BREAKPOINTS.includes(override as LayoutBreakpoint)) return override as LayoutBreakpoint;
	}
	if (width < 650) return 'mobile';
	if (width < 1100) return 'tablet';
	return 'desktop';
}

/** CSS projection shared with the WebGL GAME_GROUP view. */
export function worldTransform(view: WorldView, viewportWidth: number, viewportHeight: number) {
	const sx = viewportWidth / view.width, sy = viewportHeight / view.height;
	return `matrix(${sx},0,0,${sy},${-view.x * sx},${-view.y * sy})`;
}

/** Project one box into CSS pixels so its text is painted at its final size, without scaling a shared DOM layer. */
export function projectLayoutBox(layout: Pick<ElementLayout, 'worldX' | 'worldY' | 'width' | 'height' | 'align' | 'coordinateSpace'>, view: WorldView, viewportWidth: number, viewportHeight: number): ProjectedLayoutBox {
	const scaleX = viewportWidth / view.width, scaleY = viewportHeight / view.height;
	const width = layout.width * scaleX, height = layout.height * scaleY;
	let x = (layout.coordinateSpace === 'world' ? layout.worldX - view.x : layout.worldX) * scaleX;
	const y = (layout.coordinateSpace === 'world' ? layout.worldY - view.y : layout.worldY) * scaleY;
	if (layout.align === 'center') x -= width / 2;
	else if (layout.align === 'right') x -= width;
	return { x, y, width, height, scaleX, scaleY, scale: Math.sqrt(scaleX * scaleY) };
}


const hexRgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;

/** Apply the map projection as positions and final CSS-pixel sizes on each element. */
export function applyWorldProjection(element: HTMLElement, view: WorldView, viewportWidth: number, viewportHeight: number) {
	const data = element.dataset;
	const number = (value: string | undefined, fallback = 0) => {
		const result = Number(value);
		return Number.isFinite(result) ? result : fallback;
	};
	const layout = {
		worldX: number(data.worldX), worldY: number(data.worldY), width: number(data.worldWidth), height: number(data.worldHeight),
		align: (data.worldAlign ?? 'left') as LayoutAlign,
		coordinateSpace: (data.worldCoordinateSpace ?? 'world') as CoordinateSpace,
	};
	const rect = projectLayoutBox(layout, view, viewportWidth, viewportHeight);
	element.style.left = '0px';
	element.style.top = '0px';
	element.style.setProperty('translate', `${rect.x}px ${rect.y}px`);
	const fontSize = number(data.worldFontSize, 16), padding = number(data.worldPadding), borderWidth = number(data.worldBorderWidth);
	const isLogo = data.layoutRole === 'custom-logo';
	const signature = [rect.scaleX, rect.scaleY, layout.width, layout.height, fontSize, padding, borderWidth, data.worldBorderColor, data.worldRadius, data.worldBlur, data.worldShadowIntensity, data.worldInnerShadowIntensity, data.worldShadowColor, data.worldFontFamily, data.worldFontWeight, data.worldColor, data.worldGradient, data.worldOpacity, data.worldLetterSpacing, data.worldGlowIntensity, data.worldSubtitleFontSize, data.worldSubtitleColor, data.worldSubtitleFontWeight, data.worldSubtitleGap, data.worldSubtitleLetterSpacing, data.worldSubtitleOpacity].map(value => String(value)).join('|');
	if (data.projectionStyle === signature) return;
	data.projectionStyle = signature;
	const scale = rect.scale, px = (value: number) => `${value * scale}px`;
	element.style.width = `${rect.width}px`;
	element.style.height = `${rect.height}px`;
	element.style.fontSize = px(fontSize);
	element.style.borderWidth = px(borderWidth);
	element.style.borderRadius = px(number(data.worldRadius));
	element.style.setProperty('--world-scale', String(scale));
	element.style.setProperty('--layout-padding', px(padding));
	element.style.padding = element.dataset.layoutRole === 'card'
		? `${px(padding)} ${px(padding)} ${px(padding)} ${px(padding + 36)}`
		: px(padding);
	element.style.setProperty('--layout-font-size', px(fontSize));
	element.style.setProperty('--layout-title-font-size', px(fontSize));
	element.style.setProperty('--layout-body-font-size', px(Math.max(10, fontSize * .82)));
	if (isLogo) {
		const opacity = Math.max(0, Math.min(100, number(data.worldOpacity, 100))) / 100;
		const glow = Math.max(0, Math.min(100, number(data.worldGlowIntensity))) / 100;
		const glowRgb = /^#[0-9a-f]{6}$/i.test(data.worldColor ?? '') ? hexRgb(data.worldColor!) : '137, 207, 244';
		element.style.opacity = String(opacity);
		element.style.letterSpacing = px(number(data.worldLetterSpacing));
		element.style.fontFamily = data.worldFontFamily ?? 'Manrope, Inter, sans-serif';
		element.style.fontWeight = String(number(data.worldFontWeight, 760));
		element.style.color = data.worldColor ?? '#eff9ff';
		element.style.setProperty('--wordmark-gradient', data.worldGradient || 'linear-gradient(110deg, #f7fcff 0%, #d9f1fc 52%, #91cbed 100%)');
		element.style.setProperty('--wordmark-client-weight', String(Math.max(100, number(data.worldFontWeight, 760) - 120)));
		element.style.textShadow = glow ? `0 0 ${px(15 * glow)} rgba(${glowRgb}, ${Math.min(.24, glow * .24)})` : 'none';
		element.style.gap = px(number(data.worldSubtitleGap, 6));
		const subtitle = element.querySelector<HTMLElement>('.amf-worldmark-subtitle');
		if (subtitle) {
			subtitle.style.fontSize = px(number(data.worldSubtitleFontSize, 16));
			subtitle.style.fontWeight = String(number(data.worldSubtitleFontWeight, 560));
			subtitle.style.letterSpacing = px(number(data.worldSubtitleLetterSpacing, .45));
			subtitle.style.opacity = String(Math.max(0, Math.min(100, number(data.worldSubtitleOpacity, 92))) / 100);
			subtitle.style.color = data.worldSubtitleColor ?? '#cbe8f7';
			subtitle.style.textShadow = 'none';
		}
	}
	const blur = number(data.worldBlur);
	const backdrop = blur ? `blur(${px(blur)}) saturate(1.12)` : 'none';
	element.style.backdropFilter = backdrop;
	element.style.setProperty('-webkit-backdrop-filter', backdrop);
	const rgb = hexRgb(data.worldShadowColor ?? '#071521');
	const intensity = number(data.worldShadowIntensity) / 100;
	const inner = number(data.worldInnerShadowIntensity) / 100;
	const depth = layout.coordinateSpace === 'world' ? 22 : 12;
	const spread = layout.coordinateSpace === 'world' ? 56 : 34;
	const alpha = intensity * .42;
	element.style.setProperty('--layout-shadow', `0 ${px(depth)} ${px(spread)} rgba(${rgb},${alpha}),inset 0 ${px(1)} rgba(235,247,255,${inner * .16}),inset 0 -${px(1)} rgba(7,20,31,${inner * .2})`);
	element.style.setProperty('--layout-shadow-hover', `0 ${px(depth)} ${px(spread + 8)} rgba(${rgb},${Math.min(.5, alpha * 1.13)}),inset 0 ${px(1)} rgba(235,247,255,${Math.min(.3, inner * .19)})`);
	element.style.setProperty('--layout-border-color', data.worldBorderColor ?? '#779bb5');
}

export function worldToScreen(point: WorldAnchor, view: WorldView, viewportWidth: number, viewportHeight: number): ScreenPoint {
	return { x: (point.x - view.x) / view.width * viewportWidth, y: (point.y - view.y) / view.height * viewportHeight };
}

export function screenToWorld(point: ScreenPoint, view: WorldView, viewportWidth: number, viewportHeight: number): WorldAnchor {
	return { x: view.x + point.x / viewportWidth * view.width, y: view.y + point.y / viewportHeight * view.height };
}

function panelGeometry(breakpoint: LayoutBreakpoint, anchor: WorldAnchor, sectionId = '') {
	const geometry = breakpoint === 'mobile' ? [460, 880, 560] : breakpoint === 'tablet' ? [850, 720, 510] : sectionId === 'home' ? [900, 640, 466] : sectionId === 'statistics' ? [900, 500, 360] : sectionId === 'download' ? [900, 550, 400] : [900, 600, 440];
	const [width, height, rise] = geometry;
	return { x: anchor.x - width / 2, y: anchor.y - rise, width, height };
}

function composition(sectionId: string, role: string, index: number, count: number, breakpoint: LayoutBreakpoint) {
	const mobile = breakpoint === 'mobile', tablet = breakpoint === 'tablet';
	const panelWidth = mobile ? 460 : tablet ? 850 : 900;
	const inset = mobile ? 22 : tablet ? 38 : 44;
	const innerWidth = panelWidth - inset * 2;
	const titleFont = mobile ? 31 : tablet ? 46 : 48;
	if (role === 'panel') return { dx: 0, dy: 0, ...panelGeometry(breakpoint, { x: 0, y: 0 }, sectionId), align: 'left' as const };
	if (role === 'eyebrow') return { dx: inset, dy: mobile ? 28 : 28, width: innerWidth, height: 24, align: 'left' as const };
	if (role === 'title') return { dx: inset, dy: mobile ? 58 : tablet ? 58 : 60, width: innerWidth, height: mobile ? 54 : 62, align: 'left' as const };
	if (role === 'subtitle') return { dx: inset, dy: mobile ? 125 : tablet ? 128 : 128, width: innerWidth, height: mobile ? 58 : 48, align: 'left' as const };
	if (role === 'description') return { dx: inset, dy: mobile ? 186 : tablet ? 184 : 184, width: innerWidth, height: mobile ? 78 : 54, align: 'left' as const };
	if (role === 'action') {
		const gap = mobile ? 12 : 18, width = mobile ? Math.floor((innerWidth - gap) / Math.max(1, count)) : Math.min(280, Math.floor((innerWidth - gap * Math.max(0, count - 1)) / Math.max(1, count)));
		const total = count * width + Math.max(0, count - 1) * gap;
		return { dx: inset + (innerWidth - total) / 2 + index * (width + gap), dy: mobile ? 770 : tablet ? 632 : sectionId === 'download' ? 462 : sectionId === 'home' ? 548 : 510, width, height: mobile ? 54 : 56, align: 'left' as const };
	}
	if (role === 'card' || role.startsWith('custom-card') || role.startsWith('custom-panel')) {
		let width: number, height: number, x: number, y: number;
		if (mobile) {
			width = innerWidth; height = count > 2 ? 142 : 148; x = inset; y = 255 + index * (height + 10);
		} else if (tablet) {
			width = Math.floor((innerWidth - 18) / 2); height = count > 2 ? 154 : 160; x = inset + (index % 2) * (width + 18); y = 276 + Math.floor(index / 2) * (height + 12);
		} else {
			const columns = Math.min(3, Math.max(1, count));
			const gap = 18; width = Math.floor((innerWidth - (columns - 1) * gap) / columns); height = count >= 3 ? 270 : sectionId === 'download' ? 190 : 210;
			x = inset + (index % columns) * (width + gap); y = 248 + Math.floor(index / columns) * (height + 12);
		}
		return { dx: x, dy: y, width, height, align: 'left' as const };
	}
	return { dx: inset, dy: 300, width: innerWidth, height: 120, align: 'left' as const };
}

const PANEL_GRADIENT = 'linear-gradient(138deg, rgba(54, 76, 94, .30), rgba(23, 39, 54, .22) 58%, rgba(42, 55, 70, .27)), radial-gradient(120% 95% at 0% 0%, rgba(179, 222, 247, .12), transparent 56%)';
const CARD_GRADIENT = 'linear-gradient(145deg, rgba(205, 232, 249, .12), rgba(73, 99, 119, .17))';

export function defaultElementLayout(sectionId: string, role: string, index: number, count: number, breakpoint: LayoutBreakpoint, anchor: WorldAnchor): ElementLayout {
	const p = composition(sectionId, role, index, count, breakpoint);
	if (role === 'custom-logo') {
		const viewAspect = breakpoint === 'desktop' ? 16 / 9 : breakpoint === 'tablet' ? 1 : 390 / 844;
		let viewHeight = Math.sqrt(1150 * 1000 / viewAspect), viewWidth = viewHeight * viewAspect;
		if (viewWidth > 1500) { viewWidth = 1500; viewHeight = viewWidth / viewAspect; }
		if (viewHeight > 1050) viewHeight = 1050;
		viewHeight *= 1.1;
		const width = breakpoint === 'desktop' ? 520 : 460;
		const height = breakpoint === 'desktop' ? 84 : breakpoint === 'tablet' ? 78 : 72;
		const fontSize = breakpoint === 'desktop' ? 54 : breakpoint === 'tablet' ? 45 : 44;
		return {
			worldX: anchor.x, worldY: anchor.y - viewHeight * .13 - height / 2, width, height, zIndex: 20,
			align: 'center', coordinateSpace: 'world', background: '#1b2b3a', backgroundOpacity: 0, blur: 0,
			borderColor: '#a9d2ec', borderWidth: 0, radius: 0, shadowColor: '#071521', shadowIntensity: 0,
			innerShadowIntensity: 0, glowIntensity: 14,
			gradient: 'linear-gradient(108deg, #f8fcff 0%, #e4f5fd 43%, #addcf4 72%, #83c3eb 100%)',
			padding: 0, fontSize, fontFamily: 'Manrope, Inter, sans-serif', fontWeight: 760,
			opacity: 100, letterSpacing: .35, subtitleFontSize: breakpoint === 'desktop' ? 16 : breakpoint === 'tablet' ? 14 : 13,
			subtitleColor: '#cbe8f7', subtitleFontWeight: 560, subtitleGap: breakpoint === 'desktop' ? 6 : breakpoint === 'tablet' ? 5 : 4,
			subtitleLetterSpacing: .45, subtitleOpacity: 92, color: '#eff9ff', textAlign: 'center', lineHeight: 1,
			visible: true,
		};
	}
	const titleFont = breakpoint === 'mobile' ? 31 : breakpoint === 'tablet' ? 46 : 48;
	const parent = role === 'panel';
	const independentPanel = role === 'custom-panel';
	const framedSurface = parent || independentPanel;
	const card = role === 'card' || role === 'custom-card' || role === 'custom-panel';
	const action = role === 'action' || role === 'custom-button';
	const text = ['title', 'subtitle', 'description', 'eyebrow', 'custom-text'].includes(role);
	const isDownloadPrimary = role === 'action' && sectionId === 'download' && index === 0;
	const geometry = parent ? panelGeometry(breakpoint, anchor, sectionId) : independentPanel ? { x: anchor.x - p.width / 2, y: anchor.y - p.height / 2, width: p.width, height: p.height } : { x: p.dx, y: p.dy, width: p.width, height: p.height };
	return {
		worldX: geometry.x, worldY: geometry.y, width: geometry.width, height: geometry.height, zIndex: parent ? 1 : card ? 3 : action ? 4 : 2,
		align: p.align, coordinateSpace: framedSurface ? 'world' : 'parent', ...(framedSurface ? {} : { parentId: PANEL_LAYOUT_ID }),
		background: framedSurface ? '#1b2b3a' : isDownloadPrimary ? '#b8e5fc' : card ? '#263d50' : action ? '#21394b' : '#1b2b3a',
		backgroundOpacity: framedSurface ? 85 : isDownloadPrimary ? 98 : card ? 66 : action ? 88 : 0,
		blur: framedSurface ? 14 : card ? 8 : action ? 7 : 0,
		borderColor: framedSurface ? '#779bb5' : isDownloadPrimary ? '#d5f1ff' : card ? '#829fb3' : action ? '#a9d8f3' : '#a9d2ec',
		borderWidth: framedSurface ? 1.2 : card ? 1 : action ? 1 : 0,
		radius: framedSurface ? (breakpoint === 'mobile' ? 24 : 30) : card ? 18 : action ? 15 : 8,
		shadowColor: '#071521', shadowIntensity: framedSurface ? 28 : card ? 23 : action ? 17 : 0,
		innerShadowIntensity: framedSurface ? 34 : card ? 22 : action ? 14 : 0,
		glowIntensity: framedSurface ? 30 : card ? 20 : action ? 24 : 0,
		gradient: framedSurface ? PANEL_GRADIENT : card ? CARD_GRADIENT : isDownloadPrimary ? 'linear-gradient(135deg, #d4f1ff, #a7dcf7)' : action ? 'linear-gradient(145deg, rgba(188, 224, 245, .2), rgba(48, 73, 93, .2))' : '',
		padding: framedSurface ? 0 : card ? (breakpoint === 'mobile' ? 17 : 21) : action ? 12 : 2,
		fontSize: role === 'title' ? titleFont : role === 'subtitle' ? (breakpoint === 'mobile' ? 21 : 25) : role === 'eyebrow' ? (breakpoint === 'mobile' ? 10 : 11) : card ? (breakpoint === 'mobile' ? 17 : 19) : action ? 16 : 17,
		fontFamily: role === 'title' || role === 'card' || role.startsWith('custom-card') ? 'Manrope, Inter, sans-serif' : 'Inter, Manrope, sans-serif',
		fontWeight: role === 'title' ? 760 : card ? 640 : action ? 700 : 500,
		color: isDownloadPrimary ? '#193246' : role === 'title' || card || action || parent ? '#f1f8fc' : '#d6e5ee',
		textAlign: 'left', lineHeight: role === 'title' ? 1.12 : role === 'subtitle' ? 1.38 : 1.52, visible: true,
	};
}

/** Resolve saved coordinates without mutating JSON; standalone wordmarks stay in map-world space. */
export function elementLayout(section: SiteSection, id: string, role: string, index: number, count: number, breakpoint: LayoutBreakpoint, anchor: WorldAnchor): ElementLayout {
	const fallback = defaultElementLayout(section.id, role, index, count, breakpoint, anchor);
	const saved = section.layout?.[breakpoint]?.[id];
	const result = { ...fallback, ...saved };
	if (role === 'custom-logo') return { ...result, coordinateSpace: 'world', parentId: undefined };
	if (id === PANEL_LAYOUT_ID || role === 'panel') return { ...result, coordinateSpace: 'world', parentId: undefined };
	const parentId = sectionContentFrameId(section);
	const parentItemIndex = section.layoutItems?.findIndex(item => item.id === parentId) ?? -1;
	const parentDefaults = parentId === PANEL_LAYOUT_ID
		? defaultElementLayout(section.id, 'panel', 0, 1, breakpoint, anchor)
		: defaultElementLayout(section.id, 'custom-panel', Math.max(0, parentItemIndex), section.layoutItems?.length ?? 1, breakpoint, anchor);
	const parent = { ...parentDefaults, ...section.layout?.[breakpoint]?.[parentId] };
	if (role === 'custom-panel') {
		if (saved && saved.coordinateSpace !== 'world') {
			result.worldX = (saved.worldX ?? fallback.worldX) + parent.worldX;
			result.worldY = (saved.worldY ?? fallback.worldY) + parent.worldY;
		}
		return { ...result, coordinateSpace: 'world', parentId: undefined };
	}
	if (saved?.coordinateSpace === 'parent' && saved.parentId === parentId) {
		return { ...result, coordinateSpace: 'parent', parentId };
	}
	if (saved) {
		let previousParentX = 0;
		let previousParentY = 0;
		if (saved.coordinateSpace === 'parent' && saved.parentId) {
			const previousParent = section.layout?.[breakpoint]?.[saved.parentId];
			if (previousParent) {
				previousParentX = previousParent.worldX ?? 0;
				previousParentY = previousParent.worldY ?? 0;
			}
		}
		result.worldX = (saved.worldX ?? fallback.worldX) + previousParentX - parent.worldX;
		result.worldY = (saved.worldY ?? fallback.worldY) + previousParentY - parent.worldY;
	}
	return { ...result, coordinateSpace: 'parent', parentId };
}

/** Expand defaults into editable profiles at save time; opening the editor never rewrites user data. */
export function materializeSectionLayout(section: SiteSection, breakpoint: LayoutBreakpoint, anchor: WorldAnchor): LayoutProfile {
	const descriptors = new Map<string, { role: string; index: number; count: number }>();
	const add = (id: string, role: string, index: number, count: number) => descriptors.set(id, { role, index, count });
	add(PANEL_LAYOUT_ID, 'panel', 0, 1);
	if (section.eyebrow) add('eyebrow', 'eyebrow', 0, 1);
	if (section.title || section.accent) add('title', 'title', 0, 1);
	if (section.subtitle) add('subtitle', 'subtitle', 0, 1);
	if (section.description) add('description', 'description', 0, 1);
	section.cards.forEach((_, index) => add(`card-${index}`, 'card', index, section.cards.length));
	section.actions.forEach((_, index) => add(`action-${index}`, 'action', index, section.actions.length));
	section.layoutItems?.forEach((item, index) => add(item.id, `custom-${item.type}`, index, section.layoutItems!.length));
	for (const extra of section.layoutExtras ?? []) { const source = descriptors.get(extra.sourceId); if (source) add(extra.id, source.role, source.index, source.count); }
	const profile: LayoutProfile = {};
	for (const [id, descriptor] of descriptors) profile[id] = elementLayout(section, id, descriptor.role, descriptor.index, descriptor.count, breakpoint, anchor);
	return profile;
}

export function applyElementLayout(element: HTMLElement, layout: ElementLayout, breakpoint: LayoutBreakpoint) {
	element.classList.add('layout-user-style');
	element.dataset.coordinateSpace = layout.coordinateSpace;
	element.dataset.worldX = String(layout.worldX); element.dataset.worldY = String(layout.worldY);
	element.dataset.worldWidth = String(layout.width); element.dataset.worldHeight = String(layout.height);
	element.dataset.worldAlign = layout.align; element.dataset.worldCoordinateSpace = layout.coordinateSpace;
	element.dataset.worldFontSize = String(layout.fontSize); element.dataset.worldPadding = String(layout.padding);
	element.dataset.worldFontFamily = layout.fontFamily; element.dataset.worldFontWeight = String(layout.fontWeight);
	element.dataset.worldColor = layout.color; element.dataset.worldGradient = layout.gradient;
	element.dataset.worldOpacity = String(layout.opacity ?? 100); element.dataset.worldLetterSpacing = String(layout.letterSpacing ?? 0);
	element.dataset.worldSubtitleFontSize = String(layout.subtitleFontSize ?? 16); element.dataset.worldSubtitleColor = layout.subtitleColor ?? '#cbe8f7';
	element.dataset.worldSubtitleFontWeight = String(layout.subtitleFontWeight ?? 560); element.dataset.worldSubtitleGap = String(layout.subtitleGap ?? 6);
	element.dataset.worldSubtitleLetterSpacing = String(layout.subtitleLetterSpacing ?? .45); element.dataset.worldSubtitleOpacity = String(layout.subtitleOpacity ?? 92);
	element.dataset.worldGlowIntensity = String(layout.glowIntensity);
	element.dataset.worldBorderWidth = String(layout.borderWidth); element.dataset.worldBorderColor = layout.borderColor;
	element.dataset.worldRadius = String(layout.radius); element.dataset.worldBlur = String(layout.blur);
	element.dataset.worldShadowColor = layout.shadowColor; element.dataset.worldShadowIntensity = String(layout.shadowIntensity);
	element.dataset.worldInnerShadowIntensity = String(layout.innerShadowIntensity);
	delete element.dataset.projectionStyle;
	if (layout.parentId) element.dataset.parentLayoutId = layout.parentId;
	else delete element.dataset.parentLayoutId;
	element.style.position = 'absolute';
	element.style.left = '0px';
	element.style.top = '0px';
	element.style.width = `${layout.width}px`;
	element.style.height = `${layout.height}px`;
	element.style.zIndex = String(layout.zIndex);
	element.style.removeProperty('transform');
	element.style.setProperty('translate', '0px 0px');
	element.style.maxWidth = 'none'; element.style.minWidth = '0'; element.style.minHeight = '0'; element.style.margin = '0';
	element.style.padding = element.dataset.layoutRole === 'card'
		? `${layout.padding}px ${layout.padding}px ${layout.padding}px ${layout.padding + 36}px`
		: `${layout.padding}px`;
	element.style.setProperty('--layout-padding', `${layout.padding}px`);
	const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
	element.style.backgroundColor = `rgba(${rgb(layout.background)}, ${layout.backgroundOpacity / 100})`;
	element.style.backgroundImage = element.dataset.layoutRole === 'custom-logo' ? 'none' : layout.gradient || 'none';
	if (element.dataset.layoutRole === 'custom-logo') element.style.setProperty('--wordmark-gradient', layout.gradient || 'none');
	element.style.borderStyle = layout.borderWidth ? 'solid' : 'none';
	element.style.removeProperty('border-color');
	element.style.borderRadius = `${layout.radius}px`;
	element.style.backdropFilter = layout.blur ? `blur(${layout.blur}px) saturate(1.12)` : 'none';
	element.style.setProperty('-webkit-backdrop-filter', element.style.backdropFilter);
	element.style.removeProperty('box-shadow');
	element.style.setProperty('--nova-glow', String(layout.glowIntensity / 100));
	element.style.fontFamily = layout.fontFamily; element.style.fontWeight = String(layout.fontWeight); element.style.fontSize = `${layout.fontSize}px`;
	element.style.color = layout.color; element.style.textAlign = layout.textAlign; element.style.lineHeight = String(layout.lineHeight);
	element.style.setProperty('--layout-font-size', `${layout.fontSize}px`);
	element.style.setProperty('--layout-title-font-size', `${layout.fontSize}px`);
	element.style.setProperty('--layout-body-font-size', `${Math.max(10, layout.fontSize * 0.82)}px`);
	element.dataset.layoutHidden = String(!layout.visible); element.dataset.layoutBreakpoint = breakpoint; element.dataset.layoutAlign = layout.align;
	element.style.overflow = layout.coordinateSpace === 'world' ? 'visible' : 'hidden';
}
