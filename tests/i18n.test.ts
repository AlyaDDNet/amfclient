import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { currentLocale, LOCALES, LOCALE_STORAGE_KEY, localeCode, resolveLocale, sectionLabel, setLocale, translate, translationKeys } from '../src/i18n';

test('English is the first-visit default, known stored choices persist, and invalid values fall back to English', () => {
	assert.equal(resolveLocale(null), 'en');
	assert.equal(resolveLocale(undefined), 'en');
	assert.equal(resolveLocale(''), 'en');
	assert.equal(resolveLocale('es'), 'en');
	assert.equal(resolveLocale('ru'), 'ru');
	assert.equal(resolveLocale('uk'), 'uk');
	assert.equal(localeCode('uk'), 'UA');
	assert.equal(localeCode('ru'), 'RU');
	assert.equal(LOCALE_STORAGE_KEY, 'amf-site-locale');
	assert.deepEqual(LOCALES, ['en', 'ru', 'uk']);
});

test('all locale dictionaries provide every public interface key with natural section labels', () => {
	const keys = translationKeys();
	for (const locale of LOCALES) for (const key of keys) assert.notEqual(translate(key, locale), key, `${locale}:${key}`);
	assert.equal(sectionLabel('home'), 'Home');
	assert.equal(translate('nav.features', 'ru'), 'Возможности');
	assert.equal(translate('nav.features', 'uk'), 'Можливості');
});

test('the Home wordmark tagline is translated in all supported locales without changing its brand name', () => {
	assert.equal(translate('brand.wordmarkTagline', 'en'), 'Comfort. Control. Quality.');
	assert.equal(translate('brand.wordmarkTagline', 'uk'), 'Комфорт. Контроль. Якість.');
	assert.equal(translate('brand.wordmarkTagline', 'ru'), 'Комфорт. Контроль. Качество.');
});

test('desktop-only screen strings follow the selected locale immediately and keep the AMF Client title fixed', async () => {
	const original = currentLocale();
	const expected = {
		en: ['Desktop Version Only', 'AMF Client website is currently available on desktop computers. Mobile and tablet support is coming soon.'],
		ru: ['Только для компьютеров', 'Сайт AMF Client пока доступен только на компьютерах. Поддержка телефонов и планшетов появится позже.'],
		uk: ["Лише для комп'ютерів", "Сайт AMF Client поки доступний лише на комп'ютерах. Підтримка телефонів і планшетів з'явиться пізніше."],
	} as const;
	try {
		for (const locale of LOCALES) {
			setLocale(locale);
			assert.equal(currentLocale(), locale);
			assert.deepEqual([translate('desktopOnly.title'), translate('desktopOnly.message')], expected[locale]);
		}
	} finally { setLocale(original); }
	const html = await readFile(resolve('index.html'), 'utf8');
	assert.match(html, /<h1 id="desktop-gate-title">AMF Client<\/h1>/);
	assert.match(html, /data-i18n="desktopOnly\.title"/);
	assert.match(html, /data-i18n="desktopOnly\.message"/);
});

test('locale initialization never consults browser language or modifies camera data', async () => {
	const source = await readFile(resolve('src/i18n.ts'), 'utf8');
	const main = await readFile(resolve('src/main.ts'), 'utf8');
	assert.doesNotMatch(source, /navigator\.language|navigator\.languages/);
	assert.match(source, /return 'en'/);
	assert.match(main, /refreshLocalization\(\)[\s\S]*?applyTranslations\(\)/);
	assert.match(main, /on\(document,'amf-locale-change',applyWordmarkLocale\)/);
	assert.match(main, /layoutItemTranslation\(item,locale,translate\('brand\.wordmarkTagline',locale\)\)/);
	const localization = main.slice(main.indexOf('function refreshLocalization'), main.indexOf('function initLanguagePicker'));
	assert.doesNotMatch(localization, /follower\.(?:seek|goToPoint|scroll)/);
});
