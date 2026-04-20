/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Calculator, 
  RotateCcw, 
  Download, 
  Plus, 
  History, 
  TrendingUp, 
  Hash,
  Search,
  AlertCircle,
  X,
  Settings,
  Minus,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import XLSX from 'xlsx-js-style';
import { parseInput, ZODIAC_LIST, getNumbersByZodiac } from './utils/lotteryParser';

interface BetItem {
  targets: number[];
  amount: number;
  raw: string;
}

interface BetRecord {
  id: string;
  time: string;
  raw: string;
  fullRaw: string;
  parsedPreview?: string;
  items: BetItem[];
  totalAmount: number;
  rebate: number;
}

export default function App() {
  const [standaloneMode, setStandaloneMode] = useState(false);
  
  const [financeBetData, setFinanceBetData] = useState<Record<number, number>>(() => {
    const saved = localStorage.getItem('financeBetData');
    return saved ? JSON.parse(saved) : Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
  });
  const [financeRecords, setFinanceRecords] = useState<BetRecord[]>(() => {
    const saved = localStorage.getItem('financeRecords');
    return saved ? JSON.parse(saved) : [];
  });
  const [compoundRecords, setCompoundRecords] = useState<BetRecord[]>(() => {
    const saved = localStorage.getItem('compoundRecords');
    return saved ? JSON.parse(saved) : [];
  });
  const [inputValue, setInputValue] = useState('');
  const [modalInputValue, setModalInputValue] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUndoId, setConfirmingUndoId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLastUndoConfirm, setShowLastUndoConfirm] = useState(false);
  const [undoCallback, setUndoCallback] = useState<{ fn: () => void, label: string } | null>(null);
  const [enableSearchUndo, setEnableSearchUndo] = useState<boolean>(() => {
    const saved = localStorage.getItem('enableSearchUndo');
    return saved === null ? true : saved === 'true'; // Default ON
  });
  const [odds, setOdds] = useState<number>(() => {
    const saved = localStorage.getItem('odds');
    return saved ? parseFloat(saved) : 48.5;
  });
  const [rebate, setRebate] = useState<number>(() => {
    const saved = localStorage.getItem('rebate');
    return saved ? parseFloat(saved) : 4;
  });
  const [appWidth, setAppWidth] = useState<number>(() => {
    const saved = localStorage.getItem('appWidth');
    return saved ? parseInt(saved) : 1360;
  });
  const [appHeight, setAppHeight] = useState<number>(() => {
    const saved = localStorage.getItem('appHeight');
    return saved ? parseInt(saved) : 920;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempOdds, setTempOdds] = useState(odds);
  const [tempRebate, setTempRebate] = useState(rebate);
  const [tempEnableSearchUndo, setTempEnableSearchUndo] = useState(enableSearchUndo);
  const [tempAppWidth, setTempAppWidth] = useState(appWidth);
  const [tempAppHeight, setTempAppHeight] = useState(appHeight);

  // Initialize temp states when settings opens
  useEffect(() => {
    if (isSettingsOpen) {
      setTempOdds(odds);
      setTempRebate(rebate);
      setTempEnableSearchUndo(enableSearchUndo);
      setTempAppWidth(appWidth);
      setTempAppHeight(appHeight);
    }
  }, [isSettingsOpen, odds, rebate, enableSearchUndo, appWidth, appHeight]);

  const [activeView, setActiveView] = useState<'stats' | 'compound'>('stats');
  const [modalMode, setModalMode] = useState<'save' | 'deduct'>('save');
  const [drawNumbers, setDrawNumbers] = useState<(number | null)[]>(() => {
    const saved = localStorage.getItem('drawNumbers');
    return saved ? JSON.parse(saved) : Array(7).fill(null);
  });
  const [specialNumber, setSpecialNumber] = useState<number | null>(() => {
    const saved = localStorage.getItem('specialNumber');
    return saved ? parseInt(saved) : null;
  });
  const [specialNumberInput, setSpecialNumberInput] = useState(specialNumber ? specialNumber.toString().padStart(2, '0') : '');

  // Detect standalone mode AND sync data across windows
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'entry') {
      setStandaloneMode(true);
      setIsModalOpen(true);
      if (params.get('type') === 'deduct') {
        setModalMode('deduct');
      }
    }

    // Listener for cross-window sync
    const handleStorageSync = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === 'financeBetData') setFinanceBetData(JSON.parse(e.newValue || '{}'));
      if (e.key === 'financeRecords') setFinanceRecords(JSON.parse(e.newValue || '[]'));
      if (e.key === 'compoundRecords') setCompoundRecords(JSON.parse(e.newValue || '[]'));
      if (e.key === 'specialNumber') setSpecialNumber(e.newValue ? parseInt(e.newValue) : null);
      if (e.key === 'enableSearchUndo') setEnableSearchUndo(e.newValue === 'true');
    };

    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  // Auto-save data to localStorage
  useEffect(() => {
    localStorage.setItem('financeBetData', JSON.stringify(financeBetData));
  }, [financeBetData]);

  useEffect(() => {
    localStorage.setItem('financeRecords', JSON.stringify(financeRecords));
  }, [financeRecords]);

  useEffect(() => {
    localStorage.setItem('compoundRecords', JSON.stringify(compoundRecords));
  }, [compoundRecords]);

  useEffect(() => {
    localStorage.setItem('odds', odds.toString());
  }, [odds]);

  useEffect(() => {
    localStorage.setItem('rebate', rebate.toString());
  }, [rebate]);

  useEffect(() => {
    localStorage.setItem('drawNumbers', JSON.stringify(drawNumbers));
  }, [drawNumbers]);

  useEffect(() => {
    if (specialNumber !== null) {
      localStorage.setItem('specialNumber', specialNumber.toString());
    } else {
      localStorage.removeItem('specialNumber');
    }
    setSpecialNumberInput(specialNumber ? specialNumber.toString().padStart(2, '0') : '');
  }, [specialNumber]);
  useEffect(() => {
    localStorage.setItem('enableSearchUndo', enableSearchUndo.toString());
  }, [enableSearchUndo]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalInputRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();

  const totalTurnover = useMemo(() => {
    return Object.values(financeBetData).reduce((sum: number, val: number) => sum + val, 0);
  }, [financeBetData]);

  const handleUndo = (recordId: string) => {
    // Try finding in financeRecords first
    const financeRecord = financeRecords.find(r => r.id === recordId);
    if (financeRecord) {
      const newBetData = { ...financeBetData };
      financeRecord.items.forEach(item => {
        item.targets.forEach(num => {
          newBetData[num] = Math.max(0, Number((newBetData[num] - item.amount).toFixed(2)));
        });
      });

      setFinanceBetData(newBetData);
      setFinanceRecords(prev => prev.filter(r => r.id !== recordId));
      setConfirmingUndoId(null);
      return;
    }

    // Then try compoundRecords
    const compoundRecord = compoundRecords.find(r => r.id === recordId);
    if (compoundRecord) {
      setCompoundRecords(prev => prev.filter(r => r.id !== recordId));
      setConfirmingUndoId(null);
      return;
    }
  };

  // Helper to get combinations
  const getCombinations = (arr: number[], k: number): number[][] => {
    const results: number[][] = [];
    const helper = (start: number, combo: number[]) => {
      if (combo.length === k) {
        results.push([...combo]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    };
    helper(0, []);
    return results;
  };

  const handleParse = (isNegative: boolean = false, customInput?: string) => {
    const inputToParse = customInput !== undefined ? customInput : modalInputValue;
    if (!inputToParse.trim()) return;

    try {
      const items: BetItem[] = [];
      let totalInputAmount = 0;

      if (activeView === 'compound') {
        const types = ['三中三', '二中二', '三中二', '特碰'];
        const matches: { type: string, index: number }[] = [];
        types.forEach(t => {
          let idx = inputToParse.indexOf(t);
          while (idx !== -1) {
            matches.push({ type: t, index: idx });
            idx = inputToParse.indexOf(t, idx + 1);
          }
        });
        matches.sort((a, b) => a.index - b.index);

        if (matches.length === 0) {
          setError('未识别到玩法关键词（如：三中三、二中二、特碰）');
          return;
        }

        const segments: { type: string, content: string }[] = [];
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index;
          const end = (i + 1 < matches.length) ? matches[i+1].index : inputToParse.length;
          segments.push({
            type: matches[i].type,
            content: inputToParse.substring(start + matches[i].type.length, end)
          });
        }

        segments.forEach((seg, idx) => {
          // Extract amount from the end of the segment
          const amountMatch = seg.content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                              seg.content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
          
          let amountPerGroup = 0;
          let contentToProcess = seg.content;

          if (amountMatch) {
            amountPerGroup = parseFloat(amountMatch[1]);
            contentToProcess = seg.content.replace(amountMatch[0], '');
          } else {
            // Shared case: look ahead
            for (let j = idx + 1; j < segments.length; j++) {
              const nextAmountMatch = segments[j].content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                      segments[j].content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
              if (nextAmountMatch) {
                amountPerGroup = parseFloat(nextAmountMatch[1]);
                break;
              }
            }
          }

          if (amountPerGroup > 0) {
            const grossAmount = isNegative ? -amountPerGroup : amountPerGroup;
            const type = seg.type;
            let k = 0;
            if (type === '三中三' || type === '三中二') k = 3;
            else if (type === '二中二') k = 2;
            else if (type === '特碰') k = 1;

            // Split by line to handle multiple groups of numbers
            const lines = contentToProcess.split(/\n/);
            lines.forEach(line => {
              const numbers = Array.from(new Set(
                (line.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 49)
              ));

              if (type === '特碰') {
                if (numbers.length >= 2) {
                  const combos = getCombinations(numbers, 2);
                  combos.forEach(combo => {
                    items.push({ targets: combo, amount: grossAmount, raw: `${combo.join('-')} 特碰` });
                    totalInputAmount += grossAmount;
                  });
                }
              } else {
                if (numbers.length >= k) {
                  const combos = getCombinations(numbers, k);
                  combos.forEach(combo => {
                    items.push({ targets: combo, amount: grossAmount, raw: `${combo.join('-')} ${type}` });
                    totalInputAmount += grossAmount;
                  });
                }
              }
            });
          }
        });

        if (items.length === 0) {
          setError('无法识别号码或金额。格式应如："二中二 05-19 10"');
          return;
        }
      } else {
        // Normal parsing for stats view
        const results = parseInput(inputToParse);
        if (results.length === 0) {
          setError('无法解析输入内容，请检查格式');
          return;
        }

        const newBetData = { ...financeBetData };
        results.forEach(res => {
          const grossAmount = isNegative ? -res.amount : res.amount;
          res.numbers.forEach(num => {
            newBetData[num] = Number((newBetData[num] + grossAmount).toFixed(2));
          });
          items.push({
            targets: res.numbers,
            amount: grossAmount,
            raw: res.raw
          });
          totalInputAmount += grossAmount * res.numbers.length;
        });
        setFinanceBetData(newBetData);
      }

      const previewData = formatModalResults(inputToParse);
      
      // Use the cleaned preview as the display name in history, truncated if needed
      const previewLines = previewData.preview.split('\n').map(l => l.replace(/（合计：\d+）/, '').trim()).filter(l => l.length > 0);
      const displayRaw = previewLines.join(' ');
      const finalRaw = displayRaw.length > 100 ? displayRaw.substring(0, 100) + '...' : displayRaw;

      const newRecord: BetRecord = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        raw: finalRaw,
        fullRaw: inputToParse,
        parsedPreview: previewData.preview,
        items,
        totalAmount: totalInputAmount,
        rebate: rebate
      };

      if (activeView === 'compound') {
        setCompoundRecords(prev => [ newRecord, ...prev ]);
      } else {
        setFinanceRecords(prev => [ newRecord, ...prev ]);
      }
      
      setInputValue('');
      setModalInputValue('');
      setError(null);
      modalInputRef.current?.focus();
    } catch (err) {
      setError('解析出错，请重试');
    }
  };

  const handlePasteAndRecognize = async () => {
    setError(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setModalInputValue(text);
        } else {
          setError('剪切板内容为空');
        }
      } else {
        setError('您的浏览器安全性过高，禁止程序直接读取剪切板。请使用 Ctrl+V 手动粘贴。');
      }
    } catch (err) {
      console.error('Clipboard read error:', err);
      // More specific guidance for iframe/permission issues
      setError('权限被拦截：请点击浏览器地址栏左侧的“锁形”图标，在【权限】中开启【剪切板】访问。');
    }
  };

  const triggerLastUndo = () => {
    const rawToSearch = modalInputValue.trim();
    let targetRecord = null;
    let isSearchMode = false;
    
    // 只有在开启“识别框搜索撤销”且输入框不为空时才进入搜索模式
    if (enableSearchUndo && rawToSearch) {
      isSearchMode = true;
      // 优先在当前视图中寻找完全匹配原始输入的记录
      const currentRecords = activeView === 'stats' ? financeRecords : compoundRecords;
      targetRecord = currentRecords.find(r => r.fullRaw.trim() === rawToSearch);
      
      // 如果没找到，去另一个视图找
      if (!targetRecord) {
        const otherRecords = activeView === 'stats' ? compoundRecords : financeRecords;
        targetRecord = otherRecords.find(r => r.fullRaw.trim() === rawToSearch);
      }
    } 
    
    // 非搜索模式，或者搜索模式下没找到匹配项（但我们要决定搜索失败是否回退）
    // 根据用户要求：如果输入框为空，撤销上一条。如果是搜索模式但没找到，应提示未找到。
    if (!targetRecord) {
      if (isSearchMode) {
        setError('未找到匹配的流水记录');
        setTimeout(() => setError(null), 2000);
        return;
      }
      
      // 默认逻辑：撤销当前视图的上一条
      const currentRecords = activeView === 'stats' ? financeRecords : compoundRecords;
      if (currentRecords.length > 0) {
        targetRecord = currentRecords[0];
      }
    }

    if (targetRecord) {
      setUndoCallback({ 
        fn: () => {
          handleUndo(targetRecord!.id);
        }, 
        label: `${targetRecord.raw}` 
      });
      setShowLastUndoConfirm(true);
    } else {
      setError('没有可撤销的记录');
      setTimeout(() => setError(null), 2000);
    }
  };

  const triggerUndoAndPaste = () => {
    const records = activeView === 'stats' ? financeRecords : compoundRecords;
    if (records.length > 0) {
      setUndoCallback({ 
        fn: async () => {
          handleUndo(records[0].id);
          await handlePasteAndRecognize();
        }, 
        label: `${records[0].raw}` 
      });
      setShowLastUndoConfirm(true);
    } else {
      setError('没有可撤销的记录');
      setTimeout(() => setError(null), 2000);
    }
  };

  const handlePopOut = () => {
    const width = 580;
    const height = 700;
    const left = window.screen.width - width - 100;
    const top = 100;
    
    // Open a truly standalone window
    const newWin = window.open(
      window.location.origin + window.location.pathname + '?mode=entry',
      'EntryAssistant',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,location=no,toolbar=no`
    );
    
    if (newWin) {
      setIsModalOpen(false);
    } else {
      setError('弹出窗口被浏览器拦截，请在浏览器地址栏右侧允许弹出窗口。');
    }
  };

  const handleReset = () => {
    if (activeView === 'stats') {
      setFinanceBetData(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])));
      setFinanceRecords([]);
      setSpecialNumber(null);
    } else {
      setCompoundRecords([]);
      setDrawNumbers(Array(7).fill(null));
    }
    setError(null);
    setShowResetConfirm(false);
  };

  const handleCopyData = () => {
    const activeBets = Object.entries(financeBetData)
      .filter(([_, amount]) => (amount as number) > 0)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    if (activeBets.length === 0) return;

    const dataString = "上报散码数据:\n" + 
      activeBets.map(([num, amount]) => `${num.padStart(2, '0')}=${(amount as number).toFixed(0)}`).join(' ');

    navigator.clipboard.writeText(dataString).then(() => {
      // Temporary visual feedback
      const btn = document.getElementById('copy-data-btn');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '已复制';
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 1500);
      }
    });
  };

  const handleExport = () => {
    try {
      const sourceRecords = activeView === 'stats' ? financeRecords : compoundRecords;
      
      if (sourceRecords.length === 0) {
        setError('当前没有可导出的记录');
        return;
      }

      // 数据顺序开始排到结束 (Oldest to Latest)
      const records = [...sourceRecords].reverse();

      // Determine which special draw number to use based on the active view
      const regularDraw = drawNumbers.slice(0, 6).filter((n): n is number => n !== null);
      const specialDraw = activeView === 'stats' ? specialNumber : drawNumbers[6];

      if (specialDraw === null) {
        setError(activeView === 'stats' ? '请先录入本期特码，否则无法计算中奖金额' : '请先录入开奖结果（第7球特码），否则无法计算中奖金额');
        return;
      }

      const exportData = records.map(record => {
        let winningStake = 0;
        let payout = 0;
        const currentRebate = record.rebate || 0;

        record.items.forEach(item => {
          if (activeView === 'stats') {
            const itemTotalStake = item.amount * item.targets.length;
            if (specialDraw !== null) {
              const hitCount = item.targets.filter(t => t === specialDraw).length;
              if (hitCount > 0) {
                winningStake += item.amount * hitCount;
                payout += (item.amount * hitCount * odds) + (itemTotalStake * currentRebate / 100);
              } else {
                payout += (itemTotalStake * currentRebate / 100);
              }
            }
          } else {
            const itemTotalStake = item.amount;
            if (item.raw.includes('特碰')) {
              const hasSpecial = specialDraw !== null && item.targets.includes(specialDraw);
              const otherNum = item.targets.find(t => t !== specialDraw);
              const hasRegular = otherNum !== undefined && regularDraw.includes(otherNum);
              if (hasSpecial && hasRegular) {
                winningStake += item.amount;
                payout += (item.amount * odds) + (itemTotalStake * currentRebate / 100);
              } else {
                payout += (itemTotalStake * currentRebate / 100);
              }
            } else {
              const matchCount = item.targets.filter(t => regularDraw.includes(t)).length;
              let isWin = false;
              if (item.raw.includes('三中三')) isWin = matchCount === 3;
              else if (item.raw.includes('二中二')) isWin = matchCount === 2;
              else if (item.raw.includes('三中二')) isWin = matchCount >= 2;

              if (isWin) {
                winningStake += item.amount;
                payout += (item.amount * odds) + (itemTotalStake * currentRebate / 100);
              } else {
                payout += (itemTotalStake * currentRebate / 100);
              }
            }
          }
        });

        return {
          winningStake: winningStake > 0 ? Number(winningStake.toFixed(2)) : "",
          payout: Number(payout.toFixed(2)),
          totalAmount: Math.abs(record.totalAmount),
          fullRaw: record.fullRaw || record.raw || '',
          parsedPreview: record.parsedPreview || ''
        };
      });

      // Create worksheet data
      const wsData = [
        ['原数据', '识别后的数据', '下注金额', '用户中奖金额', '赔付金额（未扣水）'],
        ...exportData.map(d => [d.fullRaw, d.parsedPreview, d.totalAmount, d.winningStake, d.payout])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Apply styles and comments
      exportData.forEach((d, i) => {
        const row = i + 1; // Header is row 0

        // Column C: Bet Amount (Alignment, Bold, Size 11)
        const cellC = XLSX.utils.encode_cell({ r: row, c: 2 });
        if (ws[cellC]) {
          ws[cellC].s = {
            font: { sz: 11, bold: true },
            alignment: { horizontal: "center", vertical: "center" }
          };
          
          // Add comment to C column
          if (d.fullRaw) {
            ws[cellC].c = [{ t: String(d.fullRaw).trim(), a: "录入原文" }];
            (ws[cellC].c as any).hidden = true;
          }
        }
        
        // Column D: Winning Amount (Red, Bold, Center, Size 11)
        const cellD = XLSX.utils.encode_cell({ r: row, c: 3 });
        if (ws[cellD]) {
          ws[cellD].s = {
            font: { sz: 11, bold: true, color: { rgb: "FF0000" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
      });

      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Column A (Original Data)
        { wch: 40 }, // Column B (Parsed Preview)
        { wch: 15 }, // Column C (Bet Amount)
        { wch: 15 }, // Column D (Winning Amount)
        { wch: 20 }  // Column E (Payout Amount)
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "财务记录");

      const fileName = `财务记录_${activeView === 'stats' ? '常规' : '复式'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export failed:', err);
      setError('导出失败，请检查数据是否完整');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse(false);
    }
  };

  const formatModalResults = (input: string): { preview: string, total: number } => {
    if (!input.trim()) return { preview: '等待输入...', total: 0 };
    try {
      if (activeView === 'compound') {
        const types = ['三中三', '二中二', '三中二', '特碰'];
        const matches: { type: string, index: number }[] = [];
        types.forEach(t => {
          let idx = input.indexOf(t);
          while (idx !== -1) {
            matches.push({ type: t, index: idx });
            idx = input.indexOf(t, idx + 1);
          }
        });
        matches.sort((a, b) => a.index - b.index);

        if (matches.length > 0) {
          const segments: { type: string, content: string }[] = [];
          for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = (i + 1 < matches.length) ? matches[i+1].index : input.length;
            segments.push({
              type: matches[i].type,
              content: input.substring(start + matches[i].type.length, end)
            });
          }

          let totalBet = 0;
          let preview = ``;
          let hasValidBlock = false;

          segments.forEach((seg, idx) => {
            const amountMatch = seg.content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                seg.content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
            
            let amountPerGroup = 0;
            let contentToProcess = seg.content;

            if (amountMatch) {
              amountPerGroup = parseFloat(amountMatch[1]);
              contentToProcess = seg.content.replace(amountMatch[0], '');
            } else {
              for (let j = idx + 1; j < segments.length; j++) {
                const nextAmountMatch = segments[j].content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                        segments[j].content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
                if (nextAmountMatch) {
                  amountPerGroup = parseFloat(nextAmountMatch[1]);
                  break;
                }
              }
            }

            if (amountPerGroup > 0) {
              const type = seg.type;
              let k = 0;
              if (type === '三中三' || type === '三中二') k = 3;
              else if (type === '二中二') k = 2;
              else if (type === '特碰') k = 1;

              const lines = contentToProcess.split(/\n/);
              let segmentCount = 0;
              let segmentNumbers: string[] = [];

              lines.forEach(line => {
                const numbers = Array.from(new Set(
                  (line.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 49)
                ));

                if (numbers.length > 0) {
                  let count = 0;
                  if (type === '特碰' && numbers.length >= 2) {
                    count = getCombinations(numbers, 2).length;
                  } else if (numbers.length >= k) {
                    count = getCombinations(numbers, k).length;
                  }
                  
                  if (count > 0) {
                    hasValidBlock = true;
                    segmentCount += count;
                    segmentNumbers.push(numbers.map(n => n.toString().padStart(2, '0')).join(' '));
                  }
                }
              });

              if (segmentCount > 0) {
                const subTotal = segmentCount * amountPerGroup;
                totalBet += subTotal;
                preview += `${type}: ${segmentNumbers.join(' | ')} 各${amountPerGroup}（合计：${subTotal}）\n`;
              }
            }
          });

          if (hasValidBlock) {
            return { preview: preview.trim(), total: totalBet };
          }
        }
        return { preview: '格式错误，未识别到玩法或金额。格式如："二中二 05-19 10"', total: 0 };
      }

      const results = parseInput(input);
      if (results.length === 0) return { preview: '无法解析，请检查格式', total: 0 };
      
      let grandTotal = 0;
      const lines = results.map(res => {
        const count = res.numbers.length;
        const total = count * res.amount;
        grandTotal += total;
        return `${res.raw} 各${res.amount}（合计：${total}）`;
      });

      return { preview: lines.join('\n'), total: grandTotal };
    } catch (e) {
      return { preview: '解析错误', total: 0 };
    }
  };

  if (standaloneMode) {
    return (
      <div className="fixed inset-0 bg-[#F2F1ED] p-4 flex flex-col font-sans tracking-tight overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-[#141414] pb-2 mb-4">
          <div className="flex items-center gap-2">
            <Calculator size={18} />
            <h3 className="text-xl font-serif italic font-bold">
              {modalMode === 'deduct' ? '智能扣除助手' : '智能录入助手'}
            </h3>
          </div>
          <span className={`text-[10px] font-mono font-bold text-white px-2 py-0.5 uppercase ${modalMode === 'deduct' ? 'bg-red-600' : 'bg-[#141414]'}`}>
            {modalMode === 'deduct' ? 'Deduct Mode' : 'Record Mode'}
          </span>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col space-y-1 min-h-0">
            <label className="text-lg font-serif font-bold italic">需识别文字:</label>
            <textarea
              ref={modalInputRef}
              autoFocus
              value={modalInputValue}
              onChange={(e) => setModalInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleParse(false, modalInputValue);
                }
              }}
              placeholder="请在此输入内容..."
              className="w-full flex-1 p-3 font-mono text-base border-2 border-gray-400 focus:outline-none bg-white resize-none shadow-inner"
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col space-y-1">
            <div className="flex justify-between items-end">
              <label className="text-lg font-serif font-bold italic">识别的结果 (RESULT):</label>
              <span className="text-xs font-mono font-bold text-blue-600">
                估算总额: ¥{formatModalResults(modalInputValue).total.toLocaleString()}
              </span>
            </div>
            <div className="flex-1 w-full p-3 font-mono text-base border-2 border-gray-400 bg-[#F5F5F0] overflow-y-auto whitespace-pre-wrap break-all shadow-inner">
              {formatModalResults(modalInputValue).preview}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-2 text-xs text-red-700 font-mono animate-pulse">
              {error}
            </div>
          )}

          <div className="grid grid-cols-5 gap-1 pt-2">
            <button onClick={handlePasteAndRecognize} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">粘贴识别</button>
            <button onClick={() => modalInputRef.current?.focus()} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">重新识别</button>
            <button onClick={() => setModalInputValue('')} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">清空</button>
            <button onClick={triggerLastUndo} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">撤销</button>
            <button onClick={triggerUndoAndPaste} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap text-red-600">撤销上条并粘贴</button>
          </div>
          
          <div className="grid grid-cols-2 gap-1 mt-1">
            <button onClick={() => handleParse(false, modalInputValue)} disabled={!modalInputValue.trim()} className="bg-[#141414] hover:bg-[#2a2a2a] text-white py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-50">
              <Plus size={18} />
              保存下单 (SAVE)
            </button>
            <button onClick={() => handleParse(true, modalInputValue)} disabled={!modalInputValue.trim()} className="bg-red-600 hover:bg-red-700 text-white py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-50">
              <Minus size={18} />
              扣除下单 (REMOVE)
            </button>
          </div>
        </div>

        {/* Standalone Undo Confirm */}
        <AnimatePresence>
          {showLastUndoConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white border-4 border-[#141414] p-6 max-w-xs w-full shadow-2xl"
              >
                <h3 className="text-lg font-serif italic font-bold mb-4">确认撤销此笔业务？</h3>
                <div className="bg-gray-100 p-2 border-l-4 border-red-600 mb-4">
                  <span className="text-xs font-mono font-bold text-red-600 break-words">{undoCallback?.label}</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      undoCallback?.fn();
                      setShowLastUndoConfirm(false);
                      setUndoCallback(null);
                    }}
                    className="flex-1 bg-red-600 text-white py-2 font-mono text-[10px] font-bold hover:bg-red-700 transition-colors"
                  >
                    确认撤销
                  </button>
                  <button 
                    onClick={() => {
                      setShowLastUndoConfirm(false);
                      setUndoCallback(null);
                    }}
                    className="flex-1 border-2 border-[#141414] py-2 font-mono text-[10px] font-bold hover:bg-[#141414] hover:text-white transition-all"
                  >
                    取消
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#E4E3E0] text-[#141414] font-sans ${standaloneMode ? 'p-0' : 'p-2 md:p-4'}`}>
      <div 
        className={`${standaloneMode ? 'w-full' : 'mx-auto'} space-y-4`}
        style={{ maxWidth: standaloneMode ? 'none' : `${appWidth}px` }}
      >
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle size={18} />
              <span className="text-sm font-mono font-bold uppercase tracking-tight">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 text-red-600 transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
        {/* Compact Header & Tabs Row - REMOVED for space saving */}
        
        <main className="flex flex-col lg:flex-row gap-1">
          {/* Vertical Sidebar Navigation */}
          <nav className="flex lg:flex-col flex-row gap-1 w-full lg:w-10 mb-1 lg:mb-0">
            <button 
              onClick={() => setActiveView('stats')}
              className={`flex-1 lg:flex-none h-10 lg:h-24 flex lg:flex-col items-center justify-center gap-1 border border-[#141414] transition-all ${activeView === 'stats' ? 'bg-[#141414] text-white' : 'bg-white hover:bg-black/5'}`}
              title="财务统计"
            >
              <Calculator size={18} />
              <span className="text-[10px] font-bold lg:[writing-mode:vertical-rl]">财务统计</span>
            </button>
            <button 
              onClick={() => setActiveView('compound')}
              className={`flex-1 lg:flex-none h-10 lg:h-24 flex lg:flex-col items-center justify-center gap-1 border border-[#141414] transition-all ${activeView === 'compound' ? 'bg-[#141414] text-white' : 'bg-white hover:bg-black/5'}`}
              title="复式管理"
            >
              <TrendingUp size={18} />
              <span className="text-[10px] font-bold lg:[writing-mode:vertical-rl]">复式管理</span>
            </button>
            <div className="flex flex-row lg:flex-col gap-1 flex-1 lg:flex-none">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex-1 lg:flex-none h-10 lg:h-12 flex items-center justify-center border border-[#141414] bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
                title="设置"
              >
                <Settings size={18} />
              </button>
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="flex-1 lg:flex-none h-10 lg:h-12 flex items-center justify-center border border-[#141414] bg-white hover:bg-red-600 hover:text-white transition-colors"
                title="一键清零"
              >
                <RotateCcw size={18} />
              </button>
              <button 
                onClick={handleExport}
                className="flex-1 lg:flex-none h-10 lg:h-12 flex items-center justify-center border border-[#141414] bg-white hover:bg-emerald-600 hover:text-white transition-colors"
                title="导出记录"
              >
                <Download size={18} />
              </button>
            </div>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-1 flex-1">
          {activeView === 'stats' ? (
            <>
              {/* Left Column: Number Distribution Matrix */}
              <div 
                className="lg:col-span-6 space-y-1"
                style={{ height: `${appHeight}px` }}
              >
                <section className="bg-white border border-[#141414] p-4 h-full flex flex-col overflow-hidden">
                  <div className="flex flex-col gap-1 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash size={16} />
                        <h2 className="text-xs font-mono font-bold uppercase tracking-widest">号码分布矩阵</h2>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono opacity-50 uppercase">总和</span>
                          <span className="text-lg font-mono font-bold">¥{totalTurnover.toLocaleString()}</span>
                        </div>
                        <button 
                          id="copy-data-btn"
                          onClick={handleCopyData}
                          disabled={totalTurnover === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] text-white text-[10px] font-mono font-bold hover:bg-[#2a2a2a] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_0_0_rgba(0,0,0,0.3)] active:shadow-none active:translate-y-[2px] rounded-sm uppercase tracking-tighter"
                        >
                          <Copy size={12} />
                          复制数据
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] font-mono opacity-50 uppercase">本期特码</span>
                      <input 
                        type="text" 
                        placeholder="01-49"
                        value={specialNumberInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d]/g, '').slice(0, 2);
                          setSpecialNumberInput(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(specialNumberInput);
                            if (!isNaN(val) && val >= 1 && val <= 49) {
                              setSpecialNumber(val);
                              (e.target as HTMLInputElement).blur();
                            } else if (specialNumberInput === '') {
                              setSpecialNumber(null);
                              (e.target as HTMLInputElement).blur();
                            }
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(specialNumberInput);
                          if (!isNaN(val) && val >= 1 && val <= 49) {
                            setSpecialNumber(val);
                          } else {
                            setSpecialNumber(null);
                            setSpecialNumberInput('');
                          }
                        }}
                        className={`w-12 p-1 font-mono text-xs border border-[#141414] text-center focus:outline-none focus:ring-1 focus:ring-[#141414] ${specialNumber && specialNumber > 0 ? 'bg-yellow-50 border-yellow-600' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-x-0.5 gap-y-1 mb-4">
                    {(() => {
                      const rows = 10; 
                      const indices = [];
                      for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < 5; c++) {
                          let num = null;
                          if (c === 4) {
                            // Column 5
                            if (r === 0) num = 49;
                            else num = null;
                          } else {
                            // Columns 1-4
                            num = c * 10 + r + 1;
                            if (num >= 49) num = null;
                          }
                          indices.push(num);
                        }
                      }
                      return indices.map((num, idx) => {
                        if (num === null) return <div key={`empty-${idx}`} />;
                        
                        const amount = financeBetData[num];
                        const textColor = getBallTextColor(num);
                        const isSpecial = specialNumber === num;
                        
                        return (
                          <div 
                            key={num}
                            className={`flex items-center gap-1.5 py-1 transition-colors hover:bg-black/5 px-0.5 rounded ${isSpecial ? 'bg-yellow-50 ring-1 ring-yellow-100' : ''}`}
                          >
                            <div className="flex items-center gap-1 min-w-[42px]">
                              <span className={`text-base font-mono font-bold ${textColor}`}>
                                {num.toString().padStart(2, '0')}
                              </span>
                              <span className={`text-xs font-bold bg-black/5 px-1 rounded-sm ${textColor}`}>
                                {getZodiacByNumber(num)}
                              </span>
                            </div>
                            <div className="w-16 h-6 flex items-center justify-end px-1 border border-gray-200 text-right text-xs font-mono font-bold bg-white text-[#141414]">
                              {amount > 0 ? amount.toFixed(0) : ''}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* History Section moved inside Matrix */}
                  <div className="mt-2 pt-2 border-t border-[#141414] border-opacity-10 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <History size={14} />
                        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest">最近流水</h2>
                      </div>
                      {financeRecords.length > 0 && (
                        <button 
                          onClick={() => setIsHistoryModalOpen(true)}
                          className="text-[10px] font-mono font-bold underline opacity-60 hover:opacity-100"
                        >
                          查看全部 ({financeRecords.length})
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {financeRecords.length === 0 ? (
                        <p className="text-[9px] font-mono opacity-40 italic py-1 text-center">暂无入账记录</p>
                      ) : (
                        financeRecords.slice(0, 10).map((record, index, arr) => {
                          const winningAmount = specialNumber && specialNumber > 0
                            ? record.items.reduce((sum, item) => {
                                const hitCount = item.targets.filter(t => t === specialNumber).length;
                                return sum + (hitCount * item.amount);
                              }, 0)
                            : 0;

                          return (
                            <div key={record.id} className={`group ${index === arr.length - 1 ? '' : 'border-b border-dashed border-[#141414] border-opacity-10'} pb-1 relative overflow-hidden`}>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-mono opacity-60">{record.time}</span>
                                <div className="flex items-center gap-2">
                                  {winningAmount > 0 && (
                                    <span className="text-[10px] font-mono font-bold bg-yellow-400 px-1 rounded">中金: ¥{winningAmount}</span>
                                  )}
                                  <span className={`text-[11px] font-mono font-bold ${record.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {record.totalAmount >= 0 ? '+' : ''}¥{record.totalAmount.toFixed(1)}
                                  </span>
                                  <button 
                                    onClick={() => setConfirmingUndoId(record.id)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 text-red-600 transition-all rounded"
                                  >
                                    <RotateCcw size={10} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[11px] font-mono break-words mt-0.5 pr-8 leading-tight opacity-90">{record.raw}</p>

                              <AnimatePresence>
                                {confirmingUndoId === record.id && (
                                  <motion.div 
                                    initial={{ x: '100%' }}
                                    animate={{ x: 0 }}
                                    exit={{ x: '100%' }}
                                    className="absolute inset-0 bg-red-600 text-white flex items-center justify-between px-2 z-10"
                                  >
                                    <span className="text-[10px] font-mono font-bold">确认撤回?</span>
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={() => handleUndo(record.id)}
                                        className="text-[10px] font-mono font-bold underline"
                                      >
                                        是
                                      </button>
                                      <button 
                                        onClick={() => setConfirmingUndoId(null)}
                                        className="text-[10px] font-mono font-bold opacity-70"
                                      >
                                        否
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* Middle Column: Input & History & Settings */}
              <div className="lg:col-span-3 space-y-1">
                {/* Input Section */}
                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Plus size={16} />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest">智能录入系统</h2>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setModalMode('save');
                        setIsModalOpen(true);
                      }}
                      className="w-full text-[#E4E3E0] py-4 font-mono text-base font-bold hover:bg-opacity-90 transition-all active:translate-y-1 flex items-center justify-center gap-2 bg-[#141414]"
                    >
                      <Plus size={20} />
                      录入下注 (RECORD)
                    </button>
                  </div>
                </section>
              </div>

              {/* Right Column: Risk Analysis (Vertical List) */}
              <div 
                className="lg:col-span-3 space-y-1"
                style={{ height: `${appHeight}px` }}
              >
                <section className="bg-white border border-[#141414] flex flex-col h-full">
                  <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-100 bg-gray-50/50">
                    <AlertCircle size={12} className="text-red-600" />
                    <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest">风险值预警排名 (由亏到赚)</h2>
                  </div>

                  <div className="flex-1 space-y-0 pr-1 overflow-y-auto">
                    {(() => {
                      const totalNet = financeRecords.reduce((sum, rec) => {
                        const recGross = rec.items.reduce((s, item) => s + (item.amount * item.targets.length), 0);
                        return sum + (recGross * (1 - rebate / 100));
                      }, 0);
                      return Array.from({ length: 49 }, (_, i) => {
                        const num = i + 1;
                        const amount = financeBetData[num];
                        const risk = totalNet - (amount * odds);
                        return { num, amount, risk };
                      })
                      .sort((a, b) => a.risk - b.risk)
                      .map((item, index) => {
                        const textColor = getBallTextColor(item.num);
                        const zodiac = getZodiacByNumber(item.num);
                        return (
                          <div 
                            key={item.num} 
                            className={`py-0.5 px-1 ${index === 48 ? '' : 'border-b border-gray-100'} flex items-center justify-between transition-colors ${item.risk < 0 ? 'bg-red-50/50' : 'bg-emerald-50/50'}`}
                            style={{ height: '17px' }}
                          >
                            <div className="flex items-center gap-1 leading-none">
                              <span className={`text-sm font-mono font-bold w-5 ${textColor}`}>{index + 1}</span>
                              <span className={`text-base font-mono font-bold w-6 ${textColor}`}>{item.num.toString().padStart(2, '0')}</span>
                              <span className={`text-base font-bold w-6 h-4 flex items-center justify-center bg-black/5 rounded-sm ${textColor}`}>{zodiac}</span>
                              <span className={`text-[15px] font-mono font-bold ${textColor}`}>¥{item.amount.toFixed(0)}</span>
                            </div>
                            <div className={`text-[15px] font-mono font-bold leading-none ${textColor}`}>
                              {item.risk < 0 ? '-' : ''}¥{Math.abs(item.risk).toFixed(0)}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              {/* Compound Management View */}
              <div className="lg:col-span-4 space-y-1">
                {/* Opening Results Section */}
                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calculator size={16} />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest">开奖结果录入</h2>
                    </div>
                    <button 
                      onClick={() => setDrawNumbers(Array(7).fill(null))}
                      className="text-[9px] font-mono underline opacity-50 hover:opacity-100"
                    >
                      清空
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {drawNumbers.map((num, idx) => (
                      <React.Fragment key={idx}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[8px] font-mono opacity-40 uppercase">
                            {idx === 6 ? '特' : `${idx + 1}`}
                          </span>
                          <input 
                            type="number"
                            value={num || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const newDraw = [...drawNumbers];
                              newDraw[idx] = (val >= 1 && val <= 49) ? val : null;
                              setDrawNumbers(newDraw);
                            }}
                            placeholder="?"
                            className={`w-8 h-8 border border-[#141414] text-center font-mono font-bold text-xs focus:outline-none transition-all ${
                              num ? (idx === 6 ? 'bg-yellow-400' : 'bg-white') : 'bg-gray-50 opacity-50'
                            }`}
                          />
                          {num && <span className={`text-[9px] font-bold bg-black/5 px-1 rounded-sm mt-0.5 ${getBallTextColor(num)}`}>{getZodiacByNumber(num)}</span>}
                        </div>
                        {idx === 5 && <div className="text-lg font-bold mx-0.5">+</div>}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="智能识别开奖 (如: 01 02...)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const nums = e.currentTarget.value.match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= 49) || [];
                          if (nums.length >= 7) {
                            setDrawNumbers(nums.slice(0, 7));
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="w-full p-2 border border-[#141414] font-mono text-[10px] focus:outline-none bg-[#F9F9F7]"
                    />
                    <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30" />
                  </div>
                </section>

                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={16} />
                    <h2 className="text-xs font-mono font-bold uppercase tracking-widest">复式智能录入</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-2 bg-indigo-50 border border-indigo-100 rounded">
                      <p className="text-[10px] font-mono text-indigo-700 font-bold mb-1">录入规则：</p>
                      <ul className="text-[9px] font-mono text-indigo-600 space-y-0.5 list-disc list-inside">
                        <li>格式：[号码列表] [三中三/二中二] 各 [金额]</li>
                        <li>示例：1 2 3 4 三中三 各 40</li>
                      </ul>
                    </div>

                    <div className="flex flex-col gap-2">
                       <button
                        onClick={() => {
                          setIsModalOpen(true);
                        }}
                        className="w-full bg-indigo-600 text-white py-5 font-mono text-base font-bold hover:bg-indigo-700 transition-all active:translate-y-1 flex items-center justify-center gap-2"
                      >
                        <Plus size={20} />
                        录入复式
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <div className="lg:col-span-8 space-y-4">
                <section className="bg-white border border-[#141414] p-4 flex flex-col h-full min-h-[400px]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <History size={16} />
                        <h2 className="text-xs font-mono font-bold uppercase tracking-widest">复式流水清单</h2>
                      </div>
                      {compoundRecords.length > 0 && (
                        <button 
                          onClick={() => setIsHistoryModalOpen(true)}
                          className="text-[10px] font-mono font-bold underline opacity-60 hover:opacity-100"
                        >
                          查看全部 ({compoundRecords.length})
                        </button>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-mono opacity-50 block uppercase">复式总和</span>
                      <span className="text-lg font-mono font-bold">
                        ¥{compoundRecords.reduce((sum, r) => sum + (r.items.some(i => i.raw.includes('中')) ? r.totalAmount : 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                    {compoundRecords.filter(r => r.items.some(i => i.raw.includes('中') || i.raw.includes('特碰'))).length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                        <History size={48} />
                        <p className="text-sm font-mono font-bold mt-4">暂无复式录入记录</p>
                      </div>
                    ) : (
                      compoundRecords.filter(r => r.items.some(i => i.raw.includes('中') || i.raw.includes('特碰'))).slice(0, 10).map(record => {
                        const regularDraw = drawNumbers.slice(0, 6).filter((n): n is number => n !== null);
                        const specialDraw = drawNumbers[6];
                        
                        let totalWin = 0;
                        const itemResults = record.items.map(item => {
                          let isWin = false;
                          let matchCount = 0;
                          
                          if (item.raw.includes('特碰')) {
                            const hasSpecial = specialDraw !== null && item.targets.includes(specialDraw);
                            const otherNum = item.targets.find(t => t !== specialDraw);
                            const hasRegular = otherNum !== undefined && regularDraw.includes(otherNum);
                            const isWin = hasSpecial && hasRegular;
                            
                            if (isWin) {
                              totalWin += item.amount;
                            }
                            return { ...item, isWin, matchCount: isWin ? 1 : 0, hasSpecial };
                          } else {
                            matchCount = item.targets.filter(t => regularDraw.includes(t)).length;
                            if (item.raw.includes('三中三')) isWin = matchCount === 3;
                            else if (item.raw.includes('二中二')) isWin = matchCount === 2;
                            else if (item.raw.includes('三中二')) isWin = matchCount >= 2;
                            
                            if (isWin) totalWin += item.amount;
                            return { ...item, isWin, matchCount };
                          }
                        });

                        const hasAnyWin = totalWin > 0;

                        return (
                          <div key={record.id} className={`border p-4 relative group transition-all ${hasAnyWin ? 'bg-yellow-50 border-yellow-500' : 'bg-[#F9F9F7] border-[#141414]'}`}>
                            <div className="flex justify-between items-center mb-3">
                              <span className={`text-xs font-mono font-bold px-2 py-1 ${hasAnyWin ? 'bg-yellow-500 text-white' : 'bg-[#141414] text-white'}`}>{record.time}</span>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-[9px] font-mono opacity-50 uppercase">Bet / Win</div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold opacity-60">下注:¥{Math.abs(record.totalAmount).toFixed(0)}</span>
                                    {hasAnyWin && (
                                      <span className="text-lg font-mono font-bold text-red-600 animate-bounce">中奖:¥{totalWin.toFixed(0)}</span>
                                    )}
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setConfirmingUndoId(record.id)}
                                  className="p-1 hover:bg-red-100 text-red-600 transition-all rounded border border-transparent hover:border-red-200"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className={`text-sm font-mono font-bold border-l-4 pl-3 py-1 break-words ${hasAnyWin ? 'border-yellow-600 bg-yellow-100/50' : 'border-indigo-500 bg-indigo-50'}`}>
                                识别详情: {record.raw}
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                {itemResults.map((item, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`text-[11px] font-mono p-2 flex justify-between border transition-all ${
                                      item.isWin 
                                        ? 'bg-white border-yellow-400 ring-1 ring-yellow-400' 
                                        : 'bg-white/50 border-black/5 opacity-60'
                                    }`}
                                  >
                                    <span className="font-bold flex items-center gap-2">
                                      {item.isWin && <span className="text-yellow-600">★</span>}
                                      {item.targets.join('-')}
                                    </span>
                                    <div className="flex flex-col items-end">
                                      <span className={item.isWin ? 'text-red-600 font-bold' : 'opacity-40'}>
                                        {item.isWin ? '中奖!' : `${item.amount}元`}
                                      </span>
                                      <span className="text-[9px] opacity-40">
                                        {item.matchCount}位匹配 {item.hasSpecial ? '(含特)' : ''}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                          <AnimatePresence>
                            {confirmingUndoId === record.id && (
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-red-600/95 text-white flex flex-col items-center justify-center z-10"
                              >
                                <span className="text-sm font-mono font-bold mb-4">确认撤回此条复式记录?</span>
                                <div className="flex gap-6">
                                  <button onClick={() => handleUndo(record.id)} className="px-8 py-2 bg-white text-red-600 font-mono font-bold hover:bg-opacity-90">是 (YES)</button>
                                  <button onClick={() => setConfirmingUndoId(null)} className="px-8 py-2 border-2 border-white text-white font-mono font-bold hover:bg-white hover:text-red-600">否 (NO)</button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
                </section>
              </div>
            </>
          )}
          </div>
        </main>

        {/* Footer Info */}
        <footer className="pt-8 border-t border-[#141414] border-opacity-10 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex gap-6">
            <div className="space-y-1">
              <span className="text-[10px] font-mono opacity-50 uppercase block">System Status</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono font-bold">READY • REAL-TIME SYNC ACTIVE</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-mono opacity-50 uppercase block">Data Integrity</span>
              <span className="text-[10px] font-mono font-bold">VERIFIED • REGEX PARSER V2.4</span>
            </div>
          </div>
          <div className="text-[10px] font-mono opacity-30 text-right">
            © 2026 LOTTERY FINANCIAL INTELLIGENCE SYSTEM. ALL RIGHTS RESERVED.
          </div>
        </footer>
      </div>

      {/* Data Entry Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent border-4 border-[#141414]/5 ring-1 ring-inset ring-white/20">
            <motion.div 
              drag
              dragControls={dragControls}
              dragListener={false}
              dragMomentum={false}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              style={{ width: '650px', height: '680px', minWidth: '450px', minHeight: '550px' }}
              className="bg-[#F2F1ED] border-4 border-[#141414] p-6 flex flex-col gap-4 shadow-none resize overflow-hidden"
            >
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="flex items-center justify-between border-b border-[#141414] pb-2 cursor-move select-none"
              >
                <h3 className="text-2xl font-serif italic font-bold pointer-events-none">
                  智能下注录入
                </h3>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-xs font-mono hover:underline"
                  >
                    [关闭]
                  </button>
              </div>

              <div className="flex-1 flex flex-col gap-4 min-h-0">
                {/* Top Window: Input */}
                <div className="flex-1 flex flex-col space-y-1 min-h-0">
                  <div className="flex justify-between items-end">
                    <label className="text-xl font-serif font-bold">需识别文字:</label>
                  </div>
                  <textarea
                    ref={modalInputRef}
                    autoFocus
                    value={modalInputValue}
                    onChange={(e) => setModalInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.shiftKey) {
                        e.preventDefault();
                        handleParse(false, modalInputValue);
                      }
                    }}
                    className="w-full flex-1 p-3 font-mono text-base border-2 border-gray-400 focus:outline-none bg-white resize-none shadow-inner rounded-none"
                  />
                </div>

                {/* Bottom Window: Display */}
                <div className="flex-1 flex flex-col space-y-1 min-h-0">
                  <div className="flex justify-between items-end">
                    <label className="text-xl font-serif font-bold italic">识别的结果 (RESULT):</label>
                    {modalInputValue.trim() && (
                      <span className="text-sm font-mono font-bold text-blue-600">
                        估算总额: ¥{formatModalResults(modalInputValue).total.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="w-full flex-1 p-3 font-mono text-base border-2 border-gray-400 bg-[#F5F5F0] overflow-y-auto whitespace-pre-wrap break-all shadow-inner">
                    {formatModalResults(modalInputValue).preview}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-2 text-xs text-red-700 font-mono animate-pulse">
                    {error}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1 mt-2">
                <button 
                  onClick={handlePasteAndRecognize}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
                >
                  粘贴识别
                </button>
                <button 
                  onClick={() => {
                    modalInputRef.current?.focus();
                  }}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
                >
                  重新识别
                </button>
                <button 
                  onClick={() => setModalInputValue('')}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
                >
                  清空
                </button>
                <button 
                  onClick={triggerLastUndo}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
                >
                  撤销
                </button>
                <button 
                  onClick={triggerUndoAndPaste}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-red-600 whitespace-nowrap"
                >
                  撤销上条并粘贴
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button 
                  onClick={() => handleParse(false, modalInputValue)}
                  disabled={!modalInputValue.trim()}
                  className="w-full bg-[#141414] hover:bg-[#2a2a2a] text-white border border-[#141414] py-4 text-sm font-bold transition-all active:bg-black flex items-center justify-center gap-2 rounded-none shadow-md disabled:opacity-50"
                >
                  <Plus size={18} />
                  保存下单 (SAVE)
                </button>
                <button 
                  onClick={() => handleParse(true, modalInputValue)}
                  disabled={!modalInputValue.trim()}
                  className="w-full bg-red-600 hover:bg-red-700 text-white border border-red-600 py-4 text-sm font-bold transition-all active:bg-red-800 flex items-center justify-center gap-2 rounded-none shadow-md disabled:opacity-50"
                >
                  <Minus size={18} />
                  扣除下单 (REMOVE)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Global Last Undo Confirm Modal */}
      <AnimatePresence>
        {showLastUndoConfirm && !standaloneMode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-[#141414] p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-serif italic font-bold mb-4">确认撤销此笔业务？</h3>
              <div className="bg-gray-100 p-3 border-l-4 border-red-600 mb-6">
                <span className="text-[10px] uppercase font-mono opacity-50 block mb-1">识别到的数据：</span>
                <span className="text-sm font-mono font-bold text-red-600 break-words">{undoCallback?.label}</span>
              </div>
              <p className="text-[11px] font-mono opacity-70 mb-6 leading-relaxed">
                撤销后，该记录将从流水中删除，对应的金额将自动扣回。
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    undoCallback?.fn();
                    setShowLastUndoConfirm(false);
                    setUndoCallback(null);
                  }}
                  className="flex-1 bg-red-600 text-white py-3 font-mono text-xs font-bold hover:bg-red-700 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  确认撤销
                </button>
                <button 
                  onClick={() => {
                    setShowLastUndoConfirm(false);
                    setUndoCallback(null);
                  }}
                  className="flex-1 border-2 border-[#141414] py-3 font-mono text-xs font-bold hover:bg-[#141414] hover:text-white transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-2 border-[#141414] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="bg-[#141414] text-[#E4E3E0] p-4 flex justify-between items-center">
                <h3 className="text-sm font-mono font-bold uppercase tracking-widest flex items-center gap-2">
                  <Settings size={16} />
                  系统设置 (SETTINGS)
                </h3>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-xs font-mono hover:underline"
                >
                  [关闭]
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block">当前赔率</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={tempOdds}
                      onChange={(e) => setTempOdds(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 font-mono text-base border-2 border-[#141414] focus:outline-none focus:bg-gray-50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono opacity-30">倍</span>
                  </div>
                  <p className="text-[10px] font-mono opacity-40">设置中奖时的赔付倍数。</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block">反水比例</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={tempRebate}
                      onChange={(e) => setTempRebate(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 font-mono text-base border-2 border-[#141414] focus:outline-none focus:bg-gray-50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono opacity-30">%</span>
                  </div>
                  <p className="text-[10px] font-mono opacity-40">设置下注时的返利比例（默认 4%）。</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">识别框精准撤销</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，若识别框有内容，点击撤销将优先匹配流水中的该条记录。</p>
                    </div>
                    <button 
                      onClick={() => setTempEnableSearchUndo(!tempEnableSearchUndo)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempEnableSearchUndo ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempEnableSearchUndo ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-bold uppercase tracking-widest block">软件分辨率</label>
                    <button 
                      onClick={() => {
                        setTempAppWidth(1360);
                        setTempAppHeight(920);
                      }}
                      className="text-[10px] font-mono underline opacity-50 hover:opacity-100"
                    >
                      恢复默认 (全视角)
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono opacity-40">宽</span>
                      <input 
                        type="number" 
                        value={tempAppWidth}
                        onChange={(e) => setTempAppWidth(parseInt(e.target.value) || 0)}
                        className="w-full pl-8 p-2 font-mono text-xs border-2 border-[#141414] focus:outline-none"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono opacity-40">高</span>
                      <input 
                        type="number" 
                        value={tempAppHeight}
                        onChange={(e) => setTempAppHeight(parseInt(e.target.value) || 0)}
                        className="w-full pl-8 p-2 font-mono text-xs border-2 border-[#141414] focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] font-mono opacity-40">手动调整软件界面的宽度与主体内容高度。为了完整显示49个风险值项，建议高度不低于 920 像素。</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block text-blue-600">高级：多窗口录入助手</label>
                  <a 
                    href={window.location.origin + window.location.pathname + '?mode=entry'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full p-3 font-mono text-center text-[11px] border-2 border-dashed border-blue-200 hover:border-blue-500 hover:text-blue-600 transition-colors bg-blue-50/30"
                  >
                    🚀 点击在新网页中打开录入工具
                  </a>
                  <p className="text-[9px] font-mono opacity-50">打开后，您可以将新页面缩小并移到桌面任意位置。在此助手录入的数据会自动同步回此大窗口。</p>
                </div>

                <button 
                  onClick={() => {
                    // Only apply changes on Save
                    setOdds(tempOdds);
                    setRebate(tempRebate);
                    setEnableSearchUndo(tempEnableSearchUndo);
                    setAppWidth(tempAppWidth);
                    setAppHeight(tempAppHeight);
                    localStorage.setItem('odds', tempOdds.toString());
                    localStorage.setItem('rebate', tempRebate.toString());
                    localStorage.setItem('enableSearchUndo', tempEnableSearchUndo.toString());
                    localStorage.setItem('appWidth', tempAppWidth.toString());
                    localStorage.setItem('appHeight', tempAppHeight.toString());
                    setIsSettingsOpen(false);
                  }}
                  className="w-full bg-[#141414] text-[#E4E3E0] py-4 font-mono text-sm font-bold hover:bg-opacity-90 transition-all"
                >
                  保存并关闭 (SAVE & CLOSE)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-2 border-[#141414] p-6 max-w-sm w-full"
            >
              <h3 className="text-xl font-serif italic font-bold mb-2">确认清零？</h3>
              <p className="text-sm font-mono opacity-70 mb-6">此操作将永久删除当前所有统计数据和流水记录，无法恢复。</p>
              <div className="flex gap-3">
                <button 
                  onClick={handleReset}
                  className="flex-1 bg-red-600 text-white py-2 font-mono text-sm font-bold hover:bg-red-700 transition-colors"
                >
                  确认清零
                </button>
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 border border-[#141414] py-2 font-mono text-sm font-bold hover:bg-[#141414] hover:text-white transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* All History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#E4E3E0] border-2 border-[#141414] p-6 max-w-4xl w-full h-[80vh] flex flex-col gap-4"
            >
              <div className="flex items-center justify-between border-b border-[#141414] pb-2">
                <h3 className="text-2xl font-serif italic font-bold">
                  {activeView === 'stats' ? '全部特码流水' : '全部复式流水'}
                </h3>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-xs font-mono hover:underline"
                >
                  [关闭]
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {(activeView === 'stats' ? financeRecords : compoundRecords).length === 0 ? (
                  <p className="text-sm font-mono opacity-40 italic py-20 text-center">暂无记录</p>
                ) : (
                  (activeView === 'stats' ? financeRecords : compoundRecords).map(record => {
                    const winningAmount = activeView === 'stats' && specialNumber 
                      ? record.items.reduce((sum, item) => {
                          const hitCount = item.targets.filter(t => t === specialNumber).length;
                          return sum + (hitCount * item.amount);
                        }, 0)
                      : 0;

                    return (
                      <div key={record.id} className="group border-b border-dashed border-[#141414] border-opacity-20 pb-2 relative overflow-hidden bg-white/50 p-2 rounded">
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-mono opacity-60">{record.time}</span>
                          <div className="flex items-center gap-2">
                            {winningAmount > 0 && (
                              <span className="text-[11px] font-mono font-bold bg-yellow-400 px-1 rounded">中金: ¥{winningAmount}</span>
                            )}
                            <span className={`text-sm font-mono font-bold ${record.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {record.totalAmount >= 0 ? '+' : ''}¥{record.totalAmount.toFixed(1)}
                            </span>
                            <button 
                              onClick={() => setConfirmingUndoId(record.id)}
                              className="p-1 hover:bg-red-100 text-red-600 transition-all rounded"
                              title="撤回此条"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-mono mt-1">{record.fullRaw || record.raw}</p>
                        {record.parsedPreview && (
                          <div className="mt-1 p-1 bg-gray-50 text-[11px] font-mono opacity-60 whitespace-pre-wrap border-l-2 border-gray-200">
                            {record.parsedPreview}
                          </div>
                        )}
                        
                        <AnimatePresence>
                          {confirmingUndoId === record.id && (
                            <motion.div 
                              initial={{ x: '100%' }}
                              animate={{ x: 0 }}
                              exit={{ x: '100%' }}
                              className="absolute inset-0 bg-red-600 text-white flex items-center justify-between px-3 z-10"
                            >
                              <span className="text-[11px] font-mono font-bold">确认撤回?</span>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleUndo(record.id)}
                                  className="text-[11px] font-mono font-bold underline"
                                >
                                  是
                                </button>
                                <button 
                                  onClick={() => setConfirmingUndoId(null)}
                                  className="text-[11px] font-mono font-bold opacity-70"
                                >
                                  否
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper: Get Zodiac for a number in 2026 (Horse year)
function getZodiacByNumber(num: number): string {
  const baseIndex = (num - 1) % 12;
  return ZODIAC_LIST[baseIndex];
}

// Helper: Get Text Color based on Wave
function getBallTextColor(num: number): string {
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
  const green = [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49];

  if (red.includes(num)) return 'text-red-600';
  if (blue.includes(num)) return 'text-blue-600';
  if (green.includes(num)) return 'text-green-600';
  return 'text-[#141414]';
}

// Helper: Standard Mark Six Ball Colors
function getBallColor(num: number): string {
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
  const green = [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49];

  if (red.includes(num)) return 'bg-red-500 text-white border-red-500';
  if (blue.includes(num)) return 'bg-blue-500 text-white border-blue-500';
  if (green.includes(num)) return 'bg-green-500 text-white border-green-500';
  return '';
}
