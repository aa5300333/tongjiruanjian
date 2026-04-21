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
  '二': '2',
  '三': '3',
  '四': '4',
  '五': '5',
  '六': '6',
  '七': '7',
  '八': '8',
  '勾': '9',
  '九': '9',
  '实': '10',
  '十': '10',
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
  const KEYWORDS = [
    '每个', '各', '个', '字', '每', '打', '买', '下', 'x', 'X', '￥', ':', '=', '/', 
    '数', '：', '＝'
  ];
  const IGNORE_TARGETS = ['合计', '总计', '总共', '共计', '累计', '合计金额', '总额'];
  const HEADER_KEYWORDS = [
    '新澳门', '澳门特码', '新奥特码', '澳门特', '澳门', '特码', '澳特', '特',
    '上报数据明细', '数据明细', '明细', '报单', '报单明细', '清单', '下注清单',
    '上报散码数据', '散码数据', '上报数据', '上报散码', '散码', '上报'
  ];

  // 1. 识别库：处理已知的特殊模式或错误纠回
  const RECOGNITION_LIBRARY: Array<{ pattern: RegExp, replacement: string | ((...args: any[]) => string) }> = [
    // 修复 "01到12" 被冒号断开的问题：将 "门：01到12" 类型的标签冒号暂时移位或移除
    { pattern: /门[：:](?=\d)/g, replacement: '门 ' },
  ];

  let preProcessed = input;
  RECOGNITION_LIBRARY.forEach(rec => {
    preProcessed = preProcessed.replace(rec.pattern, rec.replacement as any);
  });
  
  // 2. 移除汇总信息和报头信息
  const sortedIgnore = [...IGNORE_TARGETS].sort((a, b) => b.length - a.length);
  const summaryRegex = new RegExp(`(?:${sortedIgnore.join('|')})[:：]?\\s*(?:共|额|金额)?\\s*\\d+\\s*元?(?![=：＝:各个字每打买下xX￥/])`, 'gi');
  const headerRegex = new RegExp(`(?:^|[\\s。，,])(?:${HEADER_KEYWORDS.sort((a, b) => b.length - a.length).join('|')})[:：]?`, 'gi');
  
  let cleanedInput = preProcessed.replace(summaryRegex, '');
  cleanedInput = cleanedInput.replace(headerRegex, ' ');

  // 3. 处理跨行指令，并在特定情况下转换 "-"
  // 逻辑：如果输入包含 "18-100" 这种格式，且 "-" 后的数字大于 49，则将其转换为 "18各100"
  let rangeProcessed = cleanedInput.replace(/(\d+)\s*-\s*(\d+)(?![-\d])/g, (match, p1, p2) => {
    const num = parseInt(p1, 10);
    const amount = parseInt(p2, 10);
    if (num <= 49 && amount > 49) {
      return `${p1}各${p2}`;
    }
    return match;
  });

  const unifiedInput = rangeProcessed.split(/[\n\r]+/).map(l => l.trim()).filter(l => l).join(' ');
  
  const allResults: ParseResult[] = [];
  const COMBO_KEYWORDS = ['三中三', '3中3', '二中二', '2中2', '特碰', '三中二', '二中特'];
  
  // 3. 使用“金额锚点”逻辑进行切分
  const segments = splitByAnchors(unifiedInput);
  
  for (const segment of segments) {
    const results = parseSegment(segment, KEYWORDS, COMBO_KEYWORDS);
    if (results && results.length > 0) {
      allResults.push(...results);
    }
  }
  
  return allResults;
}

/**
 * 金额锚点切分算法
 * 寻找所有可能的金额点，并将之前的文本归为该金额的目标
 */
