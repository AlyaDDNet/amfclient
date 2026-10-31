import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopModeController, DESKTOP_MIN_WIDTH, isDesktopViewport } from '../src/desktop-mode';

test('compact and desktop viewports use the 1024 CSS-pixel breakpoint', () => {
	assert.equal(DESKTOP_MIN_WIDTH, 1024);
	for (const width of [0, 390, 768, 1023, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(isDesktopViewport(width), false, `${width} is compact`);
	for (const width of [1024, 1280, 1920, 2560]) assert.equal(isDesktopViewport(width), true, `${width} is desktop`);
});

test('viewport transitions start and stop the app once and restore it when desktop width returns', () => {
	const events: string[] = [];
	const controller = new DesktopModeController(() => events.push('start'), () => events.push('stop'));
	controller.update(390);
	controller.update(768);
	controller.update(1023);
	controller.update(1024);
	controller.update(1400);
	controller.update(800);
	controller.update(390);
	controller.update(1280);
	assert.deepEqual(events, ['stop', 'start', 'stop', 'start']);
});

test('main app startup is gated by matchMedia and disposal releases the renderer and event handlers', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const main = await readFile(resolve('src/main.ts'), 'utf8');
	assert.match(main, /window\.matchMedia\('\(min-width: 1024px\)'\)/);
	assert.match(main, /new DesktopModeController\(\(\)=>\{document\.body\.classList\.remove\('desktop-gated'\);activateApp\(\);\}/);
	assert.match(main, /void start\(controller\.signal\)/);
	assert.match(main, /renderer\?\.dispose\(\);renderer=undefined/);
	assert.match(main, /for\(const off of appRemovers\.splice\(0\)\)off\(\)/);
	assert.doesNotMatch(main, /void start\(\)\.catch/);
});
