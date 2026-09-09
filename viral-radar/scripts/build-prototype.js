#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'render', 'template.html');
const dataPath = path.join(__dirname, '..', 'render', 'carousel-reel-data.json');
const outPath = path.join(__dirname, '..', 'render', 'carousel-reel-prototype.html');

const template = fs.readFileSync(templatePath, 'utf8');
const data = fs.readFileSync(dataPath, 'utf8'); // 이미 JSON 문자열, 그대로 삽입

const out = template.replace('__VIRAL_RADAR_DATA__', data);
fs.writeFileSync(outPath, out);
console.log(`빌드 완료: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