function splitByAnchors(text: string): string[] {
  const segments: string[] = [];
  const STRONG_KEYWORDS = [
    '每个', '各', '个', '字', '每', '打', '买', '下', 'x', 'X', '￥'
  ];
  const WEAK_KEYWORDS = [':', '=', '/', '：', '＝'];
  
  const sortedStrong = [...STRONG_KEYWORDS].sort((a, b) => b.length - a.length);
  const strongPattern = sortedStrong.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  
  const sortedWeak = [...WEAK_KEYWORDS].sort((a, b) => b.length - a.length);
  const weakPattern = sortedWeak.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // 匹配强关键字：后面跟着数字即可
  const strongRegex = new RegExp(`(${strongPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(?:元|米|斤|块|位|个|一个)?(?![\\d一二三四五六七八九十百])`, 'g');
  
  // 匹配弱关键字：后面必须跟着 > 49 的数字，或者带有货币/计数后缀
  const weakRegex = new RegExp(`(${weakPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(元|米|斤|块|位|个|一个)(?![\\d一二三四五六七八九十百])|(${weakPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d{2,}|[一二三四五六七八九十百]+)(?![\\d一二三四五六七八九十百])`, 'g');

  const allMatches: { index: number, length: number }[] = [];
  
  let match;
  while ((match = strongRegex.exec(text)) !== null) {
    allMatches.push({ index: match.index, length: match[0].length });
  }
  
  while ((match = weakRegex.exec(text)) !== null) {
    // 对于弱匹配，如果后面紧跟“到”，则忽略（可能是范围：12:15到20）
    const after = text.substring(match.index + match[0].length, match.index + match[0].length + 5);
    if (after.includes('到')) continue;
    
    // 如果是纯数字且 <= 49，且没有后缀，则忽略
    const amountStr = match[2] || match[5];
    const hasSuffix = !!match[3];
    if (!hasSuffix && /^\d+$/.test(amountStr)) {
      const val = parseInt(amountStr, 10);
      if (val <= 49) continue;
    }
    
    allMatches.push({ index: match.index, length: match[0].length });
  }

  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  for (const m of allMatches) {
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
        // 隐式匹配也需要校验：如果是弱分割（空格），数字应 > 49
        const valStr = implicitMatch[2];
        let isValid = true;
        if (/^\d+$/.test(valStr)) {
          const val = parseInt(valStr, 10);
          if (val <= 49) isValid = false;
        }
        
        if (isValid) {
          segments.push(remaining);
        } else if (segments.length > 0) {
          segments[segments.length - 1] += ' ' + remaining;
        }
      } else if (segments.length > 0) {
        segments[segments.length - 1] += ' ' + remaining;
      }
    } else if (segments.length > 0) {
      segments[segments.length - 1] += ' ' + remaining;
    }
  }
  
  if (segments.length === 0 && /\d+/.test(text)) {
    segments.push(text);
  }
  
  return segments;
}

/**
 * 解析单个指令段 (现在返回数组，支持如 "马龙各50" 拆分为两个结果)
 */
