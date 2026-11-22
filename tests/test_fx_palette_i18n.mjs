import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');
const fx=read('static/fx-groups.js');
const i18n=read('static/i18n.js');
const html=read('static/index.html');
const langs=Object.fromEntries(['ko','en','ja'].map(lang=>[lang,JSON.parse(read('static/locales/'+lang+'.json'))]));
for(const key of ['effects.paletteRandom','effects.paletteHelpFourColors','effects.paletteRandomTooltip','effects.paletteGradientTooltip']){
 for(const lang of Object.keys(langs))assert.ok(langs[lang].messages[key],`${lang} missing ${key}`);
}
assert.deepEqual(new Set(langs.ko.messages['effects.paletteGradientTooltip'].match(/\{\w+\}/g)),new Set(['{low}','{middle}','{high}']));
for(const lang of ['en','ja']){
 assert.notEqual(langs[lang].messages['effects.paletteRandom'],langs.ko.messages['effects.paletteRandom']);
 assert.notEqual(langs[lang].legacy['랜덤 · 음표마다 다양한 색상'],langs.ko.legacy['랜덤 · 음표마다 다양한 색상']);
 assert.equal(Object.keys(langs[lang].messages).length,Object.keys(langs.ko.messages).length);
 assert.equal(Object.keys(langs[lang].legacy).length,Object.keys(langs.ko.legacy).length);
}
assert.ok(fx.includes('scorevideo:languagechange'));
assert.ok(fx.includes('effects.paletteRandomTooltip'));
assert.ok(fx.includes('effects.paletteHelpFourColors'));
assert.match(html,/\/static\/fx-groups\.js\?v=[a-z0-9_-]+/i);
assert.ok(html.includes('/static/i18n.js?v=fxi18n1'));
assert.ok(i18n.includes("code+'.json?v=fxi18n1'"));
console.log('PASS FX palette i18n: three locales, Random/Harmony keys, live language switch, cache busting');
