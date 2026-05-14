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
  '一个字', '每个字', '各一个字', '一粒', '各数', '各自', '各号', '各字', '个字', '每个号', '各一个号', '一个号', '每号', '个号', '每个', '各粒', '一个', '各', '包', '粒', '各位', '个', '字', '一字', '每', '打', '买', '下', '位', '压', '快', '￥', '=', '＝'
];
// 弱关键字：仅在数字 >= 50 或有币种后缀时才视为金额锚点
export const WEAK_KEYWORDS = [':', '：', '/', '.', '．', '\\', '-', '号', '码', '号码', '波色', '色', '条', 'x', 'X', '#', '＃', '*'];
export const ALL_KEYWORDS = [...STRONG_KEYWORDS, ...WEAK_KEYWORDS];

// 数据连接符：用于连接多个号码或生肖，不应触发金额切分
export const DATA_CONNECTORS = ['*', '/', '-', '–', '—', '－', '@', '.', ',', '，', '。', ' ', '\t', '数', '#', '＃', '[', ']', '(', ')', '【', '】', '+', '＋', '·', '~', '～', '…', '“', '”'];

/**
 * 纠错词表：错别字 -> 正确文字
 */
const TYPO_MAP: Record<string, string> = {
  '兰': '蓝',
  '兰色': '蓝色',
  '兰头': '蓝头',
  '兰尾': '蓝尾',
  '兰波': '蓝波',
  '园': '元',
  '毎': '每',
  '個': '个',
  '一字': '各',
  '个字': '各',
  '字': '各',
  '一粒': '各',
  '每个号': '各',
  '各号': '各',
  '一个号': '各',
  '个号': '各',
  '个': '各',
  '俩': '2',
  '澳碼': '澳码',
  '港碼': '港码',
  '龍': '龙',
  '馬': '马',
  '魚': '鱼',
  '雞': '鸡',
  '豬': '猪',
  '狗': '狗',
  '猴': '猴',
  '鼠': '鼠',
};

/**
 * 纠错执行函数：在解析前统一修正常见错别字
 */
export const correctTypos = (text: string): string => {
  let corrected = text;
  Object.entries(TYPO_MAP).forEach(([typo, correct]) => {
    // 使用正则全局替换，且尽量避免破坏非目标词汇
    corrected = corrected.replace(new RegExp(typo, 'g'), correct);
  });
  return corrected;
};

/**
 * 智能转换中文数字，避免 "五十" -> "510" 这种错误
 */
export function replaceChinese(text: string): string {
  let res = text;
  
  // 基础数字映射（包含繁体和异体字）
  const charMap: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9,
    '两': 2
  };
  
  const digitChars = Object.keys(charMap).join('');

  // 处理 百、千、万
  res = res.replace(new RegExp(`([\\d${digitChars}])\\s*万`, 'g'), (_, d) => {
    const val = /^\d$/.test(d) ? parseInt(d) : charMap[d as string] || 1;
    return (val * 10000).toString();
  });
  res = res.replace(new RegExp(`([\\d${digitChars}])\\s*千`, 'g'), (_, d) => {
    const val = /^\d$/.test(d) ? parseInt(d) : charMap[d as string] || 1;
    return (val * 1000).toString();
  });
  res = res.replace(new RegExp(`([\\d${digitChars}])\\s*百`, 'g'), (_, d) => {
    const val = /^\d$/.test(d) ? parseInt(d) : charMap[d as string] || 1;
    return (val * 100).toString();
  });
  
  // 处理 十 (包含繁体 拾)
  const tenChars = '十拾';
  res = res.replace(new RegExp(`([${digitChars}])[${tenChars}]([${digitChars}])`, 'g'), (_, d1, d2) => {
    return (charMap[d1] * 10 + charMap[d2]).toString();
  });
  res = res.replace(new RegExp(`[${tenChars}]([${digitChars}])`, 'g'), (_, d) => {
    return (10 + charMap[d]).toString();
  });
  res = res.replace(new RegExp(`([${digitChars}])[${tenChars}]`, 'g'), (_, d) => {
    return (charMap[d] * 10).toString();
  });
  res = res.replace(new RegExp(`[${tenChars}]`, 'g'), '10');
  
  // 最后处理个位数
  Object.keys(charMap).forEach(k => {
    res = res.replace(new RegExp(k, 'g'), charMap[k].toString());
  });
  
  return res;
}

/**
 * 将中文数字转换为阿拉伯数字 (支持到百位，满足金额需求)
 */
function chineseToNumber(chinese: string): number {
  if (/^\d+$/.test(chinese)) return parseInt(chinese, 10);
  
  const map: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100, '千': 1000, '万': 10000
  };
  
  let result = 0;
  let temp = 0;
  let section = 0;
  
  for (let i = 0; i < chinese.length; i++) {
    const char = chinese[i];
    const val = map[char];
    if (val === undefined) continue;
    
    if (val === 10 || val === 100 || val === 1000) {
      if (temp === 0) temp = 1;
      section += temp * val;
      temp = 0;
    } else if (val === 10000) {
      if (temp === 0 && section === 0) temp = 1;
      result += (section + temp) * val;
      section = 0;
      temp = 0;
    } else {
      temp = val;
    }
  }
  return result + section + temp;
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
    if (!/^\d+$/.test(nStr)) return [];
    
    // For 3-digit strings like "369" or "123", if each digit is a valid small number (or if explicitly part of head/tail patterns later)
    // Avoid splitting "100", "200" into "01"
    if (nStr.length === 3) {
      if (nStr === '100' || nStr === '200' || nStr === '300' || nStr === '400' || nStr === '500') return [];
      
      const d1 = parseInt(nStr[0], 10);
      const d2 = parseInt(nStr[1], 10);
      const d3 = parseInt(nStr[2], 10);
      const res = [];
      if (d1 >= 1 && d1 <= 9) res.push(d1);
      if (d2 >= 1 && d2 <= 9) res.push(d2);
      if (d3 >= 1 && d3 <= 9) res.push(d3);
      // Only return if we actually matched all digits or it's a known pattern
      if (res.length === 3) return res;
      return [];
    }
    
    // Otherwise try two-by-two splitting
    let potential: number[] = [];
    let possible = true;
    for (let i = 0; i < nStr.length; i += 2) {
      const chunk = nStr.slice(i, i + 2);
      if (chunk.length === 0) break;
      const val = parseInt(chunk, 10);
      if (val >= 1 && val <= 49) {
        potential.push(val);
      } else if (chunk.length === 1 && parseInt(chunk, 10) >= 1) {
        potential.push(parseInt(chunk, 10));
      } else {
        possible = false;
        break;
      }
    }
    if (possible) return potential;
    return [];
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
  '新澳门特', '新澳门', '澳门特码', '新奥特码', '澳门特', '澳门', '香港特', '香港', '特码', '澳特', '特', '港码', '港馬', '港马', '香', '澳', '门', '澳码', '澳馬', '奥',
  '上报数据明细', '数据明细', '明细', '报单', '报单明细', '清单', '下注清单',
  '上报散码数据', '散码数据', '上报数据', '上报散码', '散码', '上报',
  'Vz-HuiPu-PC', '图', '港'
];

