/**
 * 六合彩解析逻辑
 * 基准年：2026 (马年)
 */

export const ZODIAC_LIST = ['马', '蛇', '龙', '兔', '虎', '牛', '鼠', '猪', '狗', '鸡', '猴', '羊'] as const;
export type Zodiac = typeof ZODIAC_LIST[number];

export const COLOR_MAP = {
  '红': [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
  '蓝': [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
  '绿': [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49],
} as const;

export const ELEMENTS_MAP = {
  '金': [4, 5, 12, 13, 26, 27, 34, 35, 42, 43],
  '木': [8, 9, 16, 17, 24, 25, 38, 39, 46, 47],
  '水': [1, 14, 15, 22, 23, 30, 31, 44, 45],
  '火': [2, 3, 10, 11, 18, 19, 32, 33, 40, 41, 48, 49],
  '土': [6, 7, 20, 21, 28, 29, 36, 37],
} as const;

export const HOMOPHONES: Record<string, string> = {
  '要': '1',
  '幺': '1',
  '两': '2',
  '勾': '9',
  '实': '10',
  'O': '0',
  'o': '0',
};

export const ZODIAC_HOMOPHONES: Record<string, string[]> = {
  '鼠': ['鼠', '书'],
  '牛': ['牛', '扭', '妞'],
  '虎': ['虎', '府', '付'],
  '兔': ['兔', '吐', '免'],
  '龙': ['龙', '隆', '拢'],
  '蛇': ['蛇', '舌', '舍'],
  '马': ['马', '嘛'],
  '羊': ['羊', '阳', '洋'],
  '猴': ['猴', '候', '后'],
  '鸡': ['鸡', '机', '基'],
  '狗': ['狗', '购'],
  '猪': ['猪', '朱', '珠'],
};

/**
 * 获取生肖对应的号码
 * 2026年是马年，马对应 01, 13, 25, 37, 49
 */
export function getNumbersByZodiac(zodiac: string): number[] {
  const index = ZODIAC_LIST.indexOf(zodiac as any);
  if (index === -1) return [];

  const numbers: number[] = [];
  for (let i = 1; i <= 49; i++) {
    if ((i - 1) % 12 === index) {
      numbers.push(i);
    }
  }
  return numbers;
}

export interface ParseResult {
  numbers: number[];
  amount: number;
  raw: string;
  type: 'single' | '三中三' | '二中二' | '特碰';
  banker?: number; // For 特碰
}

export const STRONG_KEYWORDS = [
  '一个字', '每个字', '各一个字', '各数', '各自', '各号', '各字', '个字', '每个', '一个', '各', '个', '字', '每', '打', '买', '下', '位', '压', '=', '＝', '￥'
];
// 弱关键字：仅在数字 >= 50 或有币种后缀时才视为金额锚点
export const WEAK_KEYWORDS = [':', '：', '号', '码', '号码', '波色', '色', '条', 'x', 'X', '#'];
export const ALL_KEYWORDS = [...STRONG_KEYWORDS, ...WEAK_KEYWORDS];

// 数据连接符：用于连接多个号码或生肖，不应触发金额切分
export const DATA_CONNECTORS = ['*', '/', '-', '@', '.', ',', '，', '。', ' ', '\t', '数', '#', '[', ']', '(', ')', '【', '】'];

/**
 * 将中文数字转换为阿拉伯数字 (支持到百位，满足金额需求)
 */
function chineseToNumber(chinese: string): number {
  if (/^\d+$/.test(chinese)) return parseInt(chinese, 10);
  
  const map: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100
  };
  
  let result = 0;
  let temp = 0;
  
  for (let i = 0; i < chinese.length; i++) {
    const char = chinese[i];
    const val = map[char];
    if (val === undefined) continue;
    
    if (val === 10 || val === 100) {
      if (temp === 0) temp = 1;
      result += temp * val;
      temp = 0;
    } else {
      temp = val;
    }
  }
  return result + temp;
}

/**
 * 智能拆分连在一起的数字串（如 2535 -> 25, 35）
 * 优先匹配 1-49 之间的两位数，不合法的则拆分为个位数
 */
function smartSplitDigits(nStr: string): number[] {
  const result: number[] = [];
  // 如果是 3 位或更多，且可能被解析为金额（但在错误位置），我们应谨慎
  // 这里的逻辑主要针对 010523 这种连续号码
  if (nStr.length >= 3 && parseInt(nStr, 10) > 49) {
    // 检查是否全由 0-9 组成
    if (!/^\d+$/.test(nStr)) return [];
    
    // 尝试两位一拆
    let potential: number[] = [];
    let possible = true;
    for (let i = 0; i < nStr.length; i += 2) {
      const chunk = nStr.slice(i, i + 2);
      if (chunk.length === 0) break;
      const val = parseInt(chunk, 10);
      if (val >= 1 && val <= 49) {
        potential.push(val);
      } else if (chunk.length === 1 && parseInt(chunk, 10) >= 1) {
        // 允许最后一位是个位数
        potential.push(parseInt(chunk, 10));
      } else {
        possible = false;
        break;
      }
    }
    if (possible) return potential;
    
    // 如果不能完美按两位拆分，看看是不是类似 123 拆成 1 2 3
    if (nStr.length === 3) {
      const d1 = parseInt(nStr[0], 10);
      const d2 = parseInt(nStr[1], 10);
      const d3 = parseInt(nStr[2], 10);
      if (d1 >= 1 && d2 >= 1 && d3 >= 1) return [d1, d2, d3];
    }
    
    return []; // 无法识别为合规号码
  }

  let i = 0;
  while (i < nStr.length) {
    const twoDigits = nStr.slice(i, i + 2);
    const val2 = parseInt(twoDigits, 10);
    
    if (twoDigits.length === 2 && val2 >= 1 && val2 <= 49) {
      result.push(val2);
      i += 2;
    } else {
      const oneDigit = nStr.slice(i, i + 1);
      const val1 = parseInt(oneDigit, 10);
      if (oneDigit.length === 1 && !isNaN(val1) && val1 >= 1 && val1 <= 49) {
        result.push(val1);
      }
      i += 1;
    }
  }
  return result;
}

const IGNORE_TARGETS = ['合计', '总计', '总共', '共计', '累计', '合计金额', '总额'];
const HEADER_KEYWORDS = [
  '新澳门', '澳门特码', '新奥特码', '澳门特', '澳门', '特码', '澳特', '特',
  '上报数据明细', '数据明细', '明细', '报单', '报单明细', '清单', '下注清单',
  '上报散码数据', '散码数据', '上报数据', '上报散码', '散码', '上报',
  'Vz-HuiPu-PC', '图', '港'
];

/**
 * 解析输入字符串
 * 遵循用户最新指令：
 * 1. “各”、“字”或其谐音之后的第一组数字为金额。
 * 2. “各”之前的生肖和号码独立计算（不进行去重）。
 * 3. 大小单双组合逻辑：大单(25-49单), 大双(25-49双), 小单(1-24单), 小双(1-24双)。
 */
export function parseInput(input: string): ParseResult[] {
  // 统一替换谐音 (针对金额前的关键词)
  let processed = input;
  
  // 扩充关键词库，涵盖所有对话中出现的变体
  const KEYWORDS = ALL_KEYWORDS;

  // 1. 识别库：处理已知的特殊模式或错误纠回
  const RECOGNITION_LIBRARY: Array<{ pattern: RegExp, replacement: string | ((...args: any[]) => string) }> = [
    // 结合 HOMOPHONES 扩充识别库
    ...Object.entries(HOMOPHONES).map(([key, val]) => ({
      pattern: new RegExp(key, 'g'),
      replacement: val
    })),
    // 修复 "01到12" 被冒号断开的问题：将 "门：01到12" 类型的标签冒号暂时移位或移除
    { pattern: /门[：:](?=\d)/g, replacement: '门 ' },
    // 屏蔽“波”、“数”字，规范识别（如蓝波双 -> 蓝双, 蓝小数 -> 蓝小）
    { pattern: /[波数]/g, replacement: '' },
  ];

  let preProcessed = input.replace(/元/g, '元\n'); // 核心优化：元字后方添加换行，强制重置识别生命周期
  RECOGNITION_LIBRARY.forEach(rec => {
    preProcessed = preProcessed.replace(rec.pattern, rec.replacement as any);
  });
  
  // 2. 移除汇总信息和报头信息
  const sortedIgnore = [...IGNORE_TARGETS].sort((a, b) => b.length - a.length);
  const summaryRegex = new RegExp(`^\\s*(?:${sortedIgnore.join('|')})[^\\n]*`, 'gm');
  const withoutSummary = preProcessed.replace(summaryRegex, '');
  
  const sortedHeader = [...HEADER_KEYWORDS].sort((a, b) => b.length - a.length);
  // 允许 Header 后直接跟数字或其它内容
  const headerRegex = new RegExp(`^\\s*(?:${sortedHeader.join('|')})[：:\\s]*`, 'gm');
  const cleaned = withoutSummary.replace(headerRegex, '');

  // 3. 范围处理 (e.g. 1到5各10)
  const rangeProcessed = cleaned.replace(/(\d+)\s*(?:到|至)\s*(\d+)\s*(各|字|买|下|压)/g, (match, start, end, suffix) => {
    const s = parseInt(start, 10);
    const e = parseInt(end, 10);
    if (isNaN(s) || isNaN(e) || s > e || e > 49) return match;
    const nums = [];
    for (let n = s; n <= e; n++) nums.push(n.toString().padStart(2, '0'));
    return nums.join(' ') + suffix;
  });

  const rawChunks = rangeProcessed.split(/[\n\r;；。]+/).map(l => l.trim()).filter(l => l);
  
  const allResults: ParseResult[] = [];
  const COMBO_KEYWORDS = ['三中三', '3中3', '二中二', '2中2', '特碰', '三中二', '二中特'];
  
  let buffer = '';
  for (const chunk of rawChunks) {
    const segments = splitByAnchors(chunk);
    
    if (segments.length > 0) {
      for (const seg of segments) {
        const hasAnchor = checkHasAnchor(seg);
        if (hasAnchor) {
          const combined = buffer ? `${buffer} ${seg}` : seg;
          const results = parseSegment(combined, KEYWORDS, COMBO_KEYWORDS);
          if (results && results.length > 0) {
            allResults.push(...results);
            buffer = '';
          } else {
            buffer = combined;
          }
        } else {
          buffer = buffer ? `${buffer} ${seg}` : seg;
        }
      }
    } else {
      buffer = buffer ? `${buffer} ${chunk}` : chunk;
    }
  }
  
  if (buffer) {
    const finalRes = parseSegment(buffer, KEYWORDS, COMBO_KEYWORDS);
    if (finalRes) allResults.push(...finalRes);
  }
  
  return allResults;
}

/**
 * 辅助：检查字符串中是否包含任何金额锚点
 */
function checkHasAnchor(text: string): boolean {
  const sortedStrong = [...STRONG_KEYWORDS].sort((a, b) => b.length - a.length);
  const strongPattern = sortedStrong.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const strongRegex = new RegExp(`(${strongPattern})[\\s,，、。#\\-/*@.]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))`, 'g');
  if (strongRegex.test(text)) return true;

  const weakPattern = WEAK_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const weakRegex = new RegExp(`(${weakPattern})[\\s,，、。#\\-/*@.]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))`, 'g');
  
  // 对于“号”字做特殊判定：
  let m;
  while ((m = weakRegex.exec(text)) !== null) {
    const keyword = m[1];
    const amountStr = m[2] || m[3];
    const val = amountStr ? ( /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr) ) : 0;
    const matchIndex = m.index;
    if (keyword === '号') {
      const beforeChar = text.substring(0, matchIndex).trim().slice(-1);
      // 如果前方是数字，则不视为金额锚点 (作为数据分隔符)
      if (/[\d一二三四五六七八九十百]/.test(beforeChar)) {
        continue;
      }
      // 如果前方是其他汉字，作为金额分隔符 (视为金额锚点，或者作为特殊标记)
      if (/[\u4e00-\u9fa5]/.test(beforeChar) && !/[一二三四五六七八九十百]/.test(beforeChar)) {
        return true; 
      }
    }
    // “元”字作为强力金额终止符，直接返回 true
    if (text.includes('元')) return true;
    if (val >= 50) return true;
  }

  // 特殊识别：数字 + 元
  if (/(?:\d+|[一二三四五六七八九十百]+)\s*元/.test(text)) return true;

  // 默认换行符前一个数字为金额
  const endOfLineAmountRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))[\s,，、。#\-/*@.]*$/gi;
  const eolMatch = endOfLineAmountRegex.exec(text);
  if (eolMatch) {
    const amountStr = eolMatch[1] || eolMatch[2];
    const val = amountStr ? (/^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr)) : 0;
    
    const rawBeforeText = text.substring(0, eolMatch.index);
    const connectors = rawBeforeText.match(/[\s,，、。#\-/*@.]/g);
    
    // 如果连接符高频出现且数字在 1-49 范围内，认为这是数据而非金额
    if (connectors) {
      const lastChar = connectors[connectors.length - 1];
      const charCount = (rawBeforeText.split(lastChar).length - 1);
      if (charCount >= 2 && val <= 49) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * 寻找字符串中的所有金额锚点
 */
function findAllAnchors(text: string): { index: number, length: number, keyword: string }[] {
  const sortedStrong = [...STRONG_KEYWORDS].sort((a, b) => b.length - a.length);
  const strongPattern = sortedStrong.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const strongRegex = new RegExp(`(${strongPattern})[\\s,，、。#\\-/*@.]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))[\\s元米斤块位个一个]*`, 'gi');

  const sortedWeak = [...WEAK_KEYWORDS].sort((a, b) => b.length - a.length);
  const weakPattern = sortedWeak.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const weakRegex = new RegExp(`(${weakPattern})[\\s,，、。#\\-/*@.]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))(?:元|米|斤|块|位|个|一个)(?![\\d一二三四五六七八九十百])|(${weakPattern})[\\s,，、。#\\-/*@.]*(\\d{2,}|[一二三四五六七八九十百]+)(?![\\d一二三四五六七八九十百])|(${weakPattern})[\\s,，、。#\\-/*@.]*(\\d+)(?=[\\s,，、;；。/*@.]|$)`, 'gi');

  const yuanSuffixRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))\s*元/gi;
  const implicitRegex = /(?:^|[\s,各，、；;。/*\-@.[\]()【】])(\d{2,})/g;
  const endOfLineAmountRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))[\s,，、。#\-/*@.]*$/gi;

  const matches: { index: number, length: number, keyword: string }[] = [];
  let m;

  while ((m = strongRegex.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, keyword: m[1] });
  }
  while ((m = weakRegex.exec(text)) !== null) {
    const keyword = m[1] || m[4] || m[6];
    const amountStr = m[2] || m[3] || m[5] || m[7];
    const val = amountStr ? ( /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr) ) : 0;
    const hasSuffix = !!m[1]; // Branch 1 matches
    
    // “号”字特判：
    if (keyword === '号') {
      const beforeChar = text.substring(0, m.index).trim().slice(-1);
      if (/[\d一二三四五六七八九十百]/.test(beforeChar)) {
        // 作为数据分隔符，跳过金额锚点识别
        continue;
      }
      if (/[\u4e00-\u9fa5]/.test(beforeChar) && !/[一二三四五六七八九十百]/.test(beforeChar)) {
        // 如果前方是单纯汉字（如“特号”），视为强力金额锚点
        matches.push({ index: m.index, length: m[0].length, keyword: '号' });
        continue;
      }
    }

    if (val >= 50 || hasSuffix || text.substring(m.index).includes('元')) {
      matches.push({ index: m.index, length: m[0].length, keyword: keyword || 'weak' });
    }
  }
  while ((m = yuanSuffixRegex.exec(text)) !== null) {
    // “元”作为强力终止符，必须包含
    matches.push({ index: m.index, length: m[0].length, keyword: '元' });
  }
  while ((m = implicitRegex.exec(text)) !== null) {
    const val = parseInt(m[1], 10);
    const beforeText = text.substring(0, m.index);
    const afterText = text.substring(m.index + m[0].length);
    const followedByForbid = /^\s*[.\d,，各号字个每打买下压xX￥=＝:：号码尾头到拖胆带中碰]/.test(afterText);
    const followedByTarget = /^\s*[一二三四五六七八九十百马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽红蓝绿大小单双]/.test(afterText);
    const hasTargetBefore = /[^\d\s,，、；;。/*\-@.[\]()【】]/.test(beforeText);
    const hasNumberRightBefore = /[\d][\s,，、；;。/*\-@.[\]()【】]*$/.test(beforeText);

    if (val >= 50 || (!followedByForbid && (afterText.trim() === '' || followedByTarget) && hasTargetBefore && !hasNumberRightBefore)) {
      matches.push({ index: m.index, length: m[0].length, keyword: 'implicit' });
    }
  }

  // 如果仍无锚点，识别行尾金额
  if (matches.length === 0) {
    while ((m = endOfLineAmountRegex.exec(text)) !== null) {
      const amountStr = m[1] || m[2];
      const val = amountStr ? (/^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr)) : 0;
      
      const beforeIndex = m.index;
      const rawBeforeText = text.substring(0, beforeIndex);
      const connectors = rawBeforeText.match(/[\s,，、。#\-/*@.]/g);
      
      // 分隔符密度检测：如果连接符在行内高频出现 (>=2次)，且当前数字属于 1-49 范围，则很大可能是数据列表而非金额
      // 这能有效解决 02.38.40.46...21 被误识别为金额的问题
      if (connectors) {
        const lastChar = connectors[connectors.length - 1];
        const charCount = (rawBeforeText.split(lastChar).length - 1);
        if (charCount >= 2 && val <= 49) {
          continue; 
        }
      }
      
      matches.push({ index: m.index, length: m[0].length, keyword: 'EOL' });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function splitByAnchors(text: string): string[] {
  const allMatches = findAllAnchors(text);
  const segments: string[] = [];
  
  if (allMatches.length === 0) {
    return [];
  }

  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);

  // 关键优化：过滤掉“冲突锚点”
  // 如果一个号/码/：/等弱符号后面紧跟着另一个符号（且中间没有空格等强分隔符），说明它实际上是目标分隔符而非金额锚点
  const filteredMatches: { index: number, length: number }[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const nextM = allMatches[i + 1];
    
    if (nextM && (m.keyword === '号' || m.keyword === '码' || m.keyword === '/' || m.keyword === ':' || m.keyword === '：')) {
      // 检查当前锚点结束到下一个锚点开始之间的文本
      const gapText = text.substring(m.index + m.length, nextM.index);
      // 如果中间只有数字和基础分隔符（逗号、句点），且没有明显的“记录边界”（如空格），则忽略当前这个弱锚点
      // 例如 "11号12号" -> 中间是 "12"，将被忽略
      // 例如 "11号,12号" -> 中间是 ",12"，符合条件，也将忽略
      // 例如 "11号30 19号" -> 中间是 "30 19"，包含空格，则保留
      if (/^[\s,，.、]*\d+[\s,，.、]*$/.test(gapText) && !gapText.includes(' ') && !gapText.includes('　')) {
        continue;
      }
    }
    filteredMatches.push(m);
  }

  let lastIndex = 0;
  for (const m of filteredMatches) {
    const anchorEnd = m.index + m.length;
    const segment = text.substring(lastIndex, anchorEnd).trim();
    if (segment) {
      segments.push(segment);
    }
    lastIndex = anchorEnd;
  }
  
  // 处理可能存在的隐式末尾指令 (如 "35 100")
  const remaining = text.substring(lastIndex).trim();
  if (remaining) {
    if (/\d+|[一二三四五六七八九十百]+/.test(remaining)) {
      const implicitMatch = remaining.match(/^(.*?)(\d+|[一二三四五六七八九十百]+)\s*(?:元|米|斤|块|位|个|一个)?\D*$/);
      if (implicitMatch) {
        // 隐式匹配也需要校验：如果是弱分割（空格），数字 >= 50 or 有非数字前缀
        const valStr = implicitMatch[2];
        const val = /^\d+$/.test(valStr) ? parseInt(valStr, 10) : chineseToNumber(valStr);
        const hasSuffix = !!remaining.match(/(元|米|斤|块|位|个|一个)\D*$/);
        const hasNonNumericPrefix = /[^\d\s,各，、；;。/*\-@.]/.test(implicitMatch[1]);
        
        let isValid = false;
        if (val >= 50 || hasSuffix || hasNonNumericPrefix) {
          isValid = true;
        }
        
        segments.push(remaining);
      } else {
        segments.push(remaining);
      }
    } else {
      segments.push(remaining);
    }
  }
  
  if (segments.length === 0 && /\d+/.test(text)) {
    // 移除 fallback，如果没有任何锚点且不是隐式末尾，则返回空，让上一层 buffer 处理
    // segments.push(text);
  }
  
  return segments;
}

/**
 * 解析单个指令段 (现在返回数组，支持如 "马龙各50" 拆分为两个结果)
 */
function parseSegment(segment: string, keywords: string[], comboKeywords: string[]): ParseResult[] | null {
  // 识别连码类型
  let comboType: 'single' | '三中三' | '二中二' | '特碰' = 'single';
  const lowerSegment = segment.toLowerCase();
  if (lowerSegment.includes('三中三') || lowerSegment.includes('3中3')) comboType = '三中三';
  else if (lowerSegment.includes('二中二') || lowerSegment.includes('2中2')) comboType = '二中二';
  else if (lowerSegment.includes('特碰')) comboType = '特碰';

  // 1. 寻找最佳金额锚点
  // 规则：强度优先 (Strong > Weak)，位置优先 (Right-most)，长度优先 (Longer wins)
  const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
  const kwPattern = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const anchorRegex = new RegExp(`(${kwPattern})[\\s,，、。#\\-/*@.]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))[\\s元米斤块位个一个]*`, 'g');
  const yuanRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百]+)(?![一二三四五六七八九十百]))\s*元/g;

  const matches: { keyword: string, amount: string, index: number, length: number, isStrong: boolean }[] = [];
  let m;
  while ((m = anchorRegex.exec(segment)) !== null) {
    const keyword = m[1];
    const amountStr = m[2] || m[3];
    const val = amountStr ? ( /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr) ) : 0;
    const isStrong = STRONG_KEYWORDS.includes(keyword);
    
    // 弱锚点校验：如果金额 < 50 且没有强币种后缀，则不将其视为金额锚点
    if (!isStrong) {
      if (val < 50 && !segment.includes('元')) continue;
    }

    matches.push({
      keyword,
      amount: amountStr,
      index: m.index,
      length: m[0].length,
      isStrong
    });
  }

  while ((m = yuanRegex.exec(segment)) !== null) {
    // 如果还没被识别，则作为元金额点
    if (!matches.some(ex => ex.index === m.index)) {
      matches.push({
        keyword: '元',
        amount: m[1] || m[2],
        index: m.index,
        length: m[0].length,
        isStrong: true
      });
    }
  }

  let bestMatch = null;
  if (matches.length > 0) {
    // 排序逻辑：
    // a) Strong 优先于 Weak
    // b) 同时出发位置 (index) 越靠后越优先
    // c) 如果 index 相同（由于是正则全局匹配，index 通常不同，但为了严谨），长度越长越优先
    matches.sort((a, b) => {
      if (a.isStrong !== b.isStrong) return b.isStrong ? 1 : -1;
      if (a.index !== b.index) return b.index - a.index;
      return b.length - a.length;
    });
    bestMatch = matches[0];
  }

  let targetsStr = '';
  let amountStr = '';
  let raw = segment;

  if (bestMatch) {
    targetsStr = segment.substring(0, bestMatch.index).trim();
    amountStr = bestMatch.amount;
  } else {
    // 兜底逻辑：找末尾数字 (隐式指令)
    const tailMatch = segment.match(/^(.*?)(\d+|[一二三四五六七八九十百]+)\s*(元|米|斤|块|位|个|一个)?\D*$/);
    if (tailMatch) {
      const candidateAmount = tailMatch[2];
      const hasSuffix = !!tailMatch[3];
      const targetPrefix = tailMatch[1].trim();
      const hasNonNumericTarget = /[^\d\s,各，、；;。/*\-@.]/.test(targetPrefix);
      
      let isValid = true;
      if (!hasSuffix && /^\d+$/.test(candidateAmount)) {
        const val = parseInt(candidateAmount, 10);
        // 如果没有非数字目标，且金额 <= 49，
        // 遵循用户指令：如果没有识别到金额符，则把数据最后一次认定成金额
        if (val <= 49 && !hasNonNumericTarget) {
          if (!targetPrefix) {
            isValid = false;
          } else {
            // 用户指令非常明确：如果没有识别到金额符，则把数据最后一次认定成金额
            // 为了满足这一要求，我们允许任何末尾数字作为金额，只要前面有内容
            isValid = true;
          }
        }
      }
      
      if (isValid && targetPrefix) {
        targetsStr = targetPrefix;
        amountStr = candidateAmount;
      }
    }
  }

  if (!targetsStr || !amountStr) return null;

  // 清理目标字符串：只保留数字、生肖、分类等有效关键词，移除所有杂质符号和汉字
  const cleanDisplayRaw = (str: string) => {
    // 允许的字符白名单：数字、生肖、分类(家禽野兽)、颜色、大小单双、范围关键词
    const whitelist = new RegExp(`[^\\d一二三四五六七八九十百马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽红蓝绿兰篮大小单双到尾头中碰反字数合金木水火土波色]`, 'g');
    
    // 在清理前，先尝试将 Targets 中的谐音字替换为标准字
    let normalized = str;

    // 先移除所有已知的切割/金额关键词，防止它们被转换成数字（如“一个” -> “1个” -> “01”）
    const sortedKws = [...ALL_KEYWORDS].sort((a, b) => b.length - a.length);
    sortedKws.forEach(kw => {
      const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      normalized = normalized.replace(kwRegex, ' ');
    });

    normalized = normalized.replace(/肖/g, ' ');   // 移除单独的“肖”字
    normalized = normalized.replace(/合数/g, '合'); // 统一将“合数”转换为“合”

    // 将中文数字转换为阿拉伯数字进行显示
    normalized = normalized.replace(/零/g, '0')
                           .replace(/一/g, '1')
                           .replace(/二/g, '2')
                           .replace(/三/g, '3')
                           .replace(/四/g, '4')
                           .replace(/五/g, '5')
                           .replace(/六/g, '6')
                           .replace(/七/g, '7')
                           .replace(/八/g, '8')
                           .replace(/九/g, '9');
    
    // 针对“十”，进行智能转换以支持 11-19, 20-99 等
    normalized = normalized.replace(/([0-9])十([0-9])/g, '$1$2')
                           .replace(/十([0-9])/g, '1$1')
                           .replace(/([0-9])十/g, '$10')
                           .replace(/十/g, '10');
    normalized = normalized.replace(/百/g, '100');

    // 1. 规整化：颜色简写 -> 标准波色
    normalized = normalized.replace(/[兰篮]/g, '蓝');
    normalized = normalized.replace(/(红|蓝|绿)(?!波|单|双|大|小|合)/g, '$1波');
    
    // 2. 规整化：分类词 -> 标准名
    normalized = normalized.replace(/家禽|家肖|家兽|家/g, '家禽');
    normalized = normalized.replace(/野肖|野兽|野/g, '野肖');
    normalized = normalized.replace(/反数|反字|反/g, '反数');

    Object.entries(ZODIAC_HOMOPHONES).forEach(([real, variations]) => {
      variations.forEach(v => {
        if (v !== real) {
          normalized = normalized.replace(new RegExp(v, 'g'), real);
        }
      });
    });

    // 特殊处理：将 "0 1 2头", "345尾", "尾345" 等转换成 "0头 1头 2头" 格式显示
    // 逻辑：寻找数字加上分隔符的组合，后面接头尾；或头尾后面接数字组合
    // 优化正则，允许数字与头尾之间存在分隔符（如 "3、2、5、尾"）
    const headTailRegex = /(\d+(?:[\s.，、\-\/@*。]+\d+)*)[\s.，、\-\/@*。]*([头尾])|([头尾])[\s.，、\-\/@*。]*(\d+(?:[\s.，、\-\/@*。]+\d+)*)/g;
    normalized = normalized.replace(headTailRegex, (match, pSuffix, suffixStr, prefixStr, pPrefix) => {
      const p = pSuffix || pPrefix;
      const suffix = suffixStr || prefixStr;
      const parts = p.split(/([\s.，、\-\/@*。]+)/);
      
      if (pSuffix) {
        let confirmedStartIndex = parts.length;
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          if (/[\s.，、\-\/@*。]+/.test(part)) continue;
          if (part.length > 1 && i < parts.length - 1) break;
          confirmedStartIndex = i;
        }
        if (confirmedStartIndex < parts.length) {
          const beforeTailsStr = parts.slice(0, confirmedStartIndex).join('');
          const tailDigitsStr = parts.slice(confirmedStartIndex).join('');
          const expanded = (tailDigitsStr.match(/\d/g) || []).map(d => ` ${d}${suffix} `).join(' ');
          return beforeTailsStr + expanded;
        }
      } else {
        let confirmedEndIndex = -1;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (/[\s.，、\-\/@*。]+/.test(part)) continue;
          if (part.length > 1 && i > 0) break;
          confirmedEndIndex = i;
        }
        if (confirmedEndIndex >= 0) {
          const tailDigitsStr = parts.slice(0, confirmedEndIndex + 1).join('');
          const afterTailsStr = parts.slice(confirmedEndIndex + 1).join('');
          const expanded = (tailDigitsStr.match(/\d/g) || []).map(d => ` ${d}${suffix} `).join(' ');
          return expanded + afterTailsStr;
        }
      }
      return match;
    });

    return normalized
      .replace(whitelist, ' ')                    // 不在白名单内的全部替换为空格
      .replace(/([马蛇龙兔虎牛鼠猪狗鸡猴羊])/g, ' $1 ') // 仅针对生肖字前后增加空格，实现生肖间的分离
      .replace(/(\d+)(?![尾头])/g, ' $1 ')         // 确保普通数字前后有空格，排除尾/头
      .replace(/(\d+[尾头])/g, ' $1 ')             // 确保“X尾/X头”作为一个整体前后有空格
      .replace(/\s+/g, ' ')                       // 合并多个空格
      .trim()
      .split(' ')
      .flatMap(part => {
        // 如果是 "3尾" 或 "3头" 这种格式，直接返回，不补零
        const catMatch = part.match(/^(\d+)[尾头]$/);
        if (catMatch) {
          return [part];
        }

        if (/^\d+$/.test(part)) {
          if (part === '0') {
            return ['0尾'];
          }
          if (part.length <= 2) {
            return [part.padStart(2, '0')];
          } else {
            // 对连在一起的长数字串进行智能拆分并补零显示
            return smartSplitDigits(part).map(n => n.toString().padStart(2, '0'));
          }
        }
        // 屏蔽掉单独的“数”这个字
        if (part === '数') {
          return [];
        }
        // 特殊处理：如果 part 中包含非数字且包含“数”字，但不是已知的组合词，则屏蔽掉其中的“数”
        // 注意：因为 whitelist 允许了“数”，所以如果它没在 combinations 中被替换，会留在这里
        // 如果是单独的“数”已经在上面处理了，这里处理类似“马数”这种情况
        // 但由于马后面加了空格，所以“马数”其实已经变成了 ["马", "数"]，会被上面的 if 捕获
        return [part];
      })
      .join(' ')                                  // 使用空格连接，主要是在数字和关键词间留出空格
      .replace(/([红蓝绿])\s+([大小单双波])/g, '$1$2') // 合并波色组合词（如 红 双 -> 红双）
      .replace(/(合)\s+([大小单双])/g, '$1$2')     // 合并合数组合词（如 合 单 -> 合单）
      .replace(/([大小])\s+([单双])/g, '$1$2')     // 合并大小单双（如 大 单 -> 大单）
      .replace(/\s+/g, ' ')                        // 再次清理可能产生的双空格
      .trim();
  };

  const amount = chineseToNumber(amountStr);
  if (isNaN(amount) || amount === 0) return null;

  const results: ParseResult[] = [];

  // 如果是复式，识别胆码并作为一个整体返回
  if (comboType !== 'single') {
    const targetNumbers: number[] = [];
    let banker: number | undefined = undefined;

    if (comboType === '特碰') {
      const bankerMatch = targetsStr.match(/(\d+)\s*(?:拖|胆|带)/);
      if (bankerMatch) {
        banker = parseInt(bankerMatch[1], 10);
        targetsStr = targetsStr.replace(bankerMatch[0], ' ');
      }
    }

    const cleanNums = targetsStr.replace(/[^\d]/g, ' ');
    const numMatches = cleanNums.match(/\d+/g);
    if (numMatches) {
      numMatches.forEach(nStr => {
        const n = parseInt(nStr, 10);
        if (n >= 1 && n <= 49) targetNumbers.push(n);
      });
    }

    if (targetNumbers.length > 0) {
      results.push({
        numbers: targetNumbers,
        amount,
        raw: cleanDisplayRaw(targetsStr),
        type: comboType,
        banker
      });
    }
  } else {
    // 特码逻辑：收集该段内所有的号码
    const allNumbers: number[] = [];
    
    // 保护包含关键字的特殊组合 (如 '字', '数')，防止被后续的干扰词移除逻辑误删
    const PROTECTED_COMBOS = ['倒反数', '反数', '反字', '倒反', '反', '大数', '小数'];
    let protectedStr = targetsStr;
    
    // 同时也移除可能在 targetsStr 中遗留的 Header
    const sortedHead = [...HEADER_KEYWORDS].sort((a, b) => b.length - a.length);
    sortedHead.forEach(h => {
      protectedStr = protectedStr.replace(new RegExp(h, 'g'), ' ');
    });

    PROTECTED_COMBOS.forEach((p, idx) => {
      protectedStr = protectedStr.replace(new RegExp(p, 'g'), `__PC_${idx}__`);
    });

    let remainingStr = protectedStr; // 用于提取独立数字的剩余字符串

    // 预处理：移除 targetsStr 中可能存在的干扰关键词 (如“号码”、“每个”)
    const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
    sortedKws.forEach(kw => {
      const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      remainingStr = remainingStr.replace(kwRegex, ' ');
    });

    // 还原被保护的特殊组合
    PROTECTED_COMBOS.forEach((p, idx) => {
      remainingStr = remainingStr.replace(new RegExp(`__PC_${idx}__`, 'g'), p);
    });

    let displayRaw = cleanDisplayRaw(targetsStr);
    // 再次清理 displayRaw，移除由于 targetsStr 包含关键词而留下的杂质（如“号码”中的“号”）
    sortedKws.forEach(kw => {
      const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      displayRaw = displayRaw.replace(kwRegex, ' ');
    });
    // 修改：不再移除所有空格，只合并空格并修整边缘，确保数字间保留空格
    displayRaw = displayRaw.replace(/\s+/g, ' ').trim(); 

    // 0. 处理分类 (家禽/野兽)
    // 逻辑说明：此处直接映射到生肖名称。解析时通过 getNumbersByZodiac(z) 动态获取号码。
    // 只要顶部的 ZODIAC_LIST 随年份更新（首位为当年生肖），此处逻辑将自动适配，无需手动修改号码。
    const CATEGORIES = [
      { key: ['家禽', '家肖', '家'], zodiacs: ['牛', '马', '羊', '鸡', '狗', '猪'] },
      { key: ['野肖', '野兽', '野'], zodiacs: ['鼠', '虎', '兔', '龙', '蛇', '猴'] },
    ];

    CATEGORIES.forEach(cat => {
      const pattern = cat.key.join('|');
      const regex = new RegExp(pattern, 'g');
      // 使用 remainingStr 进行检测，防止命中已被移除的关键词
      if (regex.test(remainingStr)) {
        const count = (remainingStr.match(regex) || []).length;
        for (let i = 0; i < count; i++) {
          cat.zodiacs.forEach(z => {
            allNumbers.push(...getNumbersByZodiac(z));
          });
        }
        // 如果匹配到了分类，将 displayRaw 替换为标准名称 (如 "家" -> "家禽")
        const replacePattern = new RegExp(cat.key.sort((a, b) => b.length - a.length).join('|'), 'g');
        displayRaw = displayRaw.replace(replacePattern, cat.key[0]);
        remainingStr = remainingStr.replace(regex, ' ');
      }
    });

    // 1. 处理 "X尾" 或 "尾X"
    const tailRegex = /([\d\s.，、\-\/@*。零一二三四五六七八九]+)尾/g;
    const tailPrefixRegex = /尾([\d\s.，、\-\/@*。零一二三四五六七八九]+)/g;
    
    remainingStr = remainingStr.replace(tailRegex, (match, prefix) => {
      const parts = prefix.split(/([\s.，、\-\/@*。]+)/);
      let confirmedStartIndex = parts.length;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (/[\s.，、\-\/@*。]+/.test(part)) continue;
        if (part.length > 1 && i < parts.length - 1) break;
        confirmedStartIndex = i;
      }
      if (confirmedStartIndex < parts.length) {
        const beforeTailsStr = parts.slice(0, confirmedStartIndex).join('');
        const tailDigitsStr = parts.slice(confirmedStartIndex).join('');
        const digits = tailDigitsStr.match(/\d|[零一二三四五六七八九]/g);
        if (digits) {
          digits.forEach(d => {
            const tail = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
            for (let i = 1; i <= 49; i++) {
              if (i % 10 === tail) allNumbers.push(i);
            }
          });
        }
        return beforeTailsStr + ' ';
      }
      return match;
    });

    remainingStr = remainingStr.replace(tailPrefixRegex, (match, prefix) => {
      const parts = prefix.split(/([\s.，、\-\/@*。]+)/);
      let confirmedEndIndex = -1;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (/[\s.，、\-\/@*。]+/.test(part)) continue;
        if (part.length > 1 && i > 0) break;
        confirmedEndIndex = i;
      }
      if (confirmedEndIndex >= 0) {
        const tailDigitsStr = parts.slice(0, confirmedEndIndex + 1).join('');
        const afterTailsStr = parts.slice(confirmedEndIndex + 1).join('');
        const digits = tailDigitsStr.match(/\d|[零一二三四五六七八九]/g);
        if (digits) {
          digits.forEach(d => {
            const tail = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
            for (let i = 1; i <= 49; i++) {
              if (i % 10 === tail) allNumbers.push(i);
            }
          });
        }
        return ' ' + afterTailsStr;
      }
      return match;
    });

    // 1.1 处理 "X头" 或 "头X"
    const headRegex = /([\d\s.，、\-\/@*。零一二三四五六七八九]+)头/g;
    const headPrefixRegex = /头([\d\s.，、\-\/@*。零一二三四五六七八九]+)/g;
    
    remainingStr = remainingStr.replace(headRegex, (match, prefix) => {
      const parts = prefix.split(/([\s.，、\-\/@*。]+)/);
      let confirmedStartIndex = parts.length;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (/[\s.，、\-\/@*。]+/.test(part)) continue;
        if (part.length > 1 && i < parts.length - 1) break;
        confirmedStartIndex = i;
      }
      if (confirmedStartIndex < parts.length) {
        const beforeTailsStr = parts.slice(0, confirmedStartIndex).join('');
        const tailDigitsStr = parts.slice(confirmedStartIndex).join('');
        const digits = tailDigitsStr.match(/\d|[零一二三四五六七八九]/g);
        if (digits) {
          digits.forEach(d => {
            const head = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
            if (head >= 0 && head <= 4) {
              for (let i = 1; i <= 49; i++) {
                if (Math.floor(i / 10) === head) allNumbers.push(i);
              }
            }
          });
        }
        return beforeTailsStr + ' ';
      }
      return match;
    });

    remainingStr = remainingStr.replace(headPrefixRegex, (match, prefix) => {
      const parts = prefix.split(/([\s.，、\-\/@*。]+)/);
      let confirmedEndIndex = -1;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (/[\s.，、\-\/@*。]+/.test(part)) continue;
        if (part.length > 1 && i > 0) break;
        confirmedEndIndex = i;
      }
      if (confirmedEndIndex >= 0) {
        const tailDigitsStr = parts.slice(0, confirmedEndIndex + 1).join('');
        const afterTailsStr = parts.slice(confirmedEndIndex + 1).join('');
        const digits = tailDigitsStr.match(/\d|[零一二三四五六七八九]/g);
        if (digits) {
          digits.forEach(d => {
            const head = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
            if (head >= 0 && head <= 4) {
              for (let i = 1; i <= 49; i++) {
                if (Math.floor(i / 10) === head) allNumbers.push(i);
              }
            }
          });
        }
        return ' ' + afterTailsStr;
      }
      return match;
    });

    // 2. 处理 "X到Y"
    const rangeRegex = /(\d+|[一二三四五六七八九十百]+)\s*到\s*(\d+|[一二三四五六七八九十百]+)/g;
    let rangeMatch;
    // 使用 remainingStr 进行正则匹配
    while ((rangeMatch = rangeRegex.exec(remainingStr)) !== null) {
      const startStr = rangeMatch[1];
      const endStr = rangeMatch[2];
      const start = /\d/.test(startStr) ? parseInt(startStr, 10) : chineseToNumber(startStr);
      const end = /\d/.test(endStr) ? parseInt(endStr, 10) : chineseToNumber(endStr);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) {
        if (i >= 1 && i <= 49) allNumbers.push(i);
      }
    }
    remainingStr = remainingStr.replace(rangeRegex, ' ');

    // 3. 大小单双 & 特殊组合逻辑 (移至生肖之前，防止“反数”中的“数”被识别为生肖)
    const combinations = [
      // 3项/4项组合 (合数 + 大小 + 单双 + 合单双)
      { key: '合大单单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && s % 2 !== 0 && n % 2 !== 0; } },
      { key: '合大单双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && s % 2 !== 0 && n % 2 === 0; } },
      { key: '合大双单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && s % 2 === 0 && n % 2 !== 0; } },
      { key: '合大双双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && s % 2 === 0 && n % 2 === 0; } },
      { key: '合小单单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && s % 2 !== 0 && n % 2 !== 0; } },
      { key: '合小单双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && s % 2 !== 0 && n % 2 === 0; } },
      { key: '合小双单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && s % 2 === 0 && n % 2 !== 0; } },
      { key: '合小双双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && s % 2 === 0 && n % 2 === 0; } },
      { key: '合大单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && n % 2 !== 0; } },
      { key: '合大双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7 && n % 2 === 0; } },
      { key: '合小单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && n % 2 !== 0; } },
      { key: '合小双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6 && n % 2 === 0; } },

      // 波色 + 大小 + 单双 组合
      { key: '红大单', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n >= 25 && n % 2 !== 0 },
      { key: '红大双', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n >= 25 && n % 2 === 0 },
      { key: '红小单', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n <= 24 && n % 2 !== 0 },
      { key: '红小双', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n <= 24 && n % 2 === 0 },
      { key: '蓝大单', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n >= 25 && n % 2 !== 0 },
      { key: '蓝大双', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n >= 25 && n % 2 === 0 },
      { key: '蓝小单', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n <= 24 && n % 2 !== 0 },
      { key: '蓝小双', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n <= 24 && n % 2 === 0 },
      { key: '绿大单', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n >= 25 && n % 2 !== 0 },
      { key: '绿大双', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n >= 25 && n % 2 === 0 },
      { key: '绿小单', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 && n % 2 !== 0 },
      { key: '绿小双', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 && n % 2 === 0 },

      // 其他常见两两组合
      { key: '红单', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n % 2 !== 0 },
      { key: '红双', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n % 2 === 0 },
      { key: '蓝单', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n % 2 !== 0 },
      { key: '蓝双', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n % 2 === 0 },
      { key: '绿单', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n % 2 !== 0 },
      { key: '绿双', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n % 2 === 0 },
      { key: '红大', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n >= 25 },
      { key: '红小', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n <= 24 },
      { key: '蓝大', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n >= 25 },
      { key: '蓝小', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n <= 24 },
      { key: '绿大', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n >= 25 },
      { key: '绿小', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 },
      { key: '大单', filter: (n: number) => n >= 25 && n % 2 !== 0 },
      { key: '大双', filter: (n: number) => n >= 25 && n % 2 === 0 },
      { key: '小单', filter: (n: number) => n <= 24 && n % 2 !== 0 },
      { key: '小双', filter: (n: number) => n <= 24 && n % 2 === 0 },
      { key: '合单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0; } },
      { key: '合双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0; } },
      { key: '合大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7; } },
      { key: '合小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6; } },

      // 增加常见三项简写组合 (支持乱序)
      { key: '大单红', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '大双红', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '小单红', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '小双红', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '大单蓝', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '大双蓝', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '小单蓝', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '小双蓝', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '大单绿', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
      { key: '大双绿', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
      { key: '小单绿', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
      { key: '小双绿', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['绿'] as unknown as number[]).includes(n) },

      // 原有 2项/3项组合
      { key: '绿单', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '绿双', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '蓝单', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '蓝双', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '红单', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '红双', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '合单小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0 && n <= 24; } },
      { key: '合双小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0 && n <= 24; } },
      { key: '合单大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0 && n >= 25; } },
      { key: '合双大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0 && n >= 25; } },
      { key: '合单单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0 && n % 2 !== 0; } },
      { key: '合单双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0 && n % 2 === 0; } },
      { key: '合双单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0 && n % 2 !== 0; } },
      { key: '合双双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0 && n % 2 === 0; } },
      { key: '蓝小', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '蓝大', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '红小', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '红大', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '绿小', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '绿大', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '大单', filter: (n: number) => n >= 25 && n % 2 !== 0 },
      { key: '大双', filter: (n: number) => n >= 25 && n % 2 === 0 },
      { key: '小单', filter: (n: number) => n <= 24 && n % 2 !== 0 },
      { key: '小双', filter: (n: number) => n <= 24 && n % 2 === 0 },
      { key: '红单', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '红双', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '蓝单', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '蓝双', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '绿单', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '绿双', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '红大', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '红小', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '蓝大', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '蓝小', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '绿大', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '绿小', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '大', filter: (n: number) => n >= 25 },
      { key: '小', filter: (n: number) => n <= 24 },
      { key: '单', filter: (n: number) => n % 2 !== 0 },
      { key: '双', filter: (n: number) => n % 2 === 0 },
      { key: '红', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '蓝', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '兰', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '篮', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '绿', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
      { key: '金', filter: (n: number) => (ELEMENTS_MAP['金'] as unknown as number[]).includes(n) },
      { key: '木', filter: (n: number) => (ELEMENTS_MAP['木'] as unknown as number[]).includes(n) },
      { key: '水', filter: (n: number) => (ELEMENTS_MAP['水'] as unknown as number[]).includes(n) },
      { key: '火', filter: (n: number) => (ELEMENTS_MAP['火'] as unknown as number[]).includes(n) },
      { key: '土', filter: (n: number) => (ELEMENTS_MAP['土'] as unknown as number[]).includes(n) },
      { key: '色', filter: (n: number) => false }, // 占位符，防止“色”被拆分
      { key: '合单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0; } },
      { key: '合双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0; } },
      { key: '合大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7; } },
      { key: '合小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6; } },
      { key: '反', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
      { key: '倒反', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
    ];

    // 按长度排序防止子串命中 (如 "倒反数" 命中 "反数")
    combinations.sort((a, b) => b.key.length - a.key.length);

    combinations.forEach(combo => {
      const regex = new RegExp(combo.key, 'g');
      // 关键修复：使用 remainingStr 进行匹配计数
      const count = (remainingStr.match(regex) || []).length;
      for (let i = 0; i < count; i++) {
        for (let n = 1; n <= 49; n++) {
          if (combo.filter(n)) allNumbers.push(n);
        }
      }
      remainingStr = remainingStr.replace(regex, ' ');
    });

    // 交叉组合识别逻辑 (针对无分隔符的组合，如 "红小双")
    // 如果原始目标字符串中包含多个组合模式，且没有明显分隔符，尝试计算交集
    const hasSeparators = /[\s,，、。#\/*@.]/.test(targetsStr);
    if (!hasSeparators) {
      const matchedFilterKeys: string[] = [];
      const intersectionFilters: ((n: number) => boolean)[] = [];
      
      // 检查 targetsStr 中出现了哪些组合 key
      combinations.forEach(combo => {
        if (targetsStr.includes(combo.key)) {
          matchedFilterKeys.push(combo.key);
          intersectionFilters.push(combo.filter);
        }
      });

      // 如果命中了 2 个及以上的过滤器，且它们能产生交集，则替换当前 pooled 号码
      if (intersectionFilters.length >= 2) {
        const intersectionNums = [];
        for (let n = 1; n <= 49; n++) {
          if (intersectionFilters.every(f => f(n))) {
            intersectionNums.push(n);
          }
        }
        if (intersectionNums.length > 0) {
          // 清空并重新填充（这里需要小心，因为可能还有其他独立号码）
          // 但根据用户描述，这种组合通常是独立出现的
          return [{
            numbers: intersectionNums,
            amount: amount,
            raw: displayRaw,
            type: comboType
          }];
        }
      }
    }

    // 4. 提取生肖 (含谐音)
    // 收集所有谐音及其映射关系，按字符长度倒序排列，防止短字误伤长字
    const flatVariations: { v: string, real: string }[] = [];
    Object.entries(ZODIAC_HOMOPHONES).forEach(([realZodiac, variations]) => {
      variations.forEach(v => flatVariations.push({ v, real: realZodiac }));
    });
    flatVariations.sort((a, b) => b.v.length - a.v.length);

    flatVariations.forEach(({ v, real }) => {
      const regex = new RegExp(v, 'g');
      // 关键修复：使用 remainingStr 进行匹配计数
      const count = (remainingStr.match(regex) || []).length;
      for (let i = 0; i < count; i++) {
        allNumbers.push(...getNumbersByZodiac(real));
      }
      remainingStr = remainingStr.replace(regex, ' ');
    });

    // 5. 提取独立数字 (使用排除后的剩余字符串)
    const cleanNums = remainingStr.replace(/[^\d]/g, ' ');
    const numMatches = cleanNums.match(/\d+/g);
    if (numMatches) {
      numMatches.forEach(nStr => {
        if (nStr.length <= 2) {
          const n = parseInt(nStr, 10);
          if (n >= 1 && n <= 49) {
            allNumbers.push(n);
          } else if (n === 0) {
            // 特殊处理：单走一个 0 视为 0 尾
            for (let j = 1; j <= 49; j++) {
              if (j % 10 === 0) allNumbers.push(j);
            }
          }
        } else {
          // 使用智能拆分函数处理长数字串
          allNumbers.push(...smartSplitDigits(nStr));
        }
      });
    }

    if (allNumbers.length > 0) {
      results.push({
        numbers: allNumbers,
        amount,
        raw: displayRaw,
        type: comboType
      });
    }

    return results.length > 0 ? results : null;
  }

  return null;
}
