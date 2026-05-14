
const whitelist = new RegExp(`[^\\d一二三四五六七八九十百千万马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽男女红蓝绿大小单双到尾头中碰反字数合金木水火土波色粒]`, 'g');

const cleanRawText = (text) => {
  return text.replace(whitelist, ' ');
};

const comboKeys = '家禽|野肖|男肖|女肖|反数';
const complexRegex = new RegExp(`(合(?:数)?\\s*(?:[大小单双]+|\\d+))|(${comboKeys})|(?:红|蓝|绿)波[大小单双]|(?:\\d+[头尾])`, 'g');

function cleanDisplayRaw(str) {
    let normalized = str.replace(/[兰篮]/g, '蓝');
    normalized = normalized.replace(/(红|蓝|绿)波/g, '$1');
    normalized = normalized.replace(/(红|蓝|绿)(?!单|双|大|小|合)/g, '$1波');
    
    const finalSegments = [];
    let lastIdx = 0;
    let match;
    while ((match = complexRegex.exec(normalized)) !== null) {
      const offset = match.index;
      const prevText = normalized.slice(lastIdx, offset);
      const cleanedPrev = cleanRawText(prevText);
      if (cleanedPrev.trim()) finalSegments.push(cleanedPrev);
      finalSegments.push(match[0].replace(/\s+/g, '')); 
      lastIdx = offset + match[0].length;
    }
    const remainingText = cleanRawText(normalized.slice(lastIdx));
    if (remainingText.trim()) finalSegments.push(remainingText);

    return finalSegments.join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .flatMap(part => {
        if (/^合(?:数)?(?:[大小单双]+|\d+)$/.test(part) || /^(?:红|蓝|绿)波[大小单双]$/.test(part) || /^(\d+)[尾头]$/.test(part)) {
          return [part]; 
        }
        if (/^[合头尾数]$/.test(part) || part === '') return [];
        return [part];
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
}

console.log('红双小 ->', cleanDisplayRaw('红双小'));
console.log('红双 小 ->', cleanDisplayRaw('红双 小'));
console.log('红单大 ->', cleanDisplayRaw('红单大'));
console.log('红单 大 ->', cleanDisplayRaw('红单 大'));
