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
  '鼠': ['鼠', '书', '数'],
  '牛': ['牛', '扭', '妞'],
  '虎': ['虎', '府', '付'],
  '兔': ['兔', '吐', '免'],
  '龙': ['龙', '隆', '拢'],
  '蛇': ['蛇', '舌', '舍'],
  '马': ['马', '码', '嘛'],
  '羊': ['羊', '阳', '洋'],
  '猴': ['猴', '候', '后'],
  '鸡': ['鸡', '机', '基'],
  '狗': ['狗', '勾', '购'],
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
  // 注意：元、米、斤、块、位 等通常作为金额后缀，不应作为起始关键词，否则会误切分（如“10元15号”会被切成“10”和“15号”）
  const KEYWORDS = [
    '各', '个', '字', '每', '打', '买', '下', 'x', 'X', '￥', ':', '=', '/', 
    '数', '号', '：', '＝', '每数', '每个', '每号', '各号', '各是', '个是'
  ];
  const IGNORE_TARGETS = ['合计', '总计', '总共', '共计', '累计', '合计金额', '总额'];
  const HEADER_KEYWORDS = [
    '新澳门', '澳门特码', '新奥特码', '澳门特', '澳门', '特码', '澳特', '特',
    '上报数据明细', '数据明细', '明细', '报单', '报单明细', '清单', '下注清单',
    '上报散码数据', '散码数据', '上报数据', '上报散码', '散码', '上报'
  ];

  // 1. 移除汇总信息和报头信息
  // 汇总信息通常带数字，报头通常不带或带无关数字
  const sortedIgnore = [...IGNORE_TARGETS].sort((a, b) => b.length - a.length);
  // 优化汇总正则：确保不会误删正常的投注项
  const summaryRegex = new RegExp(`(?:${sortedIgnore.join('|')})[:：]?\\s*(?:共|额|金额)?\\s*\\d+\\s*元?(?![=：＝:各个字每打买下xX￥/])`, 'gi');
  
  // 优化报头正则：只匹配行首或明显分隔符后的报头，防止误伤
  const headerRegex = new RegExp(`(?:^|[\\s。，,])(?:${HEADER_KEYWORDS.sort((a, b) => b.length - a.length).join('|')})[:：]?`, 'gi');
  
  let cleanedInput = processed.replace(summaryRegex, '');
  cleanedInput = cleanedInput.replace(headerRegex, ' ');

  // 2. 将所有行合并为一个长字符串，处理跨行指令
  // 移除多余的换行，用空格替代，使跨行的“各50”能找到前面的目标
  const unifiedInput = cleanedInput.split(/[\n\r]+/).map(l => l.trim()).filter(l => l).join(' ');
  
  const allResults: ParseResult[] = [];
  const COMBO_KEYWORDS = ['三中三', '3中3', '二中二', '2中2', '特碰', '三中二', '二中特'];
  
  // 3. 使用“金额锚点”逻辑进行切分
  const segments = splitByAnchors(unifiedInput, KEYWORDS);
  
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
function splitByAnchors(text: string, keywords: string[]): string[] {
  const segments: string[] = [];
  
  // 排序关键词，长的在前，防止短的拦截长的
  const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
  const kwPattern = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  
  // 匹配模式：(关键词) (可选干扰) (数字) (元/米/斤等可选后缀)
  // 关键修复：将负向先行断言移动到后缀之后，防止后缀中的字符（如“一个”中的“一”）触发断言失败
  const anchorRegex = new RegExp(`(?:${kwPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(?:元|米|斤|块|位|个|一个)?(?![\\d一二三四五六七八九十百])`, 'g');
  
  let lastIndex = 0;
  let match;
  
  while ((match = anchorRegex.exec(text)) !== null) {
    const anchorEnd = anchorRegex.lastIndex;
    // 截取从上一个锚点结束到当前锚点结束的所有内容
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
        segments.push(remaining);
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
    // 允许的字符白名单：数字、生肖(含多音字/错别字)、分类(家禽野兽)、颜色、大小单双、范围关键词
    const allHomophones = Object.values(ZODIAC_HOMOPHONES).flat().join('');
    const whitelist = new RegExp(`[^\\d一二三四五六七八九十百${allHomophones}家禽野兽肖红蓝绿大小单双到尾中碰反字数合金木水火土]`, 'g');
    
    return str
      .replace(whitelist, ' ')                    // 不在白名单内的全部替换为空格
      .replace(/(\d+)/g, ' $1 ')                  // 确保数字前后有空格，便于补零
      .replace(/\s+/g, ' ')                       // 合并多个空格
      .trim()
      .split(' ')
      .map(part => {
        if (/^\d+$/.test(part)) {
          // 对所有独立数字补零
          return part.padStart(2, '0');
        }
        return part;
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
    let displayRaw = cleanDisplayRaw(targetsStr);
    let remainingStr = targetsStr; // 用于提取独立数字的剩余字符串

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
      if (regex.test(targetsStr)) {
        const count = (targetsStr.match(regex) || []).length;
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
    while ((tailMatch = tailRegex.exec(targetsStr)) !== null) {
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
    while ((rangeMatch = rangeRegex.exec(targetsStr)) !== null) {
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
          // 智能拆分：当连在一起的数字超过2位时（如 3015），优先按两位一组拆分
          let i = 0;
          while (i < nStr.length) {
            const twoDigits = nStr.slice(i, i + 2);
            const val2 = parseInt(twoDigits, 10);
            
            if (twoDigits.length === 2 && val2 >= 1 && val2 <= 49) {
              allNumbers.push(val2);
              i += 2;
            } else {
              // 如果两位不合法（如超过49），则取一位尝试
              const oneDigit = nStr.slice(i, i + 1);
              const val1 = parseInt(oneDigit, 10);
              if (oneDigit.length === 1 && !isNaN(val1) && val1 >= 1 && val1 <= 49) {
                allNumbers.push(val1);
              }
              i += 1;
            }
          }
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