/**
 * 辅助函数：将 "蓝绿波" 展开为 "蓝波 绿波"
 */
function expandWaves(text: string): string {
  // 识别模式：(红/蓝/绿)(红/蓝/绿)波
  const waveRegex = /([红蓝绿兰篮]+)波/g;
  return text.replace(waveRegex, (match, colors) => {
    return colors.split('').map((c: string) => {
      const standardColor = (c === '兰' || c === '篮') ? '蓝' : c;
      return `${standardColor}波`;
    }).join(' ');
  });
}

/**
 * 辅助函数：将 "1 2 345尾" 展开为 "1尾 2尾 3尾 4尾 5尾"
 * 确保解析器看到的已是标准的带方向关键词的数据。
 */
function expandHeadTail(text: string): string {
  // 归一化：统一替换“尾数/头数/头/尾”为标准“头/尾”
  // 核心：不再预先全局替换，只在匹配时内部转换，防止产生孤立残留
  let normalized = text.replace(/尾数/g, '尾').replace(/头数/g, '头');

  const headTailRegex = /([\d \t.，、\-\/@*。零一二三四五六七八九]+)([头尾])|([头尾])([\d \t.，、\-\/@*。零一二三四五六七八九]+)/g;
  
  return normalized.replace(headTailRegex, (match, pSuffix, suffixStr, prefixStr, pPrefix) => {
    const p = pSuffix || pPrefix || '';
    const suffix = suffixStr || prefixStr;
    const isSuffixMode = !!suffixStr;
    
    // 【新增核心逻辑】探测是否处于“列表环境”：
    const clusterNumbers = p.match(/\d+/g) || [];
    const hasListSeparator = /[.，、：:;；]/.test(p);

    // 提取所有数字和非数字片段
    const parts = p.split(/(\d+|[零一二三四五六七八九])/);
    let result = '';
    let expanded = false;

    if (isSuffixMode) {
      let lastDigitIdx = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$|^[零一二三四五六七八九]$/.test(parts[i] || '')) {
          lastDigitIdx = i;
          break;
        }
      }

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        if (/^\d+$|^[零一二三四五六七八九]$/.test(part)) {
          let shouldExpand = false;
          const isSingleDigit = (part.length === 1);

          if (i === lastDigitIdx) {
            let attached = true;
            for (let k = i + 1; k < parts.length; k++) {
              if ((parts[k] || '').trim().length > 0) { attached = false; break; }
            }
            if (attached) {
              if (p.endsWith(' ') || p.endsWith('\t') || p.endsWith('　')) {
                shouldExpand = isSingleDigit;
              } else {
                shouldExpand = true;
              }
            } else {
              shouldExpand = isSingleDigit;
            }
          } else {
            shouldExpand = isSingleDigit;
          }

          // 列表抑制逻辑修正：
          // 1. 如果数字本身是多位数（>=10），且处于列表环境，则抑制。
          // 2. 如果数字是单位数，但它与后缀之间隔着列表分隔符（如 . , :），且处于列表环境，则抑制（视为独立号码）。
          let isSeparated = false;
          if (isSuffixMode) {
            for (let k = i + 1; k < parts.length; k++) {
              if (/[.，、：:;；]/.test(parts[k] || '')) { isSeparated = true; break; }
            }
          }
          
          const val = parseInt(part, 10);
          const inhibitExpansion = (hasListSeparator && !isSingleDigit && val >= 1 && val <= 49) || (hasListSeparator && isSeparated && clusterNumbers.some(n => {
            const nv = parseInt(n, 10);
            return n.length > 1 && nv >= 1 && nv <= 49;
          }));

          if (shouldExpand && !inhibitExpansion) {
            const exploded = part.split('').map(d => `${d}${suffix}`).join(' ');
            result += ` ${exploded} `;
            expanded = true;
          } else {
            result += part;
          }
        } else {
          result += part;
        }
      }
      // 如果没有发生任何展开，且处于列表抑制环境，则剥离后缀；否则保留或展开
      const finalInhibit = hasListSeparator && !expanded && (clusterNumbers.some(n => {
        const nv = parseInt(n, 10);
        return n.length > 1 && nv >= 1 && nv <= 49;
      }));
      return expanded ? result : result + (finalInhibit ? '' : suffixStr);
    } else {
      let firstDigitIdx = -1;
      for (let i = 0; i < parts.length; i++) {
        if (/^\d+$|^[零一二三四五六七八九]$/.test(parts[i] || '')) {
          firstDigitIdx = i;
          break;
        }
      }

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        if (/^\d+$|^[零一二三四五六七八九]$/.test(part)) {
          let shouldExpand = false;
          if (i === firstDigitIdx) {
            let attached = true;
            for (let k = 0; k < i; k++) {
              if ((parts[k] || '').trim().length > 0) { attached = false; break; }
            }
            if (attached) {
              if (p.startsWith(' ') || p.startsWith('\t') || p.startsWith('　')) {
                shouldExpand = (part.length === 1);
              } else {
                shouldExpand = true;
              }
            } else {
              shouldExpand = (part.length === 1);
            }
          } else {
            shouldExpand = (part.length === 1);
          }

          if (shouldExpand) {
            const exploded = part.split('').map(d => `${d}${suffix}`).join(' ');
            result += ` ${exploded} `;
            expanded = true;
          } else {
            result += part;
          }
        } else {
          result += part;
        }
      }
      return expanded ? result : prefixStr + result;
    }
  });
}

/**
 * 智能单行孤立符号识别：
 * 如果一行中包含且仅包含一个非数字非汉字的特殊符号，且该行没有其它明确的金额关键字，
 * 则认为该符号是金额分隔符。
 */
