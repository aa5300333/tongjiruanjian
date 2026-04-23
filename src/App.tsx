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
  Copy,
  Upload,
  ChevronLeft,
  ChevronRight
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
  const [lastSubmittedModalValue, setLastSubmittedModalValue] = useState('');
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
  const [requireUndoConfirm, setRequireUndoConfirm] = useState<boolean>(() => {
    const saved = localStorage.getItem('requireUndoConfirm');
    return saved === null ? true : saved === 'true'; // Default ON
  });
  const [requireUndoPasteConfirm, setRequireUndoPasteConfirm] = useState<boolean>(() => {
    const saved = localStorage.getItem('requireUndoPasteConfirm');
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
  const appWidth = 1620;
  const appHeight = 930;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempOdds, setTempOdds] = useState(odds);
  const [tempRebate, setTempRebate] = useState(rebate);
  const [tempEnableSearchUndo, setTempEnableSearchUndo] = useState(enableSearchUndo);
  const [tempRequireUndoConfirm, setTempRequireUndoConfirm] = useState(requireUndoConfirm);
  const [tempRequireUndoPasteConfirm, setTempRequireUndoPasteConfirm] = useState(requireUndoPasteConfirm);

  // Initialize temp states when settings opens
  useEffect(() => {
    if (isSettingsOpen) {
      setTempOdds(odds);
      setTempRebate(rebate);
      setTempEnableSearchUndo(enableSearchUndo);
      setTempRequireUndoConfirm(requireUndoConfirm);
      setTempRequireUndoPasteConfirm(requireUndoPasteConfirm);
    }
  }, [isSettingsOpen, odds, rebate, enableSearchUndo, requireUndoConfirm, requireUndoPasteConfirm]);

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
  const [auxSpecialNumber, setAuxSpecialNumber] = useState<number | null>(() => {
    const saved = localStorage.getItem('auxSpecialNumber');
    return saved ? parseInt(saved) : null;
  });
  const [auxSpecialNumberInput, setAuxSpecialNumberInput] = useState(auxSpecialNumber ? auxSpecialNumber.toString().padStart(2, '0') : '');
  const [riskNumbers, setRiskNumbers] = useState<string[]>(() => {
    const saved = localStorage.getItem('riskNumbers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((v: any) => v === null ? '' : v.toString());
      } catch (e) {
        return Array(15).fill('');
      }
    }
    return Array(15).fill('');
  });
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const riskInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-close error alerts after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

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
      if (e.key === 'auxSpecialNumber') setAuxSpecialNumber(e.newValue ? parseInt(e.newValue) : null);
      if (e.key === 'odds') setOdds(e.newValue ? parseFloat(e.newValue) : 48.5);
      if (e.key === 'rebate') setRebate(e.newValue ? parseFloat(e.newValue) : 4);
      if (e.key === 'enableSearchUndo') setEnableSearchUndo(e.newValue === 'true');
      if (e.key === 'requireUndoConfirm') setRequireUndoConfirm(e.newValue === 'true');
      if (e.key === 'requireUndoPasteConfirm') setRequireUndoPasteConfirm(e.newValue === 'true');
      if (e.key === 'riskNumbers') setRiskNumbers(JSON.parse(e.newValue || '[]'));
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
  useEffect(() => {
    localStorage.setItem('requireUndoConfirm', requireUndoConfirm.toString());
  }, [requireUndoConfirm]);
  useEffect(() => {
    localStorage.setItem('requireUndoPasteConfirm', requireUndoPasteConfirm.toString());
  }, [requireUndoPasteConfirm]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalInputRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();

  const totalTurnover = useMemo(() => {
    return Object.values(financeBetData).reduce((sum: number, val: number) => sum + val, 0);
  }, [financeBetData]);

  useEffect(() => {
    localStorage.setItem('riskNumbers', JSON.stringify(riskNumbers));
  }, [riskNumbers]);

  useEffect(() => {
    localStorage.setItem('tempSpecialNumber', auxSpecialNumber ? auxSpecialNumber.toString() : '');
    localStorage.setItem('auxSpecialNumber', auxSpecialNumber ? auxSpecialNumber.toString() : '');
  }, [auxSpecialNumber]);

  const handleRiskInputChange = (index: number, value: string) => {
    const newRisk = [...riskNumbers];
    const cleanValue = value.replace(/[^\d]/g, '').slice(-2);
    
    // Validate number 0-49 if not empty
    if (cleanValue === '') {
      newRisk[index] = '';
      setRiskNumbers(newRisk);
      return;
    }

    const num = parseInt(cleanValue);
    if (!isNaN(num) && num >= 0 && num <= 49) {
      newRisk[index] = cleanValue;
      setRiskNumbers(newRisk);
      
      // Auto focus next box if we have 2 digits (e.g. "05", "12")
      if (cleanValue.length >= 2 && index < 14) {
        riskInputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleRiskKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && riskNumbers[index] === '' && index > 0) {
      riskInputRefs.current[index - 1]?.focus();
    }
  };

  const handleRiskPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    // Extract all numbers between 1 and 49
    const numbers = (text.match(/\d+/g) || [])
      .map(n => parseInt(n))
      .filter(n => n >= 1 && n <= 49)
      .map(n => n.toString().padStart(2, '0'));
    
    if (numbers.length === 0) return;

    const newRisk = [...riskNumbers];
    let currentIdx = index;
    for (const num of numbers) {
      if (currentIdx < 15) {
        newRisk[currentIdx] = num;
        currentIdx++;
      }
    }
    setRiskNumbers(newRisk);
    
    // Auto focus the last filled box if not beyond range
    const lastFocusIdx = Math.min(index + numbers.length - 1, 14);
    riskInputRefs.current[lastFocusIdx]?.focus();
  };

  const getRiskMatchCount = (numbers: number[]) => {
    const riskSet = new Set(
      riskNumbers
        .map(s => parseInt(s))
        .filter(n => !isNaN(n) && n >= 1 && n <= 49)
    );
    return numbers.filter(n => riskSet.has(n)).length;
  };

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
          const matchCount = getRiskMatchCount(res.numbers);
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
      const previewLines = previewData.rawPreview.split('\n').map(l => l.replace(/（合计：\d+）/, '').trim()).filter(l => l.length > 0);
      const displayRaw = previewLines.join(' ');
      const finalRaw = displayRaw.length > 100 ? displayRaw.substring(0, 100) + '...' : displayRaw;

      const newRecord: BetRecord = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        raw: finalRaw,
        fullRaw: inputToParse,
        parsedPreview: previewData.rawPreview,
        items,
        totalAmount: totalInputAmount,
        rebate: rebate
      };

      if (activeView === 'compound') {
        setCompoundRecords(prev => [ newRecord, ...prev ]);
      } else {
        setFinanceRecords(prev => [ newRecord, ...prev ]);
      }
      
      // setInputValue('');
      // setModalInputValue('');
      setLastSubmittedModalValue(inputToParse);
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
      if (requireUndoConfirm) {
        setUndoCallback({ 
          fn: () => {
            handleUndo(targetRecord!.id);
          }, 
          label: `${targetRecord.raw}` 
        });
        setShowLastUndoConfirm(true);
      } else {
        handleUndo(targetRecord.id);
      }
    } else {
      setError('没有可撤销的记录');
      setTimeout(() => setError(null), 2000);
    }
  };

  const triggerClearAndPaste = () => {
    if (requireUndoPasteConfirm) {
      setUndoCallback({ 
        fn: async () => {
          handleReset(true);
          await handlePasteAndRecognize();
        }, 
        label: "确定清空所有数据并粘贴新内容？" 
      });
      setShowLastUndoConfirm(true);
    } else {
      handleReset(true);
      handlePasteAndRecognize();
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

  const handleReset = (keepRiskNumbers: boolean = false) => {
    if (activeView === 'stats') {
      setFinanceBetData(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])));
      setFinanceRecords([]);
      setSpecialNumber(null);
      setAuxSpecialNumber(null);
      setAuxSpecialNumberInput('');
      // 同时清空风险号码，除非明确要求保留
      if (!keepRiskNumbers) {
        setRiskNumbers(Array(15).fill(''));
      }
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

    const totalAmount = activeBets.reduce((sum, [_, amount]) => sum + (amount as number), 0);
    const dataString = "上报散码数据:\n" + 
      activeBets.map(([num, amount]) => `${num.padStart(2, '0')}=${(amount as number).toFixed(0)}`).join(' ') +
      `\n合计：${totalAmount.toFixed(0)}`;

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
        const currentRebateVal = rebate; // 使用设置中的当前返水比例
        const isDeduct = record.totalAmount < 0;

        record.items.forEach(item => {
          let itemWinningStake = 0;
          let itemTotalStake = 0;

          if (activeView === 'stats') {
            itemTotalStake = Math.abs(item.amount * item.targets.length);
            const hitCount = item.targets.filter(t => t === specialDraw).length;
            itemWinningStake = Math.abs(item.amount) * hitCount;
          } else {
            itemTotalStake = Math.abs(item.amount);
            if (item.raw.includes('特碰')) {
              const hasSpecial = specialDraw !== null && item.targets.includes(specialDraw);
              const otherNum = item.targets.find(t => t !== specialDraw);
              const hasRegular = otherNum !== undefined && regularDraw.includes(otherNum);
              if (hasSpecial && hasRegular) {
                itemWinningStake = Math.abs(item.amount);
              }
            } else {
              const matchCount = item.targets.filter(t => regularDraw.includes(t)).length;
              let isWin = false;
              if (item.raw.includes('三中三')) isWin = matchCount === 3;
              else if (item.raw.includes('二中二')) isWin = matchCount === 2;
              else if (item.raw.includes('三中二')) isWin = matchCount >= 2;

              if (isWin) {
                itemWinningStake = Math.abs(item.amount);
              }
            }
          }

          winningStake += itemWinningStake;
          
          // 赔付金额（含水） = 中奖金额*倍数 - 下注金额 + 返水
          const rebateAmount = (itemTotalStake * currentRebateVal / 100);
          const itemNetResult = (itemWinningStake * odds) - itemTotalStake + rebateAmount;
          payout += itemNetResult;
        });

        let displayPreview = record.parsedPreview || '';
        if (isDeduct) {
          // 将合计改为负数
          displayPreview = displayPreview.replace(/（合计：(\d+(?:\.\d+)?)）/g, '（合计：-$1）');
          // 扣除记录的赔付结果也应该是负数，表示回退之前的盈亏
          payout = -payout;
        }

        return {
          winningStake: winningStake > 0 ? (isDeduct ? -Number(winningStake.toFixed(2)) : Number(winningStake.toFixed(2))) : "",
          payout: Number(payout.toFixed(2)),
          totalAmount: isDeduct ? -Math.abs(record.totalAmount) : Math.abs(record.totalAmount),
          fullRaw: record.fullRaw || record.raw || '',
          parsedPreview: displayPreview,
          isDeduct: isDeduct
        };
      });

      // Create worksheet data
      const wsData = [
        ['原数据', '识别后的数据', '下注金额', '用户中奖金额', '赔付金额（含水）'],
        ...exportData.map(d => [d.fullRaw, d.parsedPreview, d.totalAmount, d.winningStake, d.payout])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Apply styles and comments
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      // Set header style (Row 0)
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { name: "宋体", sz: 11, bold: true },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
      }

      exportData.forEach((d, i) => {
        const row = i + 1; // Header is row 0

        // Set default style for all cells in the row
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: C });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              font: { name: "宋体", sz: 11 },
              alignment: { vertical: "center" }
            };
          }
        }

        // Column B: Parsed Preview (Red if deduct)
        const cellB = XLSX.utils.encode_cell({ r: row, c: 1 });
        if (ws[cellB] && d.isDeduct) {
          ws[cellB].s.font.color = { rgb: "FF0000" };
        }

        // Column C: Bet Amount (Alignment, Bold)
        const cellC = XLSX.utils.encode_cell({ r: row, c: 2 });
        if (ws[cellC]) {
          ws[cellC].s.font.bold = true;
          ws[cellC].s.alignment.horizontal = "center";
          
          // Add comment to C column
          if (d.fullRaw) {
            ws[cellC].c = [{ t: String(d.fullRaw).trim(), a: "录入原文" }];
            (ws[cellC].c as any).hidden = true;
          }
        }
        
        // Column D: Winning Amount (Red, Bold, Center)
        const cellD = XLSX.utils.encode_cell({ r: row, c: 3 });
        if (ws[cellD]) {
          ws[cellD].s.font.bold = true;
          ws[cellD].s.font.color = { rgb: "FF0000" };
          ws[cellD].s.alignment.horizontal = "center";
        }

        // Column E: Payout (Center)
        const cellE = XLSX.utils.encode_cell({ r: row, c: 4 });
        if (ws[cellE]) {
          ws[cellE].s.alignment.horizontal = "center";
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

  const renderHighlightedText = (text: string) => {
    const tokens = text.split(/(\d+)/);
    const riskSet = new Set(
      riskNumbers
        .map(s => parseInt(s))
        .filter(n => !isNaN(n) && n >= 1 && n <= 49)
    );

    return tokens.map((token, i) => {
      if (/^\d+$/.test(token)) {
        const n = parseInt(token, 10);
        if (n > 49) {
          return (
            <span key={i} className="text-red-700 font-bold bg-red-100 px-0.5 rounded border border-red-300 mx-0.5" title="超出范围 (码数只能 01-49)">
              {token}
            </span>
          );
        }
        if (riskSet.has(n)) {
          return (
            <span key={i} className="text-red-600 font-bold underline" title="此号码在今日录入助手风险名单中">
              {token}
            </span>
          );
        }
      }
      return token;
    });
  };

  const formatModalResults = (input: string): { preview: React.ReactNode, rawPreview: string, total: number } => {
    if (!input.trim()) return { preview: '等待输入...', rawPreview: '等待输入...', total: 0 };
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
          let previewLines: React.ReactNode[] = [];
          let rawPreview = '';
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
                  const lineText = `${type}: ${segmentNumbers.join(' | ')} 各${amountPerGroup}（合计：${subTotal}）`;
                  rawPreview += lineText + '\n';
                  // Check risk for compound segments (flattened numbers across all lines in segment)
                  const allNumbersInSegment = contentToProcess.split(/\n/).flatMap(line => 
                    (line.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 49)
                  );
                  const matchCount = getRiskMatchCount(allNumbersInSegment);
                  const isHighRisk = matchCount >= 8;
                  previewLines.push(<div key={idx} className={isHighRisk ? "text-red-600 font-bold" : ""}>{renderHighlightedText(lineText)}</div>);
                }
            }
          });

          if (hasValidBlock) {
            return { preview: <>{previewLines}</>, rawPreview: rawPreview.trim(), total: totalBet };
          }
        }
        return { preview: '格式错误，未识别到玩法或金额。格式如："二中二 05-19 10"', rawPreview: '格式错误', total: 0 };
      }

      const results = parseInput(input);
      if (results.length === 0) return { preview: '无法解析，请检查格式', rawPreview: '无法解析', total: 0 };
      
      let grandTotal = 0;
      const rawLines: string[] = [];
      const previewLines: React.ReactNode[] = [];

      results.forEach((res, idx) => {
        const count = res.numbers.length;
        const total = count * res.amount;
        grandTotal += total;
        const lineText = `${res.raw} 各${res.amount}（合计：${total}）`;
        rawLines.push(lineText);

        const matchCount = getRiskMatchCount(res.numbers);
        const isRiskHigh = matchCount >= 8;

        // 检测是否有大于 49 的数字
        const hasInvalid = /\d+/.test(res.raw) && (res.raw.match(/\d+/g) || []).some(n => parseInt(n) > 49);

        previewLines.push(
          <div key={idx} className={`${hasInvalid ? "bg-red-50" : ""} ${isRiskHigh ? "text-red-600 font-bold" : ""}`}>
            {renderHighlightedText(res.raw)}
            <span className="opacity-70"> 各{res.amount}（合计：{total}）</span>
          </div>
        );
      });

      return { preview: <>{previewLines}</>, rawPreview: rawLines.join('\n'), total: grandTotal };
    } catch (e) {
      return { preview: '解析错误', rawPreview: '解析错误', total: 0 };
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
            <button 
              onClick={() => {
                modalInputRef.current?.focus();
                setLastSubmittedModalValue('');
              }} 
              className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap"
            >
              重新识别
            </button>
            <button onClick={() => setModalInputValue('')} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">清空</button>
            <button onClick={triggerLastUndo} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">撤销</button>
            <button onClick={triggerClearAndPaste} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap text-red-600">清空数据并粘贴</button>
          </div>
          
          <div className="grid grid-cols-5 gap-1 mt-1">
            <button 
              onClick={() => handleParse(false, modalInputValue)} 
              disabled={!modalInputValue.trim() || modalInputValue === lastSubmittedModalValue} 
              className="col-span-4 bg-[#141414] hover:bg-[#2a2a2a] text-white py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale"
            >
              <Plus size={18} />
              保存下单 (SAVE)
            </button>
            <button 
              onClick={() => handleParse(true, modalInputValue)} 
              disabled={!modalInputValue.trim() || modalInputValue === lastSubmittedModalValue} 
              className="col-span-1 bg-red-600 hover:bg-red-700 text-white py-4 text-xs font-bold transition-all flex items-center justify-center gap-1 mt-1 disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale"
            >
              <Minus size={14} />
              扣除
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
                <h3 className="text-lg font-serif italic font-bold mb-4">操作确认</h3>
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
    <div className="h-screen w-screen bg-white text-[#141414] font-sans flex overflow-hidden relative">
      {/* Sidebar Toggle Button (Moved to Top-Left) */}
      <button 
        onClick={() => setIsSidebarVisible(!isSidebarVisible)}
        className="fixed left-2 top-2 z-[60] bg-gray-100 text-gray-500 p-1.5 hover:bg-gray-200 transition-all rounded shadow-sm flex items-center justify-center border border-gray-300"
        title={isSidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
      >
        {isSidebarVisible ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Sidebar Navigation */}
      <aside 
        className="flex-shrink-0 bg-[#f5f5f5] border-r border-gray-200 flex flex-col z-20 overflow-hidden"
        style={{ width: isSidebarVisible ? '200px' : '0px', transition: 'width 0.3s ease-in-out' }}
      >
        <div className="w-[200px] flex flex-col h-full">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-gray-800">财务智能统计</h1>
            <p className="text-[9px] font-mono opacity-50 mt-1 uppercase">v2.4 Professional</p>
          </div>
          
          <nav className="flex-1 p-3 space-y-2">
            <div className="space-y-1">
              <label className="px-3 text-[9px] font-mono font-bold uppercase opacity-40">主要功能</label>
              <button 
                onClick={() => setActiveView('stats')}
                className={`w-full h-11 flex items-center gap-3 px-4 rounded-md transition-all ${activeView === 'stats' ? 'bg-[#141414] text-white shadow-md' : 'text-gray-600 hover:bg-black/5'}`}
              >
                <Calculator size={18} />
                <span className="text-sm font-bold">财务统计</span>
              </button>
              <button 
                onClick={() => setActiveView('compound')}
                className={`w-full h-11 flex items-center gap-3 px-4 rounded-md transition-all ${activeView === 'compound' ? 'bg-[#141414] text-white shadow-md' : 'text-gray-600 hover:bg-black/5'}`}
              >
                <TrendingUp size={18} />
                <span className="text-sm font-bold">复式管理</span>
              </button>
            </div>

            <div className="pt-4 space-y-1">
              <label className="px-3 text-[9px] font-mono font-bold uppercase opacity-40">数据操作</label>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-gray-600 hover:bg-black/5 transition-all"
              >
                <Settings size={18} />
                <span className="text-sm font-bold">系统设置</span>
              </button>
              <button 
                onClick={handleExport}
                className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-gray-600 hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 transition-all"
              >
                <Download size={18} />
                <span className="text-sm font-bold">导出报表</span>
              </button>
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-gray-600 hover:bg-red-50 text-red-700 hover:text-red-800 transition-all"
              >
                <RotateCcw size={18} />
                <span className="text-sm font-bold">一键清零</span>
              </button>
            </div>
          </nav>

          <div className="p-4 border-t border-gray-200">
             <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono font-bold opacity-70">系统在线</span>
             </div>
             <div className="text-[10px] font-mono opacity-30">
                © 2026 LOTTERY SYSTEM
             </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border-b border-red-200 p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-red-700 font-bold">
              <AlertCircle size={18} />
              <span className="text-sm font-mono uppercase tracking-tight">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 text-red-600 transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}

        <div className="flex-1 overflow-hidden p-4">
          <div className="h-full flex flex-col gap-4">
            <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {activeView === 'stats' ? (
            <>
              {/* Left Column: Number Distribution Matrix */}
              <div 
                className="lg:col-span-6 flex flex-col h-full min-h-0"
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
                          className="flex items-center gap-1.5 px-2 py-1 bg-[#141414] text-white text-[10px] font-mono hover:bg-opacity-80 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Copy size={12} />
                          复制数据
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] font-mono opacity-50 uppercase">辅助特码</span>
                      <input 
                        type="text" 
                        placeholder="01-49"
                        value={auxSpecialNumberInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d]/g, '').slice(0, 2);
                          setAuxSpecialNumberInput(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(auxSpecialNumberInput);
                            if (!isNaN(val) && val >= 1 && val <= 49) {
                              setAuxSpecialNumber(val);
                              (e.target as HTMLInputElement).blur();
                            } else if (auxSpecialNumberInput === '') {
                              setAuxSpecialNumber(null);
                              (e.target as HTMLInputElement).blur();
                            }
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(auxSpecialNumberInput);
                          if (!isNaN(val) && val >= 1 && val <= 49) {
                            setAuxSpecialNumber(val);
                          } else if (auxSpecialNumberInput === '') {
                            setAuxSpecialNumber(null);
                          } else {
                            setAuxSpecialNumberInput(auxSpecialNumber ? auxSpecialNumber.toString().padStart(2, '0') : '');
                          }
                        }}
                        className={`w-12 h-6 border-2 border-[#141414] bg-white text-center text-[11px] font-mono font-bold focus:bg-yellow-100 transition-colors uppercase outline-none ${auxSpecialNumber && auxSpecialNumber > 0 ? 'bg-yellow-50' : ''}`}
                      />
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
                          } else if (specialNumberInput === '') {
                            setSpecialNumber(null);
                          } else {
                            setSpecialNumberInput(specialNumber ? specialNumber.toString().padStart(2, '0') : '');
                          }
                        }}
                        className={`w-12 h-6 border-2 border-[#141414] bg-white text-center text-[11px] font-mono font-bold focus:bg-gray-50 transition-colors uppercase outline-none ${specialNumber && specialNumber > 0 ? 'bg-gray-100' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-x-2 gap-y-1 mb-4">
                    {(() => {
                      const rows = 12; 
                      const indices = [];
                      for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < 5; c++) {
                          let num = null;
                          if (c === 4) {
                            // 第5列：49 号置顶 (R1, C5)
                            if (r === 0) num = 49;
                            else num = null;
                          } else {
                            // 第1-4列：每列12个号码，排列 01-48 号
                            num = c * 12 + r + 1;
                            if (num > 48) num = null;
                          }
                          indices.push(num);
                        }
                      }
                      return indices.map((num, idx) => {
                        if (num === null) return <div key={`empty-${idx}`} />;
                        
                        const areaAmount = Object.values(financeBetData).reduce((sum: number, val: number) => sum + val, 0);
                        const amount = financeBetData[num];
                        const textColor = getBallTextColor(num);
                        const isSpecial = specialNumber === num;
                        const isAux = auxSpecialNumber === num;
                        
                        return (
                          <div 
                            key={num}
                            className={`flex items-center gap-1.5 py-1 transition-colors hover:bg-black/5 px-0.5 rounded lottery-table ${isSpecial ? 'bg-gray-300 ring-2 ring-gray-400 font-bold' : ''} ${isAux ? 'bg-yellow-300 ring-2 ring-yellow-400 font-bold' : ''}`}
                          >
                            <div className="flex items-center gap-1 min-w-[42px]">
                              <span className={`text-base font-serif font-bold ${textColor}`}>
                                {num.toString().padStart(2, '0')}
                              </span>
                              <span className={`text-[11pt] font-bold bg-black/5 px-1 rounded-sm ${textColor}`}>
                                {getZodiacByNumber(num)}
                              </span>
                            </div>
                            <div className="w-18 h-6 flex items-center justify-end px-1 border border-gray-200 text-right text-[11pt] font-bold bg-white text-[#141414]">
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
                              {(() => {
                                // Check if any item in this record has >=8 matches with risk numbers
                                const isHighRisk = record.items.some(item => getRiskMatchCount(item.targets) >= 8);
                                return (
                                  <p className={`text-[11px] font-mono break-words mt-0.5 pr-8 leading-tight ${isHighRisk ? 'text-red-600 font-bold' : 'opacity-90'}`}>
                                    {renderHighlightedText(record.raw)}
                                  </p>
                                );
                              })()}

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
              <div 
                className="lg:col-span-3 flex flex-col gap-4 h-full min-h-0"
              >
                {/* Input Section */}
                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Plus size={16} />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest">智能录入系统</h2>
                    </div>
                    <a 
                      href={window.location.origin + window.location.pathname + '?mode=entry'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-bold hover:bg-blue-100 transition-colors"
                      title="打开悬浮录入助手"
                    >
                      🚀 录入助手
                    </a>
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

                {/* Eat-Code Report Section */}
                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Upload size={16} />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest">报单系统</h2>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => alert('功能开发中...')}
                      className="w-full text-[#E4E3E0] py-4 font-mono text-base font-bold hover:bg-opacity-90 transition-all active:translate-y-1 flex items-center justify-center gap-2 bg-[#141414]"
                    >
                      <Upload size={20} />
                      吃码上报
                    </button>
                  </div>
                </section>

                {/* Risk Number Settings Section */}
                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-red-600" />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-red-600">风险拦截系统</h2>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setIsRiskModalOpen(true)}
                      className="w-full text-[#141414] py-4 font-mono text-base font-bold hover:bg-gray-100 transition-all active:translate-y-1 flex items-center justify-center gap-2 border-2 border-[#141414] border-dashed"
                    >
                      <AlertCircle size={20} />
                      今日特别注意号码 (RISK)
                    </button>
                  </div>
                </section>
              </div>

              {/* Right Column: Risk Analysis (Vertical List) */}
              <div 
                className="lg:col-span-3 flex flex-col h-full min-h-0"
              >
                <section className="bg-white border border-[#141414] flex flex-col h-full">
                  <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-100 bg-gray-50/50">
                    <AlertCircle size={12} className="text-red-600" />
                    <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest">风险值预警排名 (由亏到赚)</h2>
                  </div>

                  <div className="flex-1 space-y-0 pr-1">
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
                            className={`py-0 px-1 ${index === 48 ? '' : 'border-b border-gray-100'} flex items-center justify-between transition-colors lottery-table ${item.risk < 0 ? 'bg-red-50/50' : 'bg-emerald-50/50'}`}
                            style={{ height: '17px' }}
                          >
                            <div className="flex items-center gap-1 leading-none">
                              <span className={`text-[11pt] font-mono font-bold w-5 ${textColor}`}>{index + 1}</span>
                              <span className={`text-[11pt] font-mono font-bold w-6 ${textColor}`}>{item.num.toString().padStart(2, '0')}</span>
                              <span className={`text-[11pt] font-bold w-6 h-4 flex items-center justify-center bg-black/5 rounded-sm ${textColor}`}>{zodiac}</span>
                              <span className={`text-[11pt] font-mono font-bold ${textColor}`}>¥{item.amount.toFixed(0)}</span>
                            </div>
                            <div className={`text-[11pt] font-mono font-bold leading-none ${textColor}`}>
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
              <div 
                className="lg:col-span-4 flex flex-col gap-4 h-full min-h-0"
              >
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

              <div 
                className="lg:col-span-8 flex flex-col h-full min-h-0"
              >
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
          </div>
        </div>
      </main>

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
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest pointer-events-none">
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
                    <label className="text-[10px] font-mono font-bold uppercase opacity-60">需识别文字:</label>
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
                    <label className="text-[10px] font-mono font-bold uppercase opacity-60">识别的结果 (RESULT):</label>
                    {modalInputValue.trim() && (
                      <span className="text-xl font-mono font-bold text-blue-600">
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
                    setLastSubmittedModalValue('');
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
                  onClick={triggerClearAndPaste}
                  className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-red-600 whitespace-nowrap"
                >
                  清空数据并粘贴
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1 mt-1">
                <button 
                  onClick={() => handleParse(false, modalInputValue)}
                  disabled={!modalInputValue.trim() || modalInputValue === lastSubmittedModalValue}
                  className="col-span-4 bg-[#141414] hover:bg-[#2a2a2a] text-white border border-[#141414] py-4 text-sm font-bold transition-all active:bg-black flex items-center justify-center gap-2 rounded-none shadow-md disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale disabled:border-gray-400"
                >
                  <Plus size={18} />
                  保存下单 (SAVE)
                </button>
                <button 
                  onClick={() => handleParse(true, modalInputValue)}
                  disabled={!modalInputValue.trim() || modalInputValue === lastSubmittedModalValue}
                  className="col-span-1 bg-red-600 hover:bg-red-700 text-white border border-red-600 py-4 text-xs font-bold transition-all active:bg-red-800 flex items-center justify-center gap-1 rounded-none shadow-md disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale disabled:border-gray-400"
                >
                  <Minus size={14} />
                  扣除
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
              <h3 className="text-xl font-serif italic font-bold mb-4">操作确认</h3>
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

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">开启撤销确认弹窗</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，点击“撤销”按钮时会弹出二次确认框。</p>
                    </div>
                    <button 
                      onClick={() => setTempRequireUndoConfirm(!tempRequireUndoConfirm)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempRequireUndoConfirm ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempRequireUndoConfirm ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">开启撤销并粘贴确认弹窗</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，点击“撤销并粘贴”按钮时会弹出二次确认框。</p>
                    </div>
                    <button 
                      onClick={() => setTempRequireUndoPasteConfirm(!tempRequireUndoPasteConfirm)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempRequireUndoPasteConfirm ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempRequireUndoPasteConfirm ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block">软件分辨率</label>
                  <p className="text-[10px] font-mono opacity-60">当前分辨率已锁定为 <span className="font-bold text-[#141414]">1620 x 930</span>，不支持手动修改。</p>
                </div>

                <button 
                  onClick={() => {
                    // Only apply changes on Save
                    setOdds(tempOdds);
                    setRebate(tempRebate);
                    setEnableSearchUndo(tempEnableSearchUndo);
                    setRequireUndoConfirm(tempRequireUndoConfirm);
                    setRequireUndoPasteConfirm(tempRequireUndoPasteConfirm);
                    localStorage.setItem('odds', tempOdds.toString());
                    localStorage.setItem('rebate', tempRebate.toString());
                    localStorage.setItem('enableSearchUndo', tempEnableSearchUndo.toString());
                    localStorage.setItem('requireUndoConfirm', tempRequireUndoConfirm.toString());
                    localStorage.setItem('requireUndoPasteConfirm', tempRequireUndoPasteConfirm.toString());
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
                  onClick={() => handleReset(false)}
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

      {/* Risk Modal */}
      <AnimatePresence>
        {isRiskModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRiskModalOpen(false)}
              className="absolute inset-0 bg-[#141414]/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-[#F2F1ED] border-4 border-[#141414] p-6 shadow-[8px_8px_0_0_#141414]"
            >
              <div className="flex justify-between items-center mb-6 border-b-2 border-[#141414] pb-2">
                <h3 className="text-xl font-serif italic font-bold">今日风险号码设定</h3>
                <button onClick={() => setIsRiskModalOpen(false)}>
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {riskNumbers.map((val, i) => (
                  <input
                    key={i}
                    ref={el => riskInputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    value={val}
                    onChange={(e) => {
                      handleRiskInputChange(i, e.target.value);
                    }}
                    onKeyDown={(e) => handleRiskKeyDown(i, e)}
                    onPaste={(e) => handleRiskPaste(i, e)}
                    placeholder="--"
                    className="w-full h-12 border-2 border-[#141414] bg-white text-center text-xl font-mono font-bold focus:bg-yellow-100 transition-colors"
                  />
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button 
                  onClick={() => setIsRiskModalOpen(false)}
                  className="w-full bg-[#141414] text-white py-3 font-mono font-bold hover:bg-opacity-90 active:translate-y-1"
                >
                  确认保存 (CONFIRM)
                </button>
                <button 
                  onClick={() => setRiskNumbers(Array(15).fill(''))}
                  className="w-full border-2 border-[#141414] py-2 font-mono font-bold hover:bg-gray-100 transition-all text-[#141414]"
                >
                  重置清空 (CLEAR)
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

                    const isHighRisk = record.items.some(item => getRiskMatchCount(item.targets) >= 8);

                    return (
                      <div key={record.id} className={`group border-b border-dashed border-[#141414] border-opacity-20 pb-2 relative overflow-hidden bg-white/50 p-2 rounded lottery-table ${isHighRisk ? 'ring-2 ring-red-500 ring-inset' : ''}`}>
                        <div className="flex justify-between items-start">
                          <span className="text-[11pt] opacity-60">{record.time}</span>
                          <div className="flex items-center gap-2">
                            {winningAmount > 0 && (
                              <span className="text-[11pt] font-bold bg-yellow-400 px-1 rounded">中金: ¥{winningAmount}</span>
                            )}
                            <span className={`text-[11pt] font-bold ${record.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
                        <p className={`text-[11pt] font-serif font-bold mt-1 uppercase ${isHighRisk ? 'text-red-600' : ''}`}>{renderHighlightedText(record.fullRaw || record.raw)}</p>
                        {record.parsedPreview && (
                          <div className={`mt-1 p-1 bg-gray-50 text-[11pt] font-serif font-bold whitespace-pre-wrap border-l-2 border-gray-200 uppercase ${isHighRisk ? 'text-red-600 border-red-500' : 'opacity-60'}`}>
                            {renderHighlightedText(record.parsedPreview)}
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