function parseSegment(segment: string, keywords: string[], comboKeywords: string[]): ParseResult[] | null {
  // 排序关键词，长的在前
  const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
  const kwPattern = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // 识别连码类型
  let comboType: 'single' | '三中三' | '二中二' | '特碰' = 'single';
  const lowerSegment = segment.toLowerCase();
  if (lowerSegment.includes('三中三') || lowerSegment.includes('3中3')) comboType = '三中三';
  else if (lowerSegment.includes('二中二') || lowerSegment.includes('2中2')) comboType = '二中二';
  else if (lowerSegment.includes('特碰')) comboType = '特碰';

  // 允许关键词和金额之间有干扰字符，且金额后可能有后缀
  // 同样修复先行断言位置
  const regex = new RegExp(`^(.*?)(?:${kwPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(?:元|米|斤|块|位|个|一个)?(?![\\d一二三四五六七八九十百])(.*)$`);
  const match = segment.match(regex);
  
  let targetsStr = '';
  let amountStr = '';
  
  if (match) {
    targetsStr = match[1].trim();
    amountStr = match[2].trim();
  } else {
    // 兜底逻辑：找末尾数字
    const tailMatch = segment.match(/^(.*?)(\d+|[一二三四五六七八九十百]+)\s*(?:元|米|斤|块|位|个|一个)?\D*$/);
    if (tailMatch) {
      targetsStr = tailMatch[1].trim();
      amountStr = tailMatch[2].trim();
    }
  }

  if (!targetsStr || !amountStr) return null;

  // 清理目标字符串：只保留数字、生肖、分类等有效关键词，移除所有杂质符号和汉字
  const cleanDisplayRaw = (str: string) => {
    // 允许的字符白名单：数字、生肖、分类(家禽野兽)、颜色、大小单双、范围关键词
    // 注意：此处不再包含谐音字，确保识别结果“按标准来”
    const whitelist = new RegExp(`[^\\d一二三四五六七八九十百马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽肖红蓝绿大小单双到尾中碰反字数合金木水火土]`, 'g');
    
    // 在清理前，先尝试将 Targets 中的谐音字替换为标准字
    let normalized = str;
    Object.entries(ZODIAC_HOMOPHONES).forEach(([real, variations]) => {
      variations.forEach(v => {
        if (v !== real) {
          normalized = normalized.replace(new RegExp(v, 'g'), real);
        }
      });
    });

    // 特殊处理：将 "345尾" 转换成 "3尾 4尾 5尾" 这种格式，防止后续数字串被错误拆分
    normalized = normalized.replace(/(\d+)尾/g, (match, p1) => {
      return p1.split('').map((c: string) => `${c}尾`).join(' ');
    });

    return normalized
      .replace(whitelist, ' ')                    // 不在白名单内的全部替换为空格
      .replace(/(\d+)(?!尾)/g, ' $1 ')             // 确保普通数字前后有空格，便于补零，但排除“尾”前的数字
      .replace(/(\d+尾)/g, ' $1 ')                // 确保“X尾”作为一个整体前后有空格
      .replace(/\s+/g, ' ')                       // 合并多个空格
      .trim()
      .split(' ')
      .flatMap(part => {
        // 如果是 "3尾" 这种格式，直接返回，不补零
        const tailMatch = part.match(/^(\d+)尾$/);
        if (tailMatch) {
          return [tailMatch[1] + '尾'];
        }

        if (/^\d+$/.test(part)) {
          if (part.length <= 2) {
            return [part.padStart(2, '0')];
          } else {
            // 对连在一起的长数字串进行智能拆分并补零显示
            return smartSplitDigits(part).map(n => n.toString().padStart(2, '0'));
          }
        }
        return [part];
      })
      .join(' ')                                  // 先用空格连接
      .replace(/([^\d])\s+([^\d])/g, '$1$2')      // 移除文字间的空格 (如 "猪 狗" -> "猪狗")
      .replace(/([^\d])\s+(\d)/g, '$1$2')         // 移除文字与数字间的空格 (如 "猪 01" -> "猪01")
      .replace(/(\d)\s+([^\d])/g, '$1$2')         // 移除数字与文字间的空格 (如 "01 猪" -> "01猪")
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
    const PROTECTED_COMBOS = ['倒反数', '反数', '反字', '大数', '小数'];
    let protectedStr = targetsStr;
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

    // 1. 处理 "X尾" (支持多位，如 "1478尾")
    const tailRegex = /(\d+|[零一二三四五六七八九]+)尾/g;
    let tailMatch;
    // 使用 remainingStr 进行正则匹配
    while ((tailMatch = tailRegex.exec(remainingStr)) !== null) {
      const tailStr = tailMatch[1];
      if (/^\d+$/.test(tailStr)) {
        // 如果是纯数字，拆分每个数字作为尾数
        for (const char of tailStr) {
          const tail = parseInt(char, 10);
          for (let i = 1; i <= 49; i++) {
            if (i % 10 === tail) allNumbers.push(i);
          }
        }
      } else {
        // 处理中文数字
        const tail = chineseToNumber(tailStr);
        for (let i = 1; i <= 49; i++) {
          if (i % 10 === tail) allNumbers.push(i);
        }
      }
    }
    remainingStr = remainingStr.replace(tailRegex, ' ');

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
      { key: '大数', filter: (n: number) => n >= 25 },
      { key: '小数', filter: (n: number) => n <= 24 },
      { key: '倒反数', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
      { key: '大', filter: (n: number) => n >= 25 },
      { key: '小', filter: (n: number) => n <= 24 },
      { key: '单', filter: (n: number) => n % 2 !== 0 },
      { key: '双', filter: (n: number) => n % 2 === 0 },
      { key: '红', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '蓝', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '绿', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
      { key: '金', filter: (n: number) => (ELEMENTS_MAP['金'] as unknown as number[]).includes(n) },
      { key: '木', filter: (n: number) => (ELEMENTS_MAP['木'] as unknown as number[]).includes(n) },
      { key: '水', filter: (n: number) => (ELEMENTS_MAP['水'] as unknown as number[]).includes(n) },
      { key: '火', filter: (n: number) => (ELEMENTS_MAP['火'] as unknown as number[]).includes(n) },
      { key: '土', filter: (n: number) => (ELEMENTS_MAP['土'] as unknown as number[]).includes(n) },
      { key: '合单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0; } },
      { key: '合双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0; } },
      { key: '合大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7; } },
      { key: '合小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6; } },
      { key: '反字', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
      { key: '反数', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
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
          if (n >= 1 && n <= 49) allNumbers.push(n);
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
        type: 'single'
      });
    }
  }

  return results.length > 0 ? results : null;
}