function applyIsolationLogic(text: string): string {
  // 1. 获取所有非数字、非汉字的符号
  const allSymbols = text.replace(/[\d\u4e00-\u9fa5]/g, '').split('');
  const counts: Record<string, number> = {};
  allSymbols.forEach(s => counts[s] = (counts[s] || 0) + 1);

  // 2. 过滤掉空格和常见结构性符号 (包括加号等明确的连接符)
  const ignore = [' ', '\t', ',', '，', '、', ';', '；', '(', ')', '[', ']', '【', '】', '。', '+', '＋', '·', '~', '～', '…'];
  ignore.forEach(char => delete counts[char]);

  const candidates = Object.keys(counts);
  if (candidates.length === 0) return text;

  // 3. 统计强力关键字
  const SYMBOL_KEYWORDS = ['#', '＃', '*', '￥', '/', '\\', '.', '．', ':', '：', '-'];
  const hasRealStrong = STRONG_KEYWORDS.some(kw => !SYMBOL_KEYWORDS.includes(kw) && text.includes(kw));

  // 3.5 列表模式探测：如果某些符号出现多次且都在数字之间，则高度怀疑是数据分隔符
  const suspiciousListSymbols: string[] = [];
  for (const char of candidates) {
    if (counts[char] >= 2) {
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const listRegex = new RegExp(`\\d+\\s*${escaped}\\s*\\d+\\s*${escaped}\\s*\\d+`, 'g');
      if (listRegex.test(text)) {
        suspiciousListSymbols.push(char);
      }
    }
  }

  let newText = text;
  let hasChanged = false;

  // 4. 遍历所有可能的赋值符候选
  for (const char of candidates) {
    // 如果该符号被识别为列表分隔符，跳过转换
    if (suspiciousListSymbols.includes(char)) continue;

    const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配：数字 + 该符号 + 数字
    const regex = new RegExp(`(\\d+)\\s*${escaped}\\s*(\\d+)(?![\\d\\u4e00-\\u9fa5])`, 'g');
    
    if (regex.test(text)) {
      const matches = text.match(regex);
      if (matches) {
        for (const mStr of matches) {
          const parts = mStr.split(char);
          const p2 = parts.pop()?.trim() || '';
          const val2 = parseInt(p2, 10);
          const isAmbiguous = /[\/\\:\.．\-#＃*＊@]/.test(char);
          
          // 如果是歧义符号且行内已有“各”，金额门槛降低至 50 (包含50)
          // 增加逻辑：在这种场景下，如果冒号右侧的数字 <= 49，且其后还有其它数字列表模式，则严禁转化
          if (hasRealStrong && isAmbiguous) {
            if (val2 < 50) continue;
            // 如果金额虽 >= 50，但符号出现多次，也需谨慎
            if (counts[char] >= 2 && !hasRealStrong) continue; 
          }

          // 允许转换满足金额条件的任何符号
          if (!isAmbiguous || val2 >= 50) {
            const localRegex = new RegExp(`(\\d+)\\s*${escaped}\\s*${p2}(?![\\d\\u4e00-\\u9fa5])`, 'g');
            newText = newText.replace(localRegex, '$1各' + p2);
            hasChanged = true;
          }
        }
      }
    }
  }

  return hasChanged ? newText : text;
}

/**
 * 解析输入字符串
 * 遵循用户最新指令：
 * 1. “各”、“字”或其谐音之后的第一组数字为金额。
 * 2. “各”之前的生肖和号码独立计算（不进行去重）。
 * 3. 大小单双组合逻辑：大单(25-49单), 大双(25-49双), 小单(1-24单), 小双(1-24双)。
 */
export function parseInput(input: string): ParseResult[] {
  // 1. 纠错处理 (Typos Correction)
  const correctedInput = correctTypos(input);

  // 统一转换各种连接符为标准 -
  let preProcessed = correctedInput.replace(/[–—－]/g, '-');

  // 05-10 修复：在展开头尾前先移除明显的系统标志，防止干扰簇检测
  HEADER_KEYWORDS.forEach(kw => {
    preProcessed = preProcessed.replace(new RegExp(`^\\s*${kw}[：:\\s]*`, 'gm'), '');
  });

  // 3. 统一转换中文数字，确保后续逻辑（如范围、头尾处理）能识别阿拉伯数字
  preProcessed = replaceChinese(preProcessed);

  // 预处理：波色展开 (蓝绿波 -> 蓝波 绿波)
  preProcessed = expandWaves(preProcessed);

  // 【核心修复】预处理：头尾指令展开
  const expandedInput = expandHeadTail(preProcessed);
  preProcessed = expandedInput;

  // 统一替换谐音
  Object.entries(HOMOPHONES).forEach(([key, val]) => {
    preProcessed = preProcessed.replace(new RegExp(key, 'g'), val);
  });

  // 屏蔽“特肖”、“一肖”等冗余后缀，支持“连肖”
  preProcessed = preProcessed.replace(/(?:特|一|二|三|四|五|六|七|八|九|十|\d)(?:连)?肖/g, ' ');
  
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
    { pattern: /门[：:]/g, replacement: '门 ' },
    // 块/快/元 统一规整，方便锚点切割
    { pattern: /快/g, replacement: '块' },
  ];

  preProcessed = preProcessed.replace(/元/g, '元\n'); // 核心优化：元字后方添加换行，强制重置识别生命周期
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

  // 3. 范围处理 (e.g. 1到5各10 或 1到5 6到10各10)
  // 支持中文范围 (如 "十一到十五")
  const rangeRegex = /([\d一二三四五六七八九十百]+)\s*(?:到|至)\s*([\d一二三四五六七八九十百]+)/g;
  let rangeProcessed = cleaned.replace(rangeRegex, (match, startStr, endStr) => {
    const s = /\d/.test(startStr) ? parseInt(startStr, 10) : chineseToNumber(startStr);
    const e = /\d/.test(endStr) ? parseInt(endStr, 10) : chineseToNumber(endStr);
    if (isNaN(s) || isNaN(e) || s > e || e > 49) return match;
    const nums = [];
    for (let n = s; n <= e; n++) nums.push(n.toString().padStart(2, '0'));
    return nums.join(' ');
  });

  // 05-10 修复：将紧跟在金额后的点号+空格（. ）视为路段切分，防止 expandHeadTail 错误吸收金额
  // 识别模式：金额（50/100等）+ . + 空格
  rangeProcessed = rangeProcessed.replace(/(\d{2,})\.([ \t]+)/g, '$1 $2');

  const rawChunks = rangeProcessed.split(/[\n\r;；“”""]+/).map(l => l.trim()).filter(l => l);
  
  const allResults: ParseResult[] = [];
  const COMBO_KEYWORDS = ['三中三', '3中3', '二中二', '2中2', '特碰', '三中二', '二中特'];
  
  let buffer = '';
  for (let chunk of rawChunks) {
    // 对每一行应用孤立符号识别逻辑 (增强：按行隔离，实现“只要在该行唯一且该行无其它金额符就转化”)
    chunk = applyIsolationLogic(chunk);

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
  return findAllAnchors(text).length > 0;
}

/**
 * 寻找字符串中的所有金额锚点
 */
function findAllAnchors(text: string): { index: number, length: number, keyword: string, hasStrongSuffix?: boolean }[] {
  const sortedStrong = [...STRONG_KEYWORDS].sort((a, b) => b.length - a.length);
  const strongPattern = sortedStrong.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const strongRegex = new RegExp(`(${strongPattern})[\\s,，、。\\-/*@.粒号码]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))[\\s元米斤块位个一个粒快]*`, 'gi');

  const sortedWeak = [...WEAK_KEYWORDS].sort((a, b) => b.length - a.length);
  const weakPattern = sortedWeak.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const weakRegex = new RegExp(`(${weakPattern})[\\s,，、。\\-/*@.粒号码]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))[\\s元米斤块位个一个粒快]*`, 'gi');

  const unitSuffixRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))\s*(元|米|斤|块|快|位|个(?!\s*\d))/gi;
  const implicitRegex = /(?:^|[\s,各，、；;。/*\-@.[\]()【】])(\d{2,})/g;
  const endOfLineAmountRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))[\s,，、。\-/*@.粒米斤块位个]*$/gi;

  const matches: { index: number, length: number, keyword: string, hasStrongSuffix?: boolean }[] = [];
  let m;

  while ((m = strongRegex.exec(text)) !== null) {
    const hasSuffix = /[元米斤块位个粒]/.test(m[0]);
    matches.push({ index: m.index, length: m[0].length, keyword: m[1], hasStrongSuffix: hasSuffix });
  }
  while ((m = weakRegex.exec(text)) !== null) {
    const keyword = m[1];
    const amountStr = m[2] || m[3];
    const val = amountStr ? ( /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr) ) : 0;
    const hasSuffix = /[元米斤块位个粒]/.test(m[0]);
    
    // 如果存在强关键字“各”，且当前是弱锚点（如冒号），除非有明确后缀，否则提高门槛
    const hasStrongElsewhere = STRONG_KEYWORDS.some(sk => text.includes(sk) && sk !== keyword);
    if (hasStrongElsewhere && (keyword === ':' || keyword === '：' || keyword === '.' || keyword === '．') && !hasSuffix) {
      // 在有“各”字的情况下，冒号模式识别为金额的概率降低，特别是如果它看起来像号码分隔符
      if (val < 100) continue; 
    }

    // “号”字特判：
    if (keyword === '号') {
      const beforeChar = text.substring(0, m.index).trim().slice(-1);
      if (/[\d一二三四五六七八九十百千万]/.test(beforeChar)) {
        // 如果后面跟着的数字 < 50 且没有单位，则视为数据分隔符
        if (val < 50 && !hasSuffix) {
          continue;
        }
      }
      if (/[\u4e00-\u9fa5]/.test(beforeChar) && !/[一二三四五六七八九十百千万]/.test(beforeChar)) {
        // 如果前方是单纯汉字（如“特号”），视为强力金额锚点
        matches.push({ index: m.index, length: m[0].length, keyword: '号', hasStrongSuffix: hasSuffix });
        continue;
      }
    }

    if (val >= 50 || hasSuffix) {
      matches.push({ index: m.index, length: m[0].length, keyword: keyword || 'weak', hasStrongSuffix: hasSuffix });
    }
  }
  while ((m = unitSuffixRegex.exec(text)) !== null) {
    // “元/米/斤/块/位/个”作为强力终止符，必须包含
    matches.push({ index: m.index, length: m[0].length, keyword: m[3], hasStrongSuffix: true });
  }
  while ((m = implicitRegex.exec(text)) !== null) {
    const val = parseInt(m[1], 10);
    const beforeText = text.substring(0, m.index);
    const afterText = text.substring(m.index + m[0].length);
    const followedByForbid = /^\s*[.\d,，各号字个每打买下压xX￥=＝:：号码尾头到拖胆带中碰]/.test(afterText);
    const followedByTarget = /^\s*[一二三四五六七八九十百马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽红蓝绿兰篮大小单双到尾头中碰反字数合金木水火土波色粒]/.test(afterText);
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
      
      const hasSuffix = /[元米斤块快位个粒]/.test(m[0]);
      
      // 分隔符密度检测：如果连接符在行内高频出现 (>=2次)，且当前数字属于 1-49 范围，则很大可能是数据列表而非金额
      if (connectors) {
        const lastChar = connectors[connectors.length - 1];
        const charCount = (rawBeforeText.split(lastChar).length - 1);
        const hasNumbersBefore = /\d/.test(rawBeforeText);
        // 如果前方没有任何数字且后面跟着一个数字，这在生肖/波色场景中通常是金额，不应因连接符多而跳过
        if (charCount >= 2 && val <= 49 && !hasSuffix && hasNumbersBefore) {
          continue; 
        }
      }
      
      matches.push({ index: m.index, length: m[0].length, keyword: 'EOL', hasStrongSuffix: hasSuffix });
    }
  }

  const sortedMatches = matches.sort((a, b) => a.index - b.index);
  const nonOverlapping: typeof matches = [];
  let lastEnd = -1;
  for (const m of sortedMatches) {
    if (m.index >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.index + m.length;
    }
  }

  return nonOverlapping;
}

function splitByAnchors(text: string): string[] {
  const allMatches = findAllAnchors(text);
  const segments: string[] = [];
  
  if (allMatches.length === 0) {
    return [];
  }

  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);

  // 关键优化：根据锚点间距过滤掉无效的弱锚点
  const filteredMatches: { index: number, length: number, keyword: string, hasStrongSuffix?: boolean, isStrong?: boolean }[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i] as any;
    // 手动注入识别类型 (强/弱)
    m.isStrong = STRONG_KEYWORDS.includes(m.keyword) || m.hasStrongSuffix;

    if (i < allMatches.length - 1) {
      const nextM = allMatches[i + 1];
      const gapText = text.substring(m.index + m.length, nextM.index);
      
      // 满足以下条件的弱锚点将被跳过（例如 "1,2号 各50"，跳过"1号"）:
      // 1. 本身是弱锚点
      // 2. 且间隔文本中没有强分断符 (，。；; . ．)
      // 3. 且间隔文本符合“数字+分隔符”模式且不含空格
      const canSkip = !m.isStrong && 
                      !/[，。；;]/.test(gapText) && 
                      /^[\s,、]*\d+[\s,、]*$/.test(gapText) && 
                      !gapText.includes(' ') && !gapText.includes('　');

      if (canSkip) {
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
    if (/\d+|[一二三四五六七八九十百千万]+/.test(remaining)) {
      const implicitMatch = remaining.match(/^(.*?)(\d+|[一二三四五六七八九十百千万]+)\s*(?:元|米|斤|块|位|个|一个)?\D*$/);
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
 * 辅助：标准化的合数/头尾/波色预处理
 * 确保 "合12 3" -> "合数12 合数3", "1 2尾" -> "1尾 2尾"
 */
function normalizeComposites(str: string): string {
  // 先统一为“合”，方便分段处理
  let res = str.replace(/合数/g, '合');

  const expandDigits = (digitsStr: string) => {
    const rawDigits = digitsStr.match(/\d+|[零一二三四五六七八九]/g);
    if (!rawDigits) return '';
    const expanded: string[] = [];
    rawDigits.forEach(d => {
      // 这里的逻辑与智能拆分保持一致 (10-13)
      if (d.length >= 2 && /^\d+$/.test(d)) {
        let i = 0;
        while (i < d.length) {
          const two = d.slice(i, i + 2);
          if (['10', '11', '12', '13'].includes(two)) {
            expanded.push(`合数${two}`);
            i += 2;
          } else {
            expanded.push(`合数${d[i]}`);
            i++;
          }
        }
      } else {
        expanded.push(`合数${d}`);
      }
    });
    return expanded.join(' ');
  };

  // 1. 匹配前置型：合 12 3 -> 合数12 合数3
  res = res.replace(/合\s*([\d\s.，、、\-@*。零一二三四五六七八九]{1,15})(?![合\d])/g, (match, p1) => {
    const expanded = expandDigits(p1);
    return expanded ? expanded : match;
  });

  // 2. 匹配后置型：12 3 合 -> 合数12 合数3
  res = res.replace(/([\d\s.，、、\-@*。零一二三四五六七八九]{1,15})\s*合(?![数\d])/g, (match, p1) => {
    const expanded = expandDigits(p1);
    return expanded ? expanded : match;
  });
  
  // 3. 兜底：仅当“合”后面紧跟数字时才规整为“合数”
  res = res.replace(/合(?=\d)/g, '合数');
  // 彻底清理：将“合数 12”中间的空格移除，统一为“合数12”
  res = res.replace(/合(?:数)?\s+(\d+|[大小单双]+)/g, (m, p1) => {
    return m.includes('数') ? `合数${p1}` : `合${p1}`;
  });
  
  // 4. 物理去重：移除此处的强制去重逻辑，以尊重用户在指令中明确重复书写号码或分类的意图（如“40 40”或“9尾 9尾”）
  const parts = res.split(/\s+/).filter(p => p.trim());
  return parts.join(' ');
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
  const anchorRegex = new RegExp(`(${kwPattern})[\\s,，、。\\-/*@.粒]*(?:(\\d+)(?!\\d)|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))[\\s元米斤块快位个一个粒]*`, 'g');
  const unitRegex = /(?:(\d+)(?![\d])|([一二三四五六七八九十百千万]+)(?![一二三四五六七八九十百千万]))\s*(元|米|斤|块|快|位|个(?!\s*\d))/g;

  const matches: { keyword: string, amount: string, index: number, length: number, isStrong: boolean }[] = [];
  let m;
  while ((m = anchorRegex.exec(segment)) !== null) {
    const keyword = m[1];
    const amountStr = m[2] || m[3];
    const val = amountStr ? ( /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : chineseToNumber(amountStr) ) : 0;
    const isStrong = STRONG_KEYWORDS.includes(keyword);
    
    // 弱锚点校验：如果金额 < 50 且没有强币种后缀，则不将其视为金额锚点
    if (!isStrong) {
      const hasUnit = /[元米斤块快位个粒]/.test(m[0]);
      if (val < 50 && !hasUnit) continue;
    }

    matches.push({
      keyword,
      amount: amountStr,
      index: m.index,
      length: m[0].length,
      isStrong
    });
  }

  while ((m = unitRegex.exec(segment)) !== null) {
    // 如果还没被识别，则作为元金额点
    if (!matches.some(ex => m && ex.index === m.index)) {
      matches.push({
        keyword: m[3],
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
    // b) 同时出发位置 (index) 越靠左越优先 (保证在 "各50元" 中优先选中 "各" 而不是 "50")
    // c) 长度越长越优先
    matches.sort((a, b) => {
      if (a.isStrong !== b.isStrong) return b.isStrong ? 1 : -1;
      if (a.index !== b.index) return a.index - b.index;
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
    // 同时也适配 米, 斤 等单位
    const tailMatch = segment.match(/^(.*?)(\d+|[一二三四五六七八九十百千万]+)\s*(元|米|斤|块|快|位|个|一个)?\D*$/);
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
    // 允许的字符白名单
    const whitelist = new RegExp(`[^\\d一二三四五六七八九十百千万马蛇龙兔虎牛鼠猪狗鸡猴羊家禽野兽男女红蓝绿大小单双到尾头中碰反字数合金木水火土波色粒]`, 'g');
    
    // 1. 预处理谐音和规整合数/波色
    let normalized = str.replace(/[兰篮]/g, '蓝');
    normalized = normalized.replace(/(红|蓝|绿)(?!单|双|大|小|合|波)/g, '$1波');
    
    // 2. 规整“合数”状态
    normalized = normalizeComposites(normalized);

    // 3. 规整化：分类词 -> 标准名
    normalized = normalized.replace(/大数/g, '大');
    normalized = normalized.replace(/小数/g, '小');
    normalized = normalized.replace(/单数/g, '单');
    normalized = normalized.replace(/双数/g, '双');
    normalized = normalized.replace(/家禽|家肖|家兽|家/g, '家禽');
    normalized = normalized.replace(/野肖|野兽|野/g, '野肖');
    normalized = normalized.replace(/男肖|男/g, '男肖');
    normalized = normalized.replace(/女肖|女/g, '女肖');
    normalized = normalized.replace(/反数|反字|反/g, '反数');
    normalized = normalized.replace(/尾数|尾/g, '尾');
    normalized = normalized.replace(/头数|头/g, '头');

    Object.entries(ZODIAC_HOMOPHONES).forEach(([real, variations]) => {
      variations.forEach(v => {
        if (v !== real) normalized = normalized.replace(new RegExp(v, 'g'), real);
      });
    });

    // 4. 保护复合词：确保合数、波色、头尾保持完整，不被空格拆分
    const comboKeys = '家禽|野肖|男肖|女肖|反数';
    const complexRegex = new RegExp(`(合(?:数)?\\s*(?:[大小单双]+|\\d+))|(${comboKeys})|(?:红|蓝|绿)波[大小单双]|(?:\\d+[头尾])`, 'g');
    const finalSegments: string[] = [];
    let lastIdx = 0;

    // 修改为支持原始间距策略：无空格即交集
    const cleanRawTextWithSpacing = (text: string) => {
      // 保持原始空格分布，只清理非法字符，保留单个空格作为分隔符逻辑
      return text.replace(whitelist, '');
    };

    // 使用 RegExp.exec 循环代替 replace，以获得准确 of offset
    let match;
    while ((match = complexRegex.exec(normalized)) !== null) {
      const offset = match.index;
      const prevText = normalized.slice(lastIdx, offset);
      const cleanedPrev = cleanRawTextWithSpacing(prevText);
      if (cleanedPrev) finalSegments.push(cleanedPrev);
      
      // match[0] 是完整匹配项，将其内部空格移除后推入
      finalSegments.push(match[0].replace(/\s+/g, '')); 
      lastIdx = offset + match[0].length;
    }
    
    const remainingText = cleanRawTextWithSpacing(normalized.slice(lastIdx));
    if (remainingText) finalSegments.push(remainingText);

    // 最终拼接：由于 finalSegments 已经包含了原始空格（如果有），这里使用 join('')
    const rawResult = finalSegments.join('').replace(/\s+/g, ' ').trim();
    
    // 补零逻辑：仅针对孤立的数字 (1-49)
    return rawResult.split(' ').map(part => {
      if (/^\d{1,2}$/.test(part)) {
        const val = parseInt(part, 10);
        if (val >= 1 && val <= 49) return part.padStart(2, '0');
      }
      return part;
    }).join(' ');
  };

  // 清理金额字符串，只保留数字和中文数字，防止由于系统词粘连导致的解析失败
  const cleanAmountStr = amountStr.replace(/[^\d一二三四五六七八九十百千万]/g, '');
  const amount = chineseToNumber(cleanAmountStr);
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
    // 保护包含关键字的特殊组合 (如 '合单')，防止被后续的干扰词移除逻辑误删
    const PROTECTED_COMBOS = ['倒反数', '反数', '反字', '倒反', '反'];
    let protectedStr = targetsStr;
    
    // 同时也移除可能在 targetsStr 中遗留的 Header
    const sortedHead = [...HEADER_KEYWORDS].sort((a, b) => b.length - a.length);
    sortedHead.forEach(h => {
      protectedStr = protectedStr.replace(new RegExp(h, 'g'), ' ');
    });

    PROTECTED_COMBOS.forEach((p, idx) => {
      protectedStr = protectedStr.replace(new RegExp(p, 'g'), `__PC_${idx}__`);
    });

    let remainingStr = replaceChinese(protectedStr); 
    // 规整化：大数 -> 大, 小数 -> 小, 单数 -> 单, 双数 -> 双
    remainingStr = remainingStr.replace(/大数/g, '大');
    remainingStr = remainingStr.replace(/小数/g, '小');
    remainingStr = remainingStr.replace(/单数/g, '单');
    remainingStr = remainingStr.replace(/双数/g, '双');
    // 关键修正：在提取数字前，先对合数等复合模式进行归一化，防止 11 被拆分为 1 和 1
    remainingStr = normalizeComposites(remainingStr);
    
    // 计算是否有分隔符，用于决定合并还是拆分
    const cleanTargetsForCheck = targetsStr.replace(/^[.\s,，、。#\-/*@.【】[\]()（）]+|[.\s,，、。#\-/*@.【】[\]()（）]+$/g, '');
    const hasSeparators = /[\s,，、。#\/*@.]/.test(cleanTargetsForCheck);

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
    // 同时执行“一字认做各”的规范化显示逻辑
    sortedKws.forEach(kw => {
      const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      displayRaw = displayRaw.replace(kwRegex, ' ');
    });
    // 规范化：如果原始指令包含“字”或“一字”，在预览中统一显示为“各”
    if (bestMatch && (bestMatch.keyword === '字' || bestMatch.keyword === '一字' || bestMatch.keyword === '个字' || bestMatch.keyword === '每个字')) {
      // 保持 displayRaw 干净，后续拼装时会自动带上“各”
    }
    // 修改：不再移除所有空格，只合并空格并修整边缘，确保数字间保留空格
    displayRaw = displayRaw.replace(/\s+/g, ' ').trim(); 

    const combinations: { key: string, filter: (n: number) => boolean }[] = [
      // 常见两项组合 (支持乱序)
      { key: '大单', filter: (n: number) => n >= 25 && n % 2 !== 0 },
      { key: '大双', filter: (n: number) => n >= 25 && n % 2 === 0 },
      { key: '小单', filter: (n: number) => n <= 24 && n % 2 !== 0 },
      { key: '小双', filter: (n: number) => n <= 24 && n % 2 === 0 },

      // 四属性交集 (如红大单双等)
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
      { key: '绿小單', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 && n % 2 !== 0 },
      { key: '绿小单', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 && n % 2 !== 0 },
      { key: '绿小双', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 && n % 2 === 0 },

      // 常见三项简写组合 (支持乱序)
      { key: '大单红', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['红'] as any).includes(n) },
      { key: '大双红', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['红'] as any).includes(n) },
      { key: '小单红', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['红'] as any).includes(n) },
      { key: '小双红', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['红'] as any).includes(n) },
      { key: '大单蓝', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '大双蓝', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '小单蓝', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '小双蓝', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '大单绿', filter: (n: number) => n >= 25 && n % 2 !== 0 && (COLOR_MAP['绿'] as any).includes(n) },
      { key: '大双绿', filter: (n: number) => n >= 25 && n % 2 === 0 && (COLOR_MAP['绿'] as any).includes(n) },
      { key: '小单绿', filter: (n: number) => n <= 24 && n % 2 !== 0 && (COLOR_MAP['绿'] as any).includes(n) },
      { key: '小双绿', filter: (n: number) => n <= 24 && n % 2 === 0 && (COLOR_MAP['绿'] as any).includes(n) },

      // 其他常见两两组合
      { key: '红大', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n >= 25 },
      { key: '红小', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n <= 24 },
      { key: '蓝大', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n >= 25 },
      { key: '蓝小', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n <= 24 },
      { key: '绿大', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n >= 25 },
      { key: '绿小', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n <= 24 },
      { key: '红单', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n % 2 !== 0 },
      { key: '红双', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) && n % 2 === 0 },
      { key: '蓝单', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n % 2 !== 0 },
      { key: '蓝双', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) && n % 2 === 0 },
      { key: '绿单', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n % 2 !== 0 },
      { key: '绿双', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) && n % 2 === 0 },
      { key: '合数单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0; } },
      { key: '合数双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0; } },
      { key: '合数大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7; } },
      { key: '合数小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6; } },
      
      // 单项关键词
      { key: '合单', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 !== 0; } },
      { key: '合双', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s % 2 === 0; } },
      { key: '合大', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s >= 7; } },
      { key: '合小', filter: (n: number) => { const s = Math.floor(n / 10) + (n % 10); return s <= 6; } },
      { key: '大数', filter: (n: number) => n >= 25 },
      { key: '小数', filter: (n: number) => n <= 24 },
      { key: '大', filter: (n: number) => n >= 25 },
      { key: '小', filter: (n: number) => n <= 24 },
      { key: '单', filter: (n: number) => n % 2 !== 0 },
      { key: '双', filter: (n: number) => n % 2 === 0 },
      { key: '红波', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) },
      { key: '蓝波', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '绿波', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) },
      { key: '红', filter: (n: number) => (COLOR_MAP['红'] as any).includes(n) },
      { key: '蓝', filter: (n: number) => (COLOR_MAP['蓝'] as any).includes(n) },
      { key: '绿', filter: (n: number) => (COLOR_MAP['绿'] as any).includes(n) },
      { key: '金', filter: (n: number) => (ELEMENTS_MAP['金'] as any).includes(n) },
      { key: '木', filter: (n: number) => (ELEMENTS_MAP['木'] as any).includes(n) },
      { key: '水', filter: (n: number) => (ELEMENTS_MAP['水'] as any).includes(n) },
      { key: '火', filter: (n: number) => (ELEMENTS_MAP['火'] as any).includes(n) },
      { key: '土', filter: (n: number) => (ELEMENTS_MAP['土'] as any).includes(n) },
      { key: '色', filter: (n: number) => false }, // 占位符
      { key: '反', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
      { key: '倒反', filter: (n: number) => [12, 21, 13, 31, 24, 42, 14, 41, 32, 23, 43, 34].includes(n) },
    ];

    combinations.sort((a, b) => b.key.length - a.key.length);

    // 交叉组合识别逻辑 (针对空格隔离的单词执行局部交集)
    const wordSegments = remainingStr.split(/\s+/).filter(p => !!p.trim());
    const allNumbersFromSegments: number[] = [];
    const rawTokens: string[] = [];

    wordSegments.forEach((word) => {
      const intersectionFilters: ((n: number) => boolean)[] = [];
      const matchedKeysInWord: string[] = [];
      let tempWord = word;

      // --- 动态模式匹配 (提取属性并执行 Mask) ---
      
      // 1. 范围 (Range)
      const rangeRegex = /(\d+|[一二三四五六七八九十百]+)\s*(?:到|至)\s*(\d+|[一二三四五六七八九十百]+)/g;
      let mRange;
      while ((mRange = rangeRegex.exec(tempWord)) !== null) {
        const start = /\d/.test(mRange[1]) ? parseInt(mRange[1], 10) : chineseToNumber(mRange[1]);
        const end = /\d/.test(mRange[2]) ? parseInt(mRange[2], 10) : chineseToNumber(mRange[2]);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        if (!isNaN(min) && !isNaN(max)) {
          intersectionFilters.push((n: number) => n >= min && n <= max && n <= 49);
          matchedKeysInWord.push(mRange[0]);
          tempWord = tempWord.replace(mRange[0], ' '.repeat(mRange[0].length));
        }
      }

      // 2. 尾 (Tail)
      const tailPat = /(\d|[零一二三四五六七八九])尾|尾(\d|[零一二三四五六七八九])/g;
      let mTail;
      while ((mTail = tailPat.exec(tempWord)) !== null) {
        const d = mTail[1] || mTail[2];
        const val = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
        intersectionFilters.push((n: number) => n % 10 === val);
        matchedKeysInWord.push(mTail[0]);
        tempWord = tempWord.replace(mTail[0], ' '.repeat(mTail[0].length));
      }

      // 3. 头 (Head)
      const headPat = /(\d|[零一二三四五六七八九])头|头(\d|[零一二三四五六七八九])/g;
      let mHead;
      while ((mHead = headPat.exec(tempWord)) !== null) {
        const d = mHead[1] || mHead[2];
        const val = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
        if (val >= 0 && val <= 4) {
          intersectionFilters.push((n: number) => Math.floor(n / 10) === val);
          matchedKeysInWord.push(mHead[0]);
          tempWord = tempWord.replace(mHead[0], ' '.repeat(mHead[0].length));
        }
      }

      // 4. 合数 (Composites)
      const sumTailRegex = /合数\s*(\d+|[零一二三四五六七八九]+)/g;
      let mSum;
      while ((mSum = sumTailRegex.exec(tempWord)) !== null) {
        const val = /\d/.test(mSum[1]) ? parseInt(mSum[1], 10) : chineseToNumber(mSum[1]);
        intersectionFilters.push((n: number) => {
          const s = Math.floor(n / 10) + (n % 10);
          return val >= 10 ? (s === val) : (s % 10 === val);
        });
        matchedKeysInWord.push(mSum[0]);
        tempWord = tempWord.replace(mSum[0], ' '.repeat(mSum[0].length));
      }

      // 5. 分类 (Categories)
      const CAT_ITEMS = [
        { key: ['家禽', '家肖', '家'], zodiacs: ['牛', '马', '羊', '鸡', '狗', '猪'] },
        { key: ['野肖', '野兽', '野'], zodiacs: ['鼠', '虎', '兔', '龙', '蛇', '猴'] },
        { key: ['男肖', '男'], zodiacs: ['鼠', '牛', '虎', '龙', '马', '猴', '狗'] },
        { key: ['女肖', '女'], zodiacs: ['兔', '蛇', '羊', '鸡', '猪'] },
      ];
      CAT_ITEMS.forEach(cat => {
        const pattern = cat.key.join('|');
        const regex = new RegExp(`(${pattern})`, 'g');
        let mCat;
        while ((mCat = regex.exec(tempWord)) !== null) {
          const catNums = cat.zodiacs.flatMap(z => getNumbersByZodiac(z));
          intersectionFilters.push((n: number) => catNums.includes(n));
          matchedKeysInWord.push(mCat[1]);
          tempWord = tempWord.replace(mCat[1], ' '.repeat(mCat[1].length));
        }
      });

      // 6. 静态属性词 (Combinations)
      const sortedCombos = [...combinations].sort((a, b) => b.key.length - a.key.length);
      sortedCombos.forEach(combo => {
        if (tempWord.includes(combo.key)) {
          intersectionFilters.push(combo.filter);
          matchedKeysInWord.push(combo.key);
          tempWord = tempWord.replace(new RegExp(combo.key, 'g'), ' '.repeat(combo.key.length));
        }
      });

      // --- 处理逻辑：交集 vs 并集 ---

      // 如果单词内部有 2 个或以上属性词且交集非空 -> 视为交集
      if (intersectionFilters.length >= 2) {
        const intersectionNums = [];
        for (let n = 1; n <= 49; n++) {
          if (intersectionFilters.every(f => f(n))) intersectionNums.push(n);
        }
        if (intersectionNums.length > 0) {
          allNumbersFromSegments.push(...intersectionNums);
          rawTokens.push(matchedKeysInWord.join('')); // 交集内部紧凑
          return;
        }
      }

      // 否则，作为独立 Token 处理其并集 (支持词内混合：如 "龙9" 或 "红双 10")
      let workingWord = word;
      const localTokens: { text: string, index: number, nums: number[] }[] = [];

      // 再次应用同样的探测逻辑以生成 localTokens
      const detectAndAdd = (regex: RegExp, filterFactory: (m: string[]) => (n: number) => boolean) => {
        let m;
        while ((m = regex.exec(workingWord)) !== null) {
          const filter = filterFactory(m);
          const nums: number[] = [];
          for (let n = 1; n <= 49; n++) if (filter(n)) nums.push(n);
          localTokens.push({ text: m[0], index: m.index, nums });
          workingWord = workingWord.substring(0, m.index) + ' '.repeat(m[0].length) + workingWord.substring(m.index + m[0].length);
        }
      };

      // 并集版：范围
      detectAndAdd(/(\d+|[一二三四五六七八九十百]+)\s*(?:到|至)\s*(\d+|[一二三四五六七八九十百]+)/g, (m) => {
        const start = /\d/.test(m[1]) ? parseInt(m[1], 10) : chineseToNumber(m[1]);
        const end = /\d/.test(m[2]) ? parseInt(m[2], 10) : chineseToNumber(m[2]);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        return (n: number) => n >= min && n <= max && n <= 49;
      });

      // 并集版：尾
      detectAndAdd(/(\d|[零一二三四五六七八九])尾|尾(\d|[零一二三四五六七八九])/g, (m) => {
        const d = m[1] || m[2];
        const val = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
        return (n: number) => n % 10 === val;
      });

      // 并集版：头
      detectAndAdd(/(\d|[零一二三四五六七八九])头|头(\d|[零一二三四五六七八九])/g, (m) => {
        const d = m[1] || m[2];
        const val = /\d/.test(d) ? parseInt(d, 10) : chineseToNumber(d);
        return (n: number) => Math.floor(n / 10) === val;
      });

      // 并集版：合数
      detectAndAdd(/合数\s*(\d+|[零一二三四五六七八九]+)/g, (m) => {
        const val = /\d/.test(m[1]) ? parseInt(m[1], 10) : chineseToNumber(m[1]);
        return (n: number) => {
          const s = Math.floor(n / 10) + (n % 10);
          return val >= 10 ? (s === val) : (s % 10 === val);
        };
      });

      // 并集版：分类
      CAT_ITEMS.forEach(cat => {
        const pattern = cat.key.join('|');
        const regex = new RegExp(`(${pattern})`, 'g');
        let mCat;
        while ((mCat = regex.exec(workingWord)) !== null) {
          const catNums = cat.zodiacs.flatMap(z => getNumbersByZodiac(z));
          localTokens.push({ text: mCat[1], index: mCat.index, nums: catNums });
          workingWord = workingWord.substring(0, mCat.index) + ' '.repeat(mCat[1].length) + workingWord.substring(mCat.index + mCat[1].length);
        }
      });

      // 复用之前的组合/生肖/数字逻辑
      sortedCombos.forEach(combo => {
        let idx = workingWord.indexOf(combo.key);
        while (idx !== -1) {
          const comboNumbers: number[] = [];
          for (let n = 1; n <= 49; n++) if (combo.filter(n)) comboNumbers.push(n);
          localTokens.push({ text: combo.key, index: idx, nums: comboNumbers });
          workingWord = workingWord.substring(0, idx) + ' '.repeat(combo.key.length) + workingWord.substring(idx + combo.key.length);
          idx = workingWord.indexOf(combo.key);
        }
      });

      const flatZodiacs: { v: string, real: string }[] = [];
      Object.entries(ZODIAC_HOMOPHONES).forEach(([real, vari]) => vari.forEach(v => flatZodiacs.push({ v, real })));
      flatZodiacs.sort((a, b) => b.v.length - a.v.length).forEach(({ v, real }) => {
        let idx = workingWord.indexOf(v);
        while (idx !== -1) {
          localTokens.push({ text: real, index: idx, nums: getNumbersByZodiac(real) });
          workingWord = workingWord.substring(0, idx) + ' '.repeat(v.length) + workingWord.substring(idx + v.length);
          idx = workingWord.indexOf(v);
        }
      });

      let nMatch;
      const nRegex = /\d+/g;
      while ((nMatch = nRegex.exec(workingWord)) !== null) {
        let nNums: number[] = [];
        if (nMatch[0].length <= 2) {
          const n = parseInt(nMatch[0], 10);
          if (n >= 1 && n <= 49) nNums.push(n);
        } else {
          nNums = smartSplitDigits(nMatch[0]);
        }
        if (nNums.length > 0) localTokens.push({ text: nMatch[0], index: nMatch.index, nums: nNums });
      }

      if (localTokens.length > 0) {
        localTokens.sort((a, b) => a.index - b.index);
        localTokens.forEach(t => {
          allNumbersFromSegments.push(...t.nums);
          let txt = t.text;
          if (/^\d{1,2}$/.test(txt)) {
            const v = parseInt(txt, 10);
            if (v >= 1 && v <= 49) txt = txt.padStart(2, '0');
          }
          rawTokens.push(txt);
        });
      }
    });

    if (allNumbersFromSegments.length > 0) {
      // 备注：不执行最终去重，尊重并集下注目标累加逻辑 (如 "红双 小" -> 9 + 24 = 33)
      const finalNumbers = allNumbersFromSegments; 
      const isSplitAmount = bestMatch && bestMatch.keyword === '包';
      const finalAmount = isSplitAmount ? (amount / finalNumbers.length) : amount;

      // 规范化显示：红/蓝/绿 -> 红波/蓝波/绿波
      const normalizedRaw = rawTokens.map(t => {
        if (t === '红' || t === '蓝' || t === '绿') return t + '波';
        return t;
      }).join(' ');

      return [{
        numbers: finalNumbers,
        amount: finalAmount,
        raw: normalizedRaw,
        type: comboType
      }];
    }

    return results.length > 0 ? results : null;
  }

  return null;
}
