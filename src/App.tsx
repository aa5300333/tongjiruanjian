/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback, useDeferredValue, useTransition } from 'react';
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
  ChevronRight,
  Trash2,
  ExternalLink,
  CornerUpLeft,
  User,
  UserPlus,
  Percent,
  LogOut,
  ChevronDown,
  ChevronUp,
  Menu,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import XLSX from 'xlsx-js-style';
import { parseInput, ZODIAC_LIST, getNumbersByZodiac, finalCleanText } from './utils/lotteryParser';
import { performGeminiOcr } from './utils/geminiOcr';
import defaultConfig from '../public/配置文件.json';

interface BetItem {
  targets: number[];
  amount: number;
  raw: string;
  system?: 'HK' | 'MO';
  isSplitAmount?: boolean;
}

interface BetRecord {
  id: string;
  time: string;
  timestamp: number;
  raw: string;
  fullRaw: string;
  parsedPreview?: string;
  items: BetItem[];
  totalAmount: number;
  subTotals?: Record<'HK' | 'MO', number>;
  rebate: number;
  customerId?: string;
  customerName?: string;
  system?: 'HK' | 'MO';
}

declare global {
  interface Window {
    electron?: {
      send: (channel: string, data?: any) => void;
      on: (channel: string, func: (...args: any[]) => void) => () => void;
      showEntryWindow: (type?: string) => void;
      hideEntryWindow: () => void;
      showSettingsWindow: () => void;
      hideSettingsWindow: () => void;
      notifySettingsUpdated: () => void;
      submitEntry: (data: any) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export default function App() {
  const [systemType, setSystemType] = useState<'HK' | 'MO'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('current_lottery_system') as 'HK' | 'MO') || 'MO';
    }
    return 'MO';
  });

  const getSysKey = useCallback((key: string) => {
    // Customers, coefficients and global settings are shared between systems
    const sharedKeys = [
      'local_customers', 'enableSearchUndo', 'requireUndoConfirm', 
      'autoPasteEnabled', 'followCustomerRisk',
      'enableCustomerEatingReport', 'smartSystemRecognition',
      'auxSpecialNumber', 'specialNumber', 'auxSpecialNumberInput', 'specialNumberInput',
      'riskNumbers', 'LOTTERY_EXTERNAL_SUBMIT', 'LOTTERY_UNDO_REQUEST', 'LOTTERY_RESET_REQUEST'
    ];
    if (sharedKeys.some(sk => key.includes(sk)) || key.startsWith('coefficient_')) {
      return key; 
    }
    // Force explicit prefix for both systems
    return systemType === 'MO' ? `MO_${key}` : `HK_${key}`;
  }, [systemType]);

  const [standaloneIsDragging, setStandaloneIsDragging] = useState(false);
  const [activeView, setActiveView] = useState<'stats' | 'compound' | 'eating'>(() => {
    if (typeof window !== 'undefined') {
       return (localStorage.getItem('last_active_view') as any) || 'stats';
    }
    return 'stats';
  });

  useEffect(() => {
    localStorage.setItem('last_active_view', activeView);
  }, [activeView]);

  const [isSwitchingSystem, setIsSwitchingSystem] = useState(false);
  const [isTransitioning, startTransition] = useTransition();

  // 1. 优化系统切换逻辑：减少级联更新
  const switchSystem = useCallback((newSystem: 'HK' | 'MO') => {
    if (newSystem === systemType || isSwitchingSystem) return;
    
    setIsSwitchingSystem(true);
    // 使用 requestAnimationFrame 确保 UI 先响应切换中的状态
    requestAnimationFrame(() => {
      startTransition(() => {
        setSystemType(newSystem);
        localStorage.setItem('current_lottery_system', newSystem);
        localStorage.setItem('last_active_view', activeView);
        
        const oddsKey = newSystem === 'MO' ? 'MO_odds' : 'odds';
        const rebateKey = newSystem === 'MO' ? 'MO_rebate' : 'rebate';
        
        const savedOdds = localStorage.getItem(oddsKey);
        setOdds(savedOdds ? parseFloat(savedOdds) : (defaultConfig.default_odds || 47));
        
        const savedRebate = localStorage.getItem(rebateKey);
        setRebate(savedRebate ? parseFloat(savedRebate) : (defaultConfig.default_rebate || 4));
        
        setIsSwitchingSystem(false);
      });
    });
  }, [systemType, activeView, isSwitchingSystem]);



  const [standaloneMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'entry';
    }
    return false;
  });

  const [settingsMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      // 同时兼容 mode=settings 和 settings=true
      return params.get('mode') === 'settings' || params.get('settings') === 'true';
    }
    return false;
  });

  const processedIdsRef = useRef<Set<string>>(new Set());
  const lastProcessedRef = useRef<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create a ref for handleParse and handleUndo to prevent stale closures in event listeners
  const handleParseRef = useRef<any>();
  const handleUndoRef = useRef<any>();
  
  const [financeBetData, setFinanceBetData] = useState<Record<number, number>>(() => {
    const key = getSysKey('financeBetData');
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
  });
  // Add state for scaled bet data in summary mode
  const [scaledBetData, setScaledBetData] = useState<Record<number, number>>({});
  const [financeRecords, setFinanceRecords] = useState<BetRecord[]>(() => {
    const key = getSysKey('financeRecords');
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });
  const [compoundRecords, setCompoundRecords] = useState<BetRecord[]>(() => {
    const key = getSysKey('compoundRecords');
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });
  const [inputValue, setInputValue] = useState('');
  const [modalInputValue, setModalInputValue] = useState(() => {
    if (typeof window !== 'undefined') {
      const key = getSysKey('modalInputValue');
      return localStorage.getItem(key) || '';
    }
    return '';
  });
  const [textareaKey, setTextareaKey] = useState(0);
  const [clearConfirmActive, setClearConfirmActive] = useState(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 独立模式下的聚焦保障：在挂载或 Key 发生变化时强制请求焦点
  useEffect(() => {
    if (standaloneMode) {
      const timer = setTimeout(() => {
        if (standaloneInputRef.current) {
          window.focus();
          standaloneInputRef.current.focus();
          const len = standaloneInputRef.current.value.length;
          standaloneInputRef.current.setSelectionRange(len, len);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [standaloneMode, textareaKey]);

  const [isModalOpen, setIsModalOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'entry';
    }
    return false;
  });

  const [localModalValue, setLocalModalValue] = useState(modalInputValue);

  useEffect(() => {
    if (isModalOpen) {
      setLocalModalValue(modalInputValue);
    }
  }, [isModalOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setModalInputValue(localModalValue);
    }, 150);
    return () => clearTimeout(timer);
  }, [localModalValue]);

  const deferredModalInputValue = useDeferredValue(modalInputValue);
  const [lastSubmittedModalValue, setLastSubmittedModalValue] = useState('');
  const lastClipboardContent = useRef<string>('');

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const processImageFile = async (file: File) => {
    if (ocrEngine === 'gemini') {
      try {
        setOcrLoading(true);
        setOcrProgress('正在通过 Google Gemini 智慧大模型极速处理图片中...');
        const detectedText = await performGeminiOcr(file, geminiApiKey, geminiModel || 'gemini-2.5-flash');
        if (detectedText) {
          const cleanedText = finalCleanText(detectedText);
          const newVal = modalInputValue ? modalInputValue + '\n' + cleanedText : cleanedText;
          setModalInputValue(newVal);
          setLocalModalValue(newVal);
        } else {
          alert('未能从图片中解析出任何满足规则的文本，请确认图片清晰。');
        }
      } catch (err: any) {
        console.error(err);
        alert('大模型 OCR 识别错误: ' + err.message);
      } finally {
        setOcrLoading(false);
        setOcrProgress('');
      }
      return;
    }

    const electron = window.electron as any;
    if (!electron || !electron.performOfflineOcr) {
      alert('检测到您在非客户端（浏览器）环境运行，并且未开启 Gemini 智能大模型识别，无法拉起本地 PaddleOCR-json.exe 后端服务！');
      return;
    }
    try {
      setOcrLoading(true);
      setOcrProgress('正在通过本地 PaddleOCR-json 后台进程极速识别中...');
      const base64 = await fileToBase64(file);
      const res = await electron.performOfflineOcr(base64);
      if (res && res.success) {
        if (res.text) {
          const cleanedText = finalCleanText(res.text);
          const newVal = modalInputValue ? modalInputValue + '\n' + cleanedText : cleanedText;
          setModalInputValue(newVal);
          setLocalModalValue(newVal);
        } else {
          alert('未能从图片中解析出任何满足规则的文本，请确认图片清晰。');
        }
      } else {
        alert('离线 OCR 识别错误: ' + (res?.error || '请确认 bin/ 货 big/ 下存在 PaddleOCR-json.exe 且已正常加载。'));
      }
    } catch (err: any) {
      console.error(err);
      alert('图片处理失败: ' + err.message);
    } finally {
      setOcrLoading(false);
      setOcrProgress('');
    }
  };

  const [autoPasteEnabled, setAutoPasteEnabled] = useState<boolean>(() => {
    const key = getSysKey('autoPasteEnabled');
    const saved = localStorage.getItem(key);
    return saved === null ? true : saved === 'true'; // Default ON
  });

  // 监听剪贴板自动同步 (增强：支持浏览器模式下的聚焦自动粘贴)
  useEffect(() => {
    if (!standaloneMode) return;

    if (window.electron) {
      console.log('App: 启动剪贴板同步监听 (Electron)');
      const removeListener = window.electron.on('clipboard-data', (text: string) => {
        if (!autoPasteEnabled) return;
        // 仅在物理内容更新时触发同步
        if (text === lastClipboardContent.current) return;
        lastClipboardContent.current = text;
        const cleanedText = finalCleanText(text);
        setModalInputValue(cleanedText);
        setLocalModalValue(cleanedText);
      });
      return () => {
        if (removeListener) removeListener();
      };
    } else {
      // 浏览器环境：在窗口获得焦点时尝试自动读取剪贴板
      const handleWindowFocus = async () => {
        if (!autoPasteEnabled) return;
        
        try {
          // 只有在输入框为空或者是上一次提交的内容时，才允许自动粘贴覆盖
          const isInputSafeToOverwrite = modalInputValue.trim() === '' || modalInputValue === lastSubmittedModalValue;
          
          if (isInputSafeToOverwrite && navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            // 只有当剪贴板内容与上一次成功同步的内容不同时，才触发更新
            if (text && text.trim() && text !== lastClipboardContent.current) {
              lastClipboardContent.current = text;
              const cleanedText = finalCleanText(text);
              setModalInputValue(cleanedText);
              setLocalModalValue(cleanedText);
              console.log('App: 检测到剪贴板物理更新，自动同步成功');
            }
          }
        } catch (err) {
          console.debug('App: 自动粘贴权限受限');
        }
      };

      window.addEventListener('focus', handleWindowFocus);
      handleWindowFocus();
      
      return () => {
        window.removeEventListener('focus', handleWindowFocus);
      };
    }
  }, [standaloneMode, autoPasteEnabled, modalInputValue, lastSubmittedModalValue]);

  // Initial window size for compact mode
  useEffect(() => {
    if (window.electron && !standaloneMode) {
      const saved = localStorage.getItem('isCompactMode');
      if (saved === 'true') {
        window.electron.send('resize-main-window', { width: 850, height: 956 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isCompactMode, setIsCompactMode] = useState(() => {
    const saved = localStorage.getItem('isCompactMode');
    return saved === 'true';
  });

  useEffect(() => {
    if (window.electron) {
      const removeSettingsListener = window.electron.on('settings-updated-trigger', () => {
        console.log('检测到全局设置更新，正在刷新主进程状态...');
        // Refresh local state from localStorage
        const oddsKey = systemType === 'MO' ? 'MO_odds' : 'odds';
        const rebateKey = systemType === 'MO' ? 'MO_rebate' : 'rebate';
        
        const savedOdds = localStorage.getItem(oddsKey);
        const savedRebate = localStorage.getItem(rebateKey);
        const savedFollowRisk = localStorage.getItem('followCustomerRisk');
        const savedEatingReport = localStorage.getItem('enableCustomerEatingReport');
        
        if (savedOdds) setOdds(parseFloat(savedOdds || (systemType === 'MO' ? '48.5' : '48.5')));
        if (savedRebate) setRebate(parseFloat(savedRebate || '10'));
        if (savedFollowRisk) setFollowCustomerRisk(savedFollowRisk === 'true');
        if (savedEatingReport) setEnableCustomerEatingReport(savedEatingReport === 'true');
        
        // 强制刷新其他非敏感设置
        ['enableSearchUndo', 'smartSystemRecognition', 'requireUndoConfirm', 'autoPasteEnabled', 'isCompactMode'].forEach(k => {
          const v = localStorage.getItem(k);
          if (v !== null) {
            const bv = v === 'true';
            if (k === 'enableSearchUndo') setEnableSearchUndo(bv);
            if (k === 'smartSystemRecognition') setSmartSystemRecognition(bv);
            if (k === 'requireUndoConfirm') setRequireUndoConfirm(bv);
            if (k === 'autoPasteEnabled') setAutoPasteEnabled(bv);
            if (k === 'isCompactMode') setIsCompactMode(bv);
          }
        });
      });
      return () => {
        if (removeSettingsListener) removeSettingsListener();
      };
    }
  }, [systemType]);

  const [customWidth, setCustomWidth] = useState(() => {
    const saved = localStorage.getItem('customWidth');
    return saved ? parseInt(saved) : (isCompactMode ? 730 : 1420);
  });

  const [customHeight, setCustomHeight] = useState(() => {
    const saved = localStorage.getItem('customHeight');
    return saved ? parseInt(saved) : (isCompactMode ? 658 : 903);
  });

  // Toggle compact mode
  const toggleCompactMode = () => {
    const newValue = !isCompactMode;
    setIsCompactMode(newValue);
    localStorage.setItem('isCompactMode', newValue.toString());
    
    // Auto adjust resolution when toggling preset modes
    const newW = newValue ? 730 : 1420;
    const newH = newValue ? 658 : 903;
    setCustomWidth(newW);
    setCustomHeight(newH);
    localStorage.setItem('customWidth', newW.toString());
    localStorage.setItem('customHeight', newH.toString());

    // Resize Electron window if applicable
    if (window.electron) {
      window.electron.send('resize-main-window', { width: newW, height: newH });
    }
  };

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [eatingHistory, setEatingHistory] = useState<{ id: string, time: string, threshold: number, totalEaten: number, distribution: Record<number, number> }[]>(() => {
    const key = getSysKey('eatingHistory');
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });
  const [eatingPage, setEatingPage] = useState(1);
  const EATING_PER_PAGE = 5;
  const [error, setError] = useState<string | null>(null);
  const [confirmingUndoId, setConfirmingUndoId] = useState<string | null>(null);
  const [confirmingEatingUndoId, setConfirmingEatingUndoId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);

  const handleClearBusinessData = useCallback(() => {
    // Definitive list of prefixes to clear business data from
    const prefixes = ['', 'HK_', 'MO_'];
    const businessKeys = [
      'financeBetData',
      'financeRecords',
      'compoundRecords',
      'eatingHistory',
      'eatenAmounts',
      'modalInputValue',
      'drawNumbers',
      'specialNumber',
      'auxSpecialNumber',
      'riskNumbers'
    ];

    // Iterate once and remove only matching keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Pattern matching for business data
        const isBusinessKey = businessKeys.some(bk => prefixes.some(p => key === `${p}${bk}`));
        const isCustomerState = key.includes('customer_state_');
        
        // Ensure shared local_customers is NOT removed
        if (key === 'local_customers') continue;

        if (isBusinessKey || isCustomerState) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Refresh to re-initialize
    window.location.reload();
  }, []);

  const [undoModalFocus, setUndoModalFocus] = useState<'confirm' | 'cancel'>('cancel');
  const [showLastUndoConfirm, setShowLastUndoConfirm] = useState(false);
  const [undoCallback, setUndoCallback] = useState<{ fn: () => void, label: string } | null>(null);
  const [enableSearchUndo, setEnableSearchUndo] = useState<boolean>(() => {
    const key = getSysKey('enableSearchUndo');
    const saved = localStorage.getItem(key);
    return saved === null ? false : saved === 'true'; // Default OFF
  });
  const [smartSystemRecognition, setSmartSystemRecognition] = useState<boolean>(() => {
    const key = getSysKey('smartSystemRecognition');
    const saved = localStorage.getItem(key);
    return saved === null ? true : saved === 'true'; // Default ON
  });
  const [requireUndoConfirm, setRequireUndoConfirm] = useState<boolean>(() => {
    const key = getSysKey('requireUndoConfirm');
    const saved = localStorage.getItem(key);
    return saved === null ? true : saved === 'true'; // Default ON
  });
  const [followCustomerRisk, setFollowCustomerRisk] = useState<boolean>(() => {
    const key = getSysKey('followCustomerRisk');
    const saved = localStorage.getItem(key);
    return saved === 'true'; // Default OFF
  });
  const [enableCustomerEatingReport, setEnableCustomerEatingReport] = useState<boolean>(() => {
    const key = getSysKey('enableCustomerEatingReport');
    const saved = localStorage.getItem(key);
    return saved === 'true'; // Default OFF
  });

  // Local Customer Management State
  const [customers, setCustomers] = useState<{id: string, name: string, createdAt: string}[]>(() => {
    const key = 'local_customers';
    const saved = localStorage.getItem(key);
    const initial = saved ? JSON.parse(saved) : [{ id: 'default', name: '汇总', createdAt: new Date().toISOString() }];
    // Ensure default name is '汇总' for summary feature
    return initial.map((c: any) => c.id === 'default' ? { ...c, name: '汇总' } : c);
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    const key = getSysKey('selectedCustomerId');
    return localStorage.getItem(key) || 'default';
  });

  const displayBetData = useMemo(() => {
    if (selectedCustomerId === 'default') {
      // 在汇总模式下，强制使用缩放后的数据。如果缩放数据尚未就绪，则回退到 49 个 0，防止短暂闪烁原始未缩放总额。
      if (!scaledBetData || Object.keys(scaledBetData).length < 49) {
        return Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
      }
      return scaledBetData;
    }
    return financeBetData;
  }, [selectedCustomerId, scaledBetData, financeBetData]);

  const [popOutTargetId, setPopOutTargetId] = useState<string>(() => {
    const lastId = localStorage.getItem('last_recorded_customer_id');
    const firstReal = customers.find(c => c.id !== 'default');
    if (selectedCustomerId !== 'default') return selectedCustomerId;
    if (lastId && customers.some(c => c.id === lastId)) return lastId;
    return firstReal ? firstReal.id : 'default';
  });

  // Keep popOutTargetId in sync with selected customer if switching away from summary
  useEffect(() => {
    if (selectedCustomerId !== 'default') {
      setPopOutTargetId(selectedCustomerId);
    } else {
      // On summary page, if current popOutTargetId is default or gone, reset to first real
      if (popOutTargetId === 'default' || !customers.some(c => c.id === popOutTargetId)) {
        const firstReal = customers.find(c => c.id !== 'default');
        if (firstReal) setPopOutTargetId(firstReal.id);
      }
    }
  }, [selectedCustomerId, customers]);

  // Sync popOutTargetId with selectedCustomerId when not in standalone mode
  useEffect(() => {
    if (!standaloneMode) {
      if (selectedCustomerId !== 'default') {
        setPopOutTargetId(selectedCustomerId);
      } else {
        // If on summary page, use the last recorded customer or the first real one
        const lastId = localStorage.getItem('last_recorded_customer_id');
        if (popOutTargetId === 'default' || !customers.some(c => c.id === popOutTargetId)) {
          if (lastId && customers.some(c => c.id === lastId)) {
            setPopOutTargetId(lastId);
          } else {
            const firstReal = customers.find(c => c.id !== 'default');
            if (firstReal) setPopOutTargetId(firstReal.id);
          }
        }
      }
    }
  }, [selectedCustomerId, standaloneMode, customers, popOutTargetId]);
  // Sync customers and coefficients across windows (for standalone pop-out)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      const custKey = 'local_customers';
      if (e.key === custKey && e.newValue) {
        const updated = JSON.parse(e.newValue);
        setCustomers(updated.map((c: any) => c.id === 'default' ? { ...c, name: '汇总' } : c));
      }
      
      if (e.key && e.key === `coefficient_${selectedCustomerId}`) {
        if (e.newValue) {
          setCurrentCoefficient(parseFloat(e.newValue));
        }
      }
      
      // Also refresh summary if any coefficient changes
      if (e.key && e.key.startsWith('coefficient_') && selectedCustomerId === 'default') {
        setCustomers(prev => [...prev]); // Trigger re-render of Summary
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [systemType, selectedCustomerId, getSysKey]);

  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [formulaTargetId, setFormulaTargetId] = useState('default');
  const [tempCoefficient, setTempCoefficient] = useState('1.0');
  const [currentCoefficient, setCurrentCoefficient] = useState(1.0);

  // Sync current coefficient when customer changes
  useEffect(() => {
    if (selectedCustomerId === 'default') {
      setCurrentCoefficient(1.0);
    } else {
      const key = `coefficient_${selectedCustomerId}`;
      const saved = localStorage.getItem(key);
      setCurrentCoefficient(saved ? parseFloat(saved) : 1.0);
    }
  }, [selectedCustomerId]);

  const handleSaveFormulaCoefficient = () => {
    let val = parseInt(tempCoefficient);
    if (isNaN(val)) val = 100;
    val = Math.max(1, Math.min(100, val));
    const decimalVal = val / 100;
    localStorage.setItem(`coefficient_${formulaTargetId}`, decimalVal.toFixed(2));
    setRefreshCounter(prev => prev + 1);
    setIsFormulaModalOpen(false);
    
    if (formulaTargetId === selectedCustomerId) {
      setCurrentCoefficient(decimalVal);
    }
    
    if (selectedCustomerId === 'default') {
      setCustomers([...customers]);
    }
  };

  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerCoefficient, setNewCustomerCoefficient] = useState('100');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Detector for system changes to ensure logic follows the right path
  const lastCustomerIdRef = useRef(selectedCustomerId);
  const isSwitchingRef = useRef(false);

  const splitBySystem = useCallback((input: string): { system: 'HK' | 'MO', text: string }[] => {
    if (!input || !input.trim()) return [];

    // If smart recognition is OFF, always default to MO
    if (!smartSystemRecognition) {
      return [{ system: 'MO', text: input }];
    }

    const moKeywords = ['新澳门', '澳门', '澳門', '新澳', '澳码', '澳馬', '澳', '门', '奥', '新'];
    const hkKeywords = ['香港', '港碼', '港马', '港码', '港', '香'];
    const allKeywords = [...moKeywords, ...hkKeywords].sort((a, b) => b.length - a.length);

    // 1. 统计总体出现情况
    const hasMo = moKeywords.some(kw => input.includes(kw));
    const hasHk = hkKeywords.some(kw => input.includes(kw));

    // Logic D: 无系统词判断 -> 默认归属于澳门
    if (!hasMo && !hasHk) return [{ system: 'MO', text: input }];

    // 2. 收集所有系统词及其位置
    let occurrences: { type: 'HK' | 'MO', index: number, length: number }[] = [];
    allKeywords.forEach(kw => {
      let pos = input.indexOf(kw);
      while (pos !== -1) {
        occurrences.push({
          type: hkKeywords.includes(kw) ? 'HK' : 'MO',
          index: pos,
          length: kw.length
        });
        pos = input.indexOf(kw, pos + 1);
      }
    });

    // 排序并重叠过滤
    occurrences.sort((a, b) => a.index - b.index);
    const filteredOccs: typeof occurrences = [];
    let lastEndPos = -1;
    occurrences.forEach(occ => {
      if (occ.index >= lastEndPos) {
        filteredOccs.push(occ);
        lastEndPos = occ.index + occ.length;
      }
    });

    // 3. 解析与分配算法 (基于锚点位置)
    const result: { system: 'HK' | 'MO', text: string }[] = [];
    
    // 检查最后一段是否有数据（用于判定中间段落的后缀申索）
    const lastOcc = filteredOccs[filteredOccs.length - 1];
    const rawTextAfterLast = input.substring(lastOcc.index + lastOcc.length).trim();
    const hasDataAfterLast = rawTextAfterLast.length > 0;

    // 我们可以通过遍历所有可能的“内容区间”来决定归属
    // A: 两个词之间
    // B: 第一个词之前
    // C: 最后一个词之后
    for (let i = 0; i <= filteredOccs.length; i++) {
      const prevOcc = i > 0 ? filteredOccs[i - 1] : null;
      const nextOcc = i < filteredOccs.length ? filteredOccs[i] : null;

      const start = prevOcc ? (prevOcc.index + prevOcc.length) : 0;
      const end = nextOcc ? nextOcc.index : input.length;
      const chunk = input.substring(start, end).trim();

      if (!chunk) continue;

      let assigned: 'HK' | 'MO' = 'MO';

      if (!prevOcc && nextOcc) {
        // --- 情况 1：首段内容（第一个词之前） ---
        // Logic B: 此段落后方有系统词且前方无词 -> 归属于该词 (后缀判定)
        assigned = nextOcc.type;
      } else if (prevOcc && !nextOcc) {
        // --- 情况 2：末段内容（最后一个词之后） ---
        // Logic A: 此段落前方有系统词且后方无词 -> 归属于该词 (前缀判定)
        assigned = prevOcc.type;
      } else if (prevOcc && nextOcc) {
        // --- 情况 3：两个系统词中间的内容 (Logic C) ---
        // 核心规则：默认归属于前一个词（Logic A）
        // 特殊修正：若后一个词是最后一个词，且全文末尾无数据 -> 归属于后一个词 (Logic C 后缀判定)
        const isNextOccTheLastOne = (i === filteredOccs.length - 1);
        if (isNextOccTheLastOne && !hasDataAfterLast) {
          assigned = nextOcc.type;
        } else {
          assigned = prevOcc.type;
        }
      }

      // 合并同系统结果
      if (result.length > 0 && result[result.length - 1].system === assigned) {
        result[result.length - 1].text += ' ' + chunk;
      } else {
        result.push({ system: assigned, text: chunk });
      }
    }

    return result.length > 0 ? result : [{ system: 'MO', text: input }];
  }, [smartSystemRecognition]);

  const [odds, setOdds] = useState<number>(() => {
    const key = getSysKey('odds');
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseFloat(saved);
      return isNaN(parsed) ? (defaultConfig.default_odds || 47) : parsed;
    }
    return defaultConfig.default_odds || 47;
  });
  const [rebate, setRebate] = useState<number>(() => {
    const key = getSysKey('rebate');
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseFloat(saved);
      return isNaN(parsed) ? (defaultConfig.default_rebate || 4) : parsed;
    }
    return defaultConfig.default_rebate || 4;
  });
  const [ocrEngine, setOcrEngine] = useState<'paddle' | 'gemini'>(() => {
    return (localStorage.getItem('ocr_engine') as 'paddle' | 'gemini') || 'paddle';
  });
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
  });

  const [tempOcrEngine, setTempOcrEngine] = useState<'paddle' | 'gemini'>(ocrEngine);
  const [tempGeminiApiKey, setTempGeminiApiKey] = useState<string>(geminiApiKey);
  const [tempGeminiModel, setTempGeminiModel] = useState<string>(geminiModel);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempOdds, setTempOdds] = useState(odds);
  const [tempRebate, setTempRebate] = useState(rebate);
  const [tempEnableSearchUndo, setTempEnableSearchUndo] = useState(enableSearchUndo);
  const [tempSmartSystemRecognition, setTempSmartSystemRecognition] = useState(smartSystemRecognition);
  const [tempRequireUndoConfirm, setTempRequireUndoConfirm] = useState(requireUndoConfirm);
  const [tempAutoPasteEnabled, setTempAutoPasteEnabled] = useState(autoPasteEnabled);
  const [tempFollowCustomerRisk, setTempFollowCustomerRisk] = useState(followCustomerRisk);
  const [tempEnableCustomerEatingReport, setTempEnableCustomerEatingReport] = useState(enableCustomerEatingReport);
  const [tempCompactMode, setTempCompactMode] = useState(isCompactMode);
  const [tempWidth, setTempWidth] = useState(customWidth);
  const [tempHeight, setTempHeight] = useState(customHeight);

  // Initialize temp states when settings opens
  useEffect(() => {
    if (isSettingsOpen) {
      setTempOdds(odds);
      setTempRebate(rebate);
      setTempEnableSearchUndo(enableSearchUndo);
      setTempSmartSystemRecognition(smartSystemRecognition);
      setTempRequireUndoConfirm(requireUndoConfirm);
      setTempAutoPasteEnabled(autoPasteEnabled);
      setTempFollowCustomerRisk(followCustomerRisk);
      setTempEnableCustomerEatingReport(enableCustomerEatingReport);
      setTempCompactMode(isCompactMode);
      setTempWidth(customWidth);
      setTempHeight(customHeight);
      setTempOcrEngine(ocrEngine);
      setTempGeminiApiKey(geminiApiKey);
      setTempGeminiModel(geminiModel);
    }
  }, [isSettingsOpen, odds, rebate, enableSearchUndo, smartSystemRecognition, requireUndoConfirm, autoPasteEnabled, followCustomerRisk, enableCustomerEatingReport, isCompactMode, customWidth, customHeight, ocrEngine, geminiApiKey, geminiModel]);

  // Reset modal focus when it opens
  useEffect(() => {
    if (showLastUndoConfirm) {
      setUndoModalFocus('cancel');
    }
  }, [showLastUndoConfirm]);

  // Handle keyboard navigation for Undo Confirm Modal
  useEffect(() => {
    if (!showLastUndoConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('handleKeyDown triggered', e.key, showLastUndoConfirm);
      if (!showLastUndoConfirm) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setUndoModalFocus(prev => prev === 'confirm' ? 'cancel' : 'confirm');
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (undoModalFocus === 'confirm') {
          undoCallback?.fn();
        }
        setShowLastUndoConfirm(false);
        setUndoCallback(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowLastUndoConfirm(false);
        setUndoCallback(null);
      }
    };

    /*
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
    */
    return undefined;
  }, [showLastUndoConfirm, undoModalFocus, undoCallback]);

  const [eatenAmounts, setEatenAmounts] = useState<Record<number, number>>(() => {
    const key = getSysKey('eatenAmounts');
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
  });
  const [eatingThreshold, setEatingThreshold] = useState<number>(() => {
    const key = getSysKey('eatingThreshold');
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved) : 50000;
  });

  const [eatingMode, setEatingMode] = useState<'threshold' | 'percentage'>('threshold');
  const [eatingPercentage, setEatingPercentage] = useState<number>(70);

  const summaryMatrixData = useMemo(() => {
    return displayBetData;
  }, [displayBetData]);

  useEffect(() => {
    localStorage.setItem(getSysKey('eatingThreshold'), eatingThreshold.toString());
  }, [eatingThreshold, getSysKey]);

  // Refined iterative solver for Reporting (Preview Reported Data)
  const previewReportedData = useMemo(() => {
    if (eatingMode === 'percentage') {
      const reportRatio = (100 - eatingPercentage) / 100;
      return Object.fromEntries(
        Array.from({ length: 49 }, (_, i) => {
          const num = i + 1;
          const total = displayBetData[num] || 0;
          const currentEaten = eatenAmounts[num] || 0;
          const currentField = Math.max(0, total - currentEaten);
          // 百分比吃码计算四舍五入的应该是新上报的部分 (suggestedNewReport)
          const suggestedNewReport = Math.round(currentField * reportRatio);
          // 确保 汇总数(Kept) = 总额 - 上报额 这一逻辑链条在此时就固定，避免双重舍入误差
          return [num, currentEaten + suggestedNewReport];
        })
      );
    }

    // 1. Initial kept bets = Current Field Bets (Total - Already Eaten)
    // "要在已上报实地风险进行计算" - This means the solver starts from the current situation
    let currentKept: Record<number, number> = {};
    for (let i = 1; i <= 49; i++) {
      currentKept[i] = Math.max(0, (displayBetData[i] || 0) - (eatenAmounts[i] || 0));
    }

    const r = 1 - rebate / 100; // (1 - R_avg)
    const M = eatingThreshold;
    const O = odds;

    if (O <= 0) return Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));

    // 2. Loop until no changes
    let iterations = 0;
    while (iterations < 1000) { // Safety circuit breaker
      let changed = false;
      
      // Calculate current NetIncome (Sum of each kept bet * (1 - rebate))
      const totalKeptGross = (Object.values(currentKept) as number[]).reduce((s, v) => s + v, 0);
      const netIncome = Math.round(totalKeptGross * r);

      for (let i = 1; i <= 49; i++) {
        // Limit[i] = Math.round((NetIncome + M) / Odds)
        const limit = Math.round((netIncome + M) / O);
        const val = currentKept[i] || 0;
        
        // If current Field Bet[i] > Limit[i]
        if (val > limit) { 
          // Update to rounded Limit[i]
          currentKept[i] = limit;
          // Mark as changed and restart loop (as NetIncome decreased)
          changed = true;
          break; 
        }
      }
      
      if (!changed) break;
      iterations++;
    }

    // 3. Total suggested reported amount = original total - final remaining field
    return Object.fromEntries(
      Array.from({ length: 49 }, (_, i) => {
        const num = i + 1;
        const origin = displayBetData[num] || 0;
        const kept = Math.round(currentKept[num] || 0);
        return [num, Math.max(0, origin - kept)];
      })
    );
  }, [displayBetData, rebate, eatingThreshold, odds, eatenAmounts, eatingMode, eatingPercentage]);

  // For UI display, we still calculate a "theoretical limit X" based on the final pool
  const eatingLimitX = useMemo(() => {
    const totalKept = (Object.values(displayBetData) as number[]).reduce((sum, val, idx) => {
      const reported = (previewReportedData[idx + 1] as number) || 0;
      return sum + (val - reported);
    }, 0);
    const netIncome = totalKept * (1 - rebate / 100);
    return Math.round((netIncome + eatingThreshold) / odds);
  }, [displayBetData, previewReportedData, rebate, eatingThreshold, odds]);

  // Refined Risk calculation function following: NetIncome - Payout = Profit/Loss
  const calculateRisk = useCallback((num: number, currentBetData: Record<number, number>, currentEaten: Record<number, number>) => {
    const keptAmounts = Array.from({ length: 49 }, (_, i) => {
      const n = i + 1;
      return Math.max(0, (currentBetData[n] || 0) - (currentEaten[n] || 0));
    });
    
    const totalKeptGross = keptAmounts.reduce((s, v) => s + v, 0);
    const netIncome = Math.round(totalKeptGross * (1 - rebate / 100)); // 实收 = 总下注 * (1 - 反水)
    
    const targetKeptAmount = Math.max(0, (currentBetData[num] || 0) - (currentEaten[num] || 0));
    const payout = Math.round(targetKeptAmount * odds);
    
    // Risk = Net Income - Payout
    return netIncome - payout;
  }, [rebate, odds]);

  // The portion to be OFF-LOADED (Reported/上报) based on current preview
  // Logic now handled iteratively above
  const [modalMode, setModalMode] = useState<'save' | 'deduct'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type');
      if (type === 'deduct') return 'deduct';
    }
    return 'save';
  });

  // Sync activeView with modalMode for correct record retrieval in standalone mode
  useEffect(() => {
    if (standaloneMode) {
      setActiveView(modalMode === 'save' ? 'stats' : 'compound');
    }
  }, [standaloneMode, modalMode]);
  const [drawNumbers, setDrawNumbers] = useState<(number | null)[]>(() => {
    const key = getSysKey('drawNumbers');
    const saved = localStorage.getItem(key) || (systemType === 'HK' ? localStorage.getItem('drawNumbers') : null);
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
    const key = getSysKey('riskNumbers');
    const saved = localStorage.getItem(key) || (systemType === 'HK' ? localStorage.getItem('riskNumbers') : null);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure we always have exactly 24 elements for 4 rows
        const arr = Array(24).fill('');
        parsed.forEach((v: any, i: number) => {
          if (i < 24) arr[i] = v === null ? '' : v.toString();
        });
        return arr;
      } catch (e) {
        return Array(24).fill('');
      }
    }
    return Array(24).fill('');
  });
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [showEatingPreview, setShowEatingPreview] = useState(true);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const riskInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleReset = useCallback((keepRiskNumbers: boolean = false, keepSpecialNumbers: boolean = false, targetCustomerId?: string, isGlobal: boolean = false) => {
    // Prevent auto-save from overwriting the cleared state
    isSwitchingRef.current = true;

    // 强制创建一个全新的对象，确保引用改变且内容为空
    const emptyBet: Record<number, number> = {};
    for (let i = 1; i <= 49; i++) emptyBet[i] = 0;
    
    if (isGlobal) {
      // 1. 【核武器级清理】不依赖客户列表，直接物理扫描整个浏览器存储
      try {
        const keys = Object.keys(localStorage);
        const dataKeyKeywords = [
          'customer_state_', 'customer_summary_state', 'financeBetData',
          'financeRecords', 'compoundRecords', 'eatenAmounts', 'eatingHistory'
        ];
        
        keys.forEach(key => {
          // 只要键名包含数据关键字，直接抹除
          if (dataKeyKeywords.some(keyword => key.includes(keyword))) {
            if (key.includes('financeBetData')) {
              localStorage.setItem(key, JSON.stringify(emptyBet));
            } else if (key.includes('eatenAmounts')) {
              localStorage.setItem(key, '{}');
            } else if (key.includes('customer_')) {
              localStorage.setItem(key, JSON.stringify({
                financeBetData: emptyBet,
                eatenAmounts: {},
                financeRecords: [],
                compoundRecords: [],
                eatingHistory: [],
                totalTurnover: 0
              }));
            } else {
              localStorage.setItem(key, '[]');
            }
          }
        });
      } catch (e) {
        console.error('Master wipe failed', e);
      }

      // 2. 内存状态全量强制归零
      setFinanceBetData(emptyBet);
      setFinanceRecords([]);
      setCompoundRecords([]);
      setEatingHistory([]);
      setEatenAmounts({});
      if (typeof setScaledBetData === 'function') setScaledBetData({});
      setDrawNumbers(Array(7).fill(null));

      // 强制所有页面刷新
      setRefreshCounter(prev => prev + 1);
    } else {
      // 原有的单客户重置逻辑...
      const tId = targetCustomerId || selectedCustomerId;
      const isCurrentActive = tId === selectedCustomerId;

      if (isCurrentActive) {
        setFinanceBetData(emptyBet);
        setFinanceRecords([]);
        setCompoundRecords([]);
        setDrawNumbers(Array(7).fill(null));
        setEatingHistory([]);
        setEatenAmounts({});
      }

      if (tId === 'default') {
        const systems = ['', 'MO_', 'HK_'];
        systems.forEach(p => {
          localStorage.setItem(`${p}financeBetData`, JSON.stringify(emptyBet));
          localStorage.setItem(`${p}financeRecords`, JSON.stringify([]));
          localStorage.setItem(`${p}compoundRecords`, JSON.stringify([]));
          localStorage.setItem(`${p}eatingHistory`, JSON.stringify([]));
          localStorage.setItem(`${p}eatenAmounts`, JSON.stringify({}));
        });
      }

      if (tId && tId !== 'default') {
        const emptyState = {
          financeBetData: emptyBet,
          eatenAmounts: {},
          financeRecords: [],
          compoundRecords: [],
          eatingHistory: [],
          totalTurnover: 0
        };
        localStorage.setItem(`customer_state_${tId}`, JSON.stringify(emptyState));
        localStorage.setItem(`MO_customer_state_${tId}`, JSON.stringify(emptyState));
        localStorage.setItem(`HK_customer_state_${tId}`, JSON.stringify(emptyState));
      }
      
      setRefreshCounter(prev => prev + 1);
    }

    // 处理特码和风险号码的清理
    if (!keepSpecialNumbers) {
      if (isGlobal || targetCustomerId === selectedCustomerId) {
        setSpecialNumber(null);
        setAuxSpecialNumber(null);
        setAuxSpecialNumberInput('');
        setSpecialNumberInput('');
      }
      localStorage.removeItem(getSysKey('specialNumber'));
      localStorage.removeItem(getSysKey('auxSpecialNumber'));
    }

    if (!keepRiskNumbers) {
      if (isGlobal || targetCustomerId === selectedCustomerId) {
        setRiskNumbers(Array(24).fill(''));
      }
      localStorage.setItem(getSysKey('riskNumbers'), JSON.stringify(Array(24).fill('')));
    }

    // Re-enable auto-save after state settles
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 2000);

    setError(null);
    setShowResetConfirm(false);
  }, [selectedCustomerId, getSysKey, customers]);

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
  // Update the handleParse ref whenever it changes
  // Detect standalone mode AND sync data across windows
  useEffect(() => {
    // Listener for cross-window sync
    const handleStorageSync = (e: StorageEvent) => {
      if (!e.key) return;
      
      // Handle submission messages
      const submitKey = getSysKey('LOTTERY_EXTERNAL_SUBMIT');
      if (e.key === submitKey && e.newValue) {
        if (standaloneMode) return;
        try {
          const syncData = JSON.parse(e.newValue);
          // 使用唯一 ID 去重
          if (syncData.id && processedIdsRef.current.has(syncData.id)) {
            localStorage.removeItem(submitKey);
            return;
          }
          if (syncData.id) {
            processedIdsRef.current.add(syncData.id);
            if (processedIdsRef.current.size > 100) {
              const firstItem = processedIdsRef.current.values().next().value;
              if (firstItem) processedIdsRef.current.delete(firstItem);
            }
          }
          if (handleParseRef.current) {
            // Check if we need to switch customer context before parsing
            if (syncData.targetId && syncData.targetId !== lastCustomerIdRef.current) {
              // 如果处于汇总模式，不要切换视图，直接在后台处理
              if (lastCustomerIdRef.current !== 'default') {
                setSelectedCustomerId(syncData.targetId);
                // Wait for state to settle and data to load
                setTimeout(() => {
                  if (handleParseRef.current) {
                    handleParseRef.current(syncData.isNegative, syncData.text, syncData.targetId, syncData.resetBefore);
                  }
                }, 300);
              } else {
                // 汇总模式下，直接调用 handleParse，它内部会处理存储同步
                handleParseRef.current(syncData.isNegative, syncData.text, syncData.targetId, syncData.resetBefore);
              }
            } else {
              handleParseRef.current(syncData.isNegative, syncData.text, syncData.targetId, syncData.resetBefore);
            }
          }
          localStorage.removeItem(submitKey);
        } catch (err) {}
        return;
      }

      // Handle UNDO signal - IMPORTANT: MUST be processed in main mode to ensure consistency
      const undoKey = getSysKey('LOTTERY_UNDO_REQUEST');
      if (e.key === undoKey && e.newValue) {
        if (standaloneMode) return;
        try {
          const undoData = JSON.parse(e.newValue);
          if (handleUndoRef.current) {
            handleUndoRef.current(undoData.recordId);
          }
          localStorage.removeItem(undoKey);
        } catch (err) {}
        return;
      }

      // Handle RESET signal
      const resetKey = getSysKey('LOTTERY_RESET_REQUEST');
      if (e.key === resetKey && e.newValue) {
        if (standaloneMode) return;
        try {
          const resetData = JSON.parse(e.newValue);
          const tId = resetData.targetId;
          
          if (tId && tId !== 'default') {
            if (tId === selectedCustomerId) {
              handleReset(resetData.keepRisk, resetData.keepSpecial);
            } else {
              // 背景客户清空
              const emptyBet: Record<number, number> = {};
              for (let j = 1; j <= 49; j++) emptyBet[j] = 0;
              const stateToSave = {
                financeBetData: emptyBet,
                eatenAmounts: {},
                financeRecords: [],
                compoundRecords: [],
                eatingHistory: [],
                totalTurnover: 0
              };
              localStorage.setItem(getSysKey(`customer_state_${tId}`), JSON.stringify(stateToSave));
              
              if (selectedCustomerId === 'default') {
                setRefreshCounter(prev => prev + 1);
              }
            }
          } else {
            handleReset(resetData.keepRisk, resetData.keepSpecial, undefined, resetData.isGlobal);
            if (resetData.isGlobal) {
              setEatenAmounts({});
              setEatingHistory([]);
              localStorage.setItem('eatenAmounts', JSON.stringify({}));
              localStorage.setItem('eatingHistory', JSON.stringify([]));
              localStorage.setItem('MO_eatenAmounts', JSON.stringify({}));
              localStorage.setItem('MO_eatingHistory', JSON.stringify([]));
            }
          }
          localStorage.removeItem(resetKey);
        } catch (err) {}
        return;
      }

      // Data synchronization
      try {
        if (e.key === getSysKey('financeBetData')) setFinanceBetData(JSON.parse(e.newValue || '{}'));
        if (e.key === getSysKey('financeRecords')) setFinanceRecords(JSON.parse(e.newValue || '[]'));
        if (e.key === getSysKey('compoundRecords')) setCompoundRecords(JSON.parse(e.newValue || '[]'));
        if (e.key === getSysKey('eatingHistory')) setEatingHistory(JSON.parse(e.newValue || '[]'));
        if (e.key === getSysKey('eatenAmounts')) setEatenAmounts(JSON.parse(e.newValue || '{}'));
        if (e.key === getSysKey('specialNumber')) setSpecialNumber(e.newValue ? parseInt(e.newValue) : null);
        if (e.key === getSysKey('auxSpecialNumber')) setAuxSpecialNumber(e.newValue ? parseInt(e.newValue) : null);
        if (e.key === getSysKey('odds')) {
          const val = parseFloat(e.newValue);
          if (!isNaN(val)) setOdds(val);
        }
        if (e.key === getSysKey('rebate')) {
          const val = parseFloat(e.newValue);
          if (!isNaN(val)) setRebate(val);
        }
        if (e.key === getSysKey('enableSearchUndo')) setEnableSearchUndo(e.newValue === 'true');
        if (e.key === getSysKey('smartSystemRecognition')) setSmartSystemRecognition(e.newValue === 'true');
        if (e.key === getSysKey('requireUndoConfirm')) setRequireUndoConfirm(e.newValue === 'true');
        if (e.key === getSysKey('autoPasteEnabled')) setAutoPasteEnabled(e.newValue !== 'false');
        if (e.key === getSysKey('riskNumbers')) setRiskNumbers(JSON.parse(e.newValue || '[]'));
        if (e.key === getSysKey('modalInputValue') && e.newValue !== null) setModalInputValue(e.newValue);
        if (e.key === getSysKey('followCustomerRisk')) setFollowCustomerRisk(e.newValue === 'true');
        if (e.key === getSysKey('enableCustomerEatingReport')) setEnableCustomerEatingReport(e.newValue === 'true');
        if (e.key === 'isCompactMode') setIsCompactMode(e.newValue === 'true');
        if (e.key === 'customWidth') setCustomWidth(parseInt(e.newValue || '1420'));
        if (e.key === 'customHeight') setCustomHeight(parseInt(e.newValue || '903'));
        
        // Listen for any customer state changes to refresh aggregate view in Summary Mode
        if (selectedCustomerId === 'default' && e.key.startsWith(getSysKey('customer_state_'))) {
          setRefreshCounter(prev => prev + 1);
        }
      } catch (err) {}
    };

    window.addEventListener('storage', handleStorageSync);

    // Electron IPC listeners
    let removeSubmittedListener: (() => void) | undefined;
    let removeModeListener: (() => void) | undefined;
    let removeUndoListener: (() => void) | undefined;

    if (window.electron) {
      removeSubmittedListener = window.electron.on('entry-data-submitted', (data: any) => {
        if (standaloneMode) return;
        if (data.id && processedIdsRef.current.has(data.id)) return;
        if (data.id) {
          processedIdsRef.current.add(data.id);
          if (processedIdsRef.current.size > 100) {
            const firstItem = processedIdsRef.current.values().next().value;
            if (firstItem) processedIdsRef.current.delete(firstItem);
          }
        }
        if (handleParseRef.current) {
          if (data.targetId && data.targetId !== lastCustomerIdRef.current) {
            // 如果处于汇总模式，不要切换视图，直接执行解析逻辑进行后台更新
            if (lastCustomerIdRef.current !== 'default') {
               setSelectedCustomerId(data.targetId);
               setTimeout(() => {
                 if (handleParseRef.current) {
                   handleParseRef.current(data.isNegative, data.text, data.targetId, data.resetBefore);
                 }
               }, 150);
            } else {
               handleParseRef.current(data.isNegative, data.text, data.targetId, data.resetBefore);
            }
          } else {
            handleParseRef.current(data.isNegative, data.text, data.targetId, data.resetBefore);
          }
        }
      });

      removeModeListener = window.electron.on('set-entry-mode', (mode: string) => {
        setModalMode(mode as 'save' | 'deduct');
      });

      removeUndoListener = window.electron.on('undo-entry-trigger', (data: any) => {
        if (standaloneMode) return;
        if (data.recordId && handleUndoRef.current) {
          handleUndoRef.current(data.recordId);
        }
      });

      // Add RESET listener for Electron
      const removeResetListener = window.electron.on('reset-entry-trigger', (data: any) => {
        if (standaloneMode) return;
        const tId = data.targetId;
        if (tId && tId !== 'default') {
          if (tId === selectedCustomerId) {
            handleReset(data.keepRisk, data.keepSpecial);
          } else {
            // 背景客户清空
            const emptyBet: Record<number, number> = {};
            for (let j = 1; j <= 49; j++) emptyBet[j] = 0;
            const stateToSave = {
              financeBetData: emptyBet,
              eatenAmounts: {},
              financeRecords: [],
              compoundRecords: [],
              eatingHistory: [],
              totalTurnover: 0
            };
            localStorage.setItem(getSysKey(`customer_state_${tId}`), JSON.stringify(stateToSave));
            
            if (selectedCustomerId === 'default') {
              setRefreshCounter(prev => prev + 1);
            }
          }
        } else {
          handleReset(data.keepRisk, data.keepSpecial, undefined, data.isGlobal);
        }
      });
      
      const originalCleanup = () => {
        if (removeSubmittedListener) removeSubmittedListener();
        if (removeModeListener) removeModeListener();
        if (removeUndoListener) removeUndoListener();
        removeResetListener();
      };
      
      return () => {
        window.removeEventListener('storage', handleStorageSync);
        originalCleanup();
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [standaloneMode, handleReset]);

  useEffect(() => {
    localStorage.setItem(getSysKey('enableCustomerEatingReport'), enableCustomerEatingReport.toString());
  }, [enableCustomerEatingReport, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('odds'), odds.toString());
  }, [odds, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('rebate'), rebate.toString());
  }, [rebate, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('drawNumbers'), JSON.stringify(drawNumbers));
  }, [drawNumbers, getSysKey]);

  useEffect(() => {
    localStorage.setItem('specialNumber', specialNumber ? specialNumber.toString() : '');
  }, [specialNumber]);

  useEffect(() => {
    localStorage.setItem('auxSpecialNumber', auxSpecialNumber ? auxSpecialNumber.toString() : '');
  }, [auxSpecialNumber]);

  useEffect(() => {
    setSpecialNumberInput(specialNumber ? specialNumber.toString().padStart(2, '0') : '');
    setAuxSpecialNumberInput(auxSpecialNumber ? auxSpecialNumber.toString().padStart(2, '0') : '');
  }, [specialNumber, auxSpecialNumber]);

  useEffect(() => {
    localStorage.setItem(getSysKey('requireUndoConfirm'), requireUndoConfirm.toString());
  }, [requireUndoConfirm, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('autoPasteEnabled'), autoPasteEnabled.toString());
  }, [autoPasteEnabled, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('followCustomerRisk'), followCustomerRisk.toString());
  }, [followCustomerRisk, getSysKey]);

  useEffect(() => {
    // 允许同步输入框内容到本地存储，但不参与导致回退的逻辑
    localStorage.setItem(getSysKey('modalInputValue'), modalInputValue);
  }, [modalInputValue, getSysKey]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalInputRef = useRef<HTMLTextAreaElement>(null);
  const standaloneInputRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const standalonePreviewScrollRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Auto-scroll preview to bottom when input changes
  useEffect(() => {
    if (previewScrollRef.current) {
      previewScrollRef.current.scrollTop = previewScrollRef.current.scrollHeight;
    }
  }, [modalInputValue, isModalOpen]);

  // FIX: 自动聚焦逻辑 - 只有在没有焦点时才尝试聚焦，且不要在输入内容变化时强行触发（除非是清空操作）
  useEffect(() => {
    if (standaloneMode && standaloneInputRef.current) {
      // 初始聚焦
      if (document.activeElement !== standaloneInputRef.current) {
        standaloneInputRef.current.focus();
      }
    }
  }, [standaloneMode]); // 仅在模式切换时触发，或显式调用聚焦

  // 监听输入清空时重新聚焦
  useEffect(() => {
    if (standaloneMode && modalInputValue === '' && standaloneInputRef.current) {
      standaloneInputRef.current.focus();
    }
  }, [modalInputValue, standaloneMode]);

  useEffect(() => {
    if (standalonePreviewScrollRef.current) {
      standalonePreviewScrollRef.current.scrollTop = standalonePreviewScrollRef.current.scrollHeight;
    }
  }, [modalInputValue, standaloneMode]);

  // Derive HK and MO odds for summary view displays
  const hkOddsVal = useMemo(() => {
    const saved = localStorage.getItem('odds');
    return saved ? parseFloat(saved) : 48.5;
  }, [systemType === 'HK' ? odds : null]);
  
  const moOddsVal = useMemo(() => {
    const saved = localStorage.getItem('MO_odds');
    return saved ? parseFloat(saved) : 48.5;
  }, [systemType === 'MO' ? odds : null]);

  const totalTurnover = useMemo(() => {
    if (activeView === 'stats') {
      const data = selectedCustomerId === 'default' ? summaryMatrixData : displayBetData;
      return (Object.values(data) as number[]).reduce((a, b) => a + b, 0);
    }
    return compoundRecords.reduce((sum, r) => {
      // Use subTotals if available (new unified records)
      if (r.subTotals) {
        return sum + (r.subTotals[systemType] || 0);
      }
      // Fallback for legacy records or single-system records
      if (r.system === undefined || r.system === systemType) {
        return sum + (r.totalAmount || 0);
      }
      return sum;
    }, 0);
  }, [financeBetData, compoundRecords, activeView, systemType]);

  const macauTotal = useMemo(() => {
    if (selectedCustomerId === 'default') {
      let sum = 0;
      customers.forEach(c => {
        if (c.id === 'default') return;
        const saved = localStorage.getItem(`MO_customer_state_${c.id}`) || localStorage.getItem(`customer_state_${c.id}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.financeBetData) {
            const coeffKey = `coefficient_${c.id}`;
            const coeffSaved = localStorage.getItem(coeffKey);
            const coeff = coeffSaved ? parseFloat(coeffSaved) : 1.0;
            let customerSum = 0;
            for (let i = 1; i <= 49; i++) {
              const val = data.financeBetData[i] || 0;
              customerSum += Math.round(val * coeff);
            }
            sum += customerSum;
          }
        }
      });
      return sum;
    } else {
      let targetBetData: Record<number, number> = {};
      if (systemType === 'MO') {
        targetBetData = financeBetData;
      } else {
        const saved = localStorage.getItem(`MO_customer_state_${selectedCustomerId}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.financeBetData) {
            targetBetData = data.financeBetData;
          }
        }
      }
      
      let sum = 0;
      for (let i = 1; i <= 49; i++) {
        sum += (targetBetData[i] || 0);
      }
      return sum;
    }
  }, [systemType, selectedCustomerId, customers, refreshCounter, financeBetData]);

  const hkTotal = useMemo(() => {
    if (selectedCustomerId === 'default') {
      let sum = 0;
      customers.forEach(c => {
        if (c.id === 'default') return;
        const key = `HK_customer_state_${c.id}`;
        const saved = localStorage.getItem(key) || localStorage.getItem(`customer_state_${c.id}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.financeBetData) {
            const coeffKey = `coefficient_${c.id}`;
            const coeffSaved = localStorage.getItem(coeffKey);
            const coeff = coeffSaved ? parseFloat(coeffSaved) : 1.0;
            let customerSum = 0;
            for (let i = 1; i <= 49; i++) {
              const val = data.financeBetData[i] || 0;
              customerSum += Math.round(val * coeff);
            }
            sum += customerSum;
          }
        }
      });
      return sum;
    } else {
      let targetBetData: Record<number, number> = {};
      if (systemType === 'HK') {
        targetBetData = financeBetData;
      } else {
        const key = `HK_customer_state_${selectedCustomerId}`;
        const saved = localStorage.getItem(key) || localStorage.getItem(`customer_state_${selectedCustomerId}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.financeBetData) {
            targetBetData = data.financeBetData;
          }
        }
      }
      
      let sum = 0;
      for (let i = 1; i <= 49; i++) {
        sum += (targetBetData[i] || 0);
      }
      return sum;
    }
  }, [systemType, selectedCustomerId, customers, refreshCounter, financeBetData]);

  const clientBothSystemsTotal = useMemo(() => {
    return macauTotal + hkTotal;
  }, [macauTotal, hkTotal]);

  // Save current customer state to specific key
  // Atomically handle switching and auto-saving
  useEffect(() => {
    isSwitchingRef.current = true;
    
    // 1. Save data of the PREVIOUS customer before loading new one
    // Only save if previous was NOT the aggregate 'default'
    if (lastCustomerIdRef.current && lastCustomerIdRef.current !== selectedCustomerId && lastCustomerIdRef.current !== 'default') {
      const stateToSave = {
        financeBetData,
        eatenAmounts,
        financeRecords,
        compoundRecords,
        eatingHistory,
        totalTurnover: (Object.values(financeBetData) as number[]).reduce((a, b) => a + b, 0)
      };
      
      // Explicitly save to the current system's key
      localStorage.setItem(getSysKey(`customer_state_${lastCustomerIdRef.current}`), JSON.stringify(stateToSave));
    }

    // 2. Load data for the NEW customer
    if (selectedCustomerId === 'default') {
      // 汇总模式：统计所有正式客户的总数据 (仅限当前系统)
      const aggregateBetData: Record<number, number> = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
      const scaledAggregateBetData: Record<number, number> = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
      const aggregateEaten: Record<number, number> = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
      let aggregateFinanceRecords: any[] = [];
      let aggregateCompoundRecords: any[] = [];
      let aggregateEatingHistory: any[] = [];

      customers.forEach(c => {
        if (c.id === 'default') return;

        // Force reading from the current system's prefixed key
        const key = getSysKey(`customer_state_${c.id}`);
        // Fallback for migration: if prefix version doesn't exist, try getting from legacy/backup keys
        const saved = localStorage.getItem(key) || (systemType === 'HK' ? localStorage.getItem(`customer_state_${c.id}`) : null);
        
        if (saved) {
          const data = JSON.parse(saved);
          const coeffKey = `coefficient_${c.id}`;
          const coeffSaved = localStorage.getItem(coeffKey);
          const coeff = coeffSaved ? parseFloat(coeffSaved) : 1.0;
          
          if (data.financeBetData) {
            Object.entries(data.financeBetData).forEach(([num, val]) => {
              const n = parseInt(num);
              const v = (val as number || 0);
              const scaledVal = Math.round(v * coeff);
              aggregateBetData[n] = (aggregateBetData[n] || 0) + v;
              scaledAggregateBetData[n] = (scaledAggregateBetData[n] || 0) + scaledVal;
            });
          }
          
          if (data.financeRecords) {
            const recordsWithInfo = (data.financeRecords as BetRecord[]).map(r => ({
              ...r,
              totalAmount: Math.round((r.totalAmount || 0) * coeff),
              items: (r.items || []).map((it: any) => ({
                ...it,
                amount: it.isSplitAmount ? ((it.amount || 0) * coeff) : Math.round((it.amount || 0) * coeff)
              })),
              id: r.id || Math.random().toString(36).substr(2, 9),
              customerId: r.customerId || c.id,
              customerName: r.customerName || c.name,
              timestamp: r.timestamp || (r.time ? new Date().setHours(...(r.time.split(':').map(Number) as [number, number, number])) : Date.now())
            }));
            aggregateFinanceRecords = [...aggregateFinanceRecords, ...recordsWithInfo];
          }
          
          if (data.compoundRecords) {
            const recordsWithInfo = (data.compoundRecords as BetRecord[]).map(r => ({
              ...r,
              totalAmount: Math.round((r.totalAmount || 0) * coeff),
              items: (r.items || []).map((it: any) => ({
                ...it,
                amount: it.isSplitAmount ? ((it.amount || 0) * coeff) : Math.round((it.amount || 0) * coeff)
              })),
              id: r.id || Math.random().toString(36).substr(2, 9),
              customerId: r.customerId || c.id,
              customerName: r.customerName || c.name,
              timestamp: r.timestamp || (r.time ? new Date().setHours(...(r.time.split(':').map(Number) as [number, number, number])) : Date.now())
            }));
            aggregateCompoundRecords = [...aggregateCompoundRecords, ...recordsWithInfo];
          }
        }
      });

      // Special handling for shared summary state (Eaten, eating history)
      const summaryStateKey = getSysKey('customer_summary_state');
      const savedSummary = localStorage.getItem(summaryStateKey);
      if (savedSummary) {
        const sData = JSON.parse(savedSummary);
        if (sData.eatenAmounts) {
          Object.entries(sData.eatenAmounts).forEach(([num, val]) => {
            aggregateEaten[parseInt(num)] = (val as number || 0);
          });
        }
        if (sData.eatingHistory) aggregateEatingHistory = sData.eatingHistory;
      }

      setFinanceBetData(aggregateBetData);
      setScaledBetData(scaledAggregateBetData);
      setEatenAmounts(aggregateEaten);
      setFinanceRecords(aggregateFinanceRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      setCompoundRecords(aggregateCompoundRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      setEatingHistory(aggregateEatingHistory.sort((a, b) => {
        const timeA = a.time ? new Date().setHours(...(a.time.split(':').map(Number) as [number, number, number])) : 0;
        const timeB = b.time ? new Date().setHours(...(b.time.split(':').map(Number) as [number, number, number])) : 0;
        return timeB - timeA;
      }));
    } else {
      const key = getSysKey(`customer_state_${selectedCustomerId}`);
      const savedState = localStorage.getItem(key) || (systemType === 'HK' ? localStorage.getItem(`customer_state_${selectedCustomerId}`) : null);
      if (savedState) {
        const data = JSON.parse(savedState);
        if (data.financeBetData) setFinanceBetData(data.financeBetData);
        if (data.eatenAmounts) setEatenAmounts(data.eatenAmounts);
        if (data.financeRecords) setFinanceRecords(data.financeRecords || []);
        if (data.compoundRecords) setCompoundRecords(data.compoundRecords || []);
        if (data.eatingHistory) setEatingHistory(data.eatingHistory || []);
      } else {
        setFinanceBetData(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])));
        setEatenAmounts(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])));
        setFinanceRecords([]);
        setCompoundRecords([]);
        setEatingHistory([]);
      }
    }

    // 3. Update Ref effectively
    lastCustomerIdRef.current = selectedCustomerId;
    localStorage.setItem(getSysKey('selectedCustomerId'), selectedCustomerId);
    
    // Allow auto-save to Resume after state settle
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 100);
  }, [selectedCustomerId, customers, refreshCounter, getSysKey, systemType]); 

  // Auto-save state to CURRENT customer when it changes
  useEffect(() => {
    // DO NOT auto-save if switching
    if (!selectedCustomerId || isSwitchingRef.current) return;
    
    const timer = setTimeout(() => {
      // Final check for switching status before storage write
      if (isSwitchingRef.current) return;

      const stateToSave = {
        financeBetData: selectedCustomerId === 'default' ? {} : financeBetData, // Summary bet data is aggregate, don't persist it as a base
        eatenAmounts,
        financeRecords: selectedCustomerId === 'default' ? [] : financeRecords,
        compoundRecords: selectedCustomerId === 'default' ? [] : compoundRecords,
        eatingHistory,
        totalTurnover: (Object.values(financeBetData) as number[]).reduce((a, b) => a + b, 0)
      };
      
      const saveKey = selectedCustomerId === 'default' 
        ? getSysKey('customer_summary_state') 
        : getSysKey(`customer_state_${selectedCustomerId}`);
        
      localStorage.setItem(saveKey, JSON.stringify(stateToSave));
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [financeBetData, eatenAmounts, financeRecords, compoundRecords, eatingHistory, selectedCustomerId, getSysKey]);

  // Persist customer list
  useEffect(() => {
    localStorage.setItem('local_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(getSysKey('riskNumbers'), JSON.stringify(riskNumbers));
  }, [riskNumbers, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('enableSearchUndo'), enableSearchUndo.toString());
  }, [enableSearchUndo, getSysKey]);

  useEffect(() => {
    localStorage.setItem(getSysKey('smartSystemRecognition'), smartSystemRecognition.toString());
  }, [smartSystemRecognition, getSysKey]);

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
      if (cleanValue.length >= 2 && index < 23) {
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
      if (currentIdx < 24) {
        newRisk[currentIdx] = num;
        currentIdx++;
      }
    }
    setRiskNumbers(newRisk);
    
    // Auto focus the last filled box if not beyond range
    const lastFocusIdx = Math.min(index + numbers.length - 1, 23);
    riskInputRefs.current[lastFocusIdx]?.focus();
  };

  const getRiskMatchCount = (numbers: number[], system?: 'HK' | 'MO') => {
    if (!numbers || numbers.length === 0) return 0;
    const actualSys = system || systemType;
    const slice = actualSys === 'MO' ? riskNumbers.slice(0, 12) : riskNumbers.slice(12, 24);
    const riskSet = new Set(
      slice
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 49)
    );
    return numbers.filter(n => riskSet.has(n)).length;
  };

  const handleEatCodes = () => {
    const nextReported = { ...previewReportedData } as Record<number, number>;
    
    const deltas: Record<number, number> = {};
    let totalNewReported = 0;
    
    for (let i = 1; i <= 49; i++) {
      const currentVal = nextReported[i] || 0;
      const prevVal = eatenAmounts[i] || 0;
      if (currentVal > prevVal) {
        const delta = currentVal - prevVal;
        deltas[i] = delta;
        totalNewReported += delta;
      }
    }
    
    if (totalNewReported > 0) {
      setEatenAmounts(nextReported);
      
      const newEntry = {
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        threshold: eatingThreshold,
        totalEaten: totalNewReported,
        distribution: Object.fromEntries(
          Object.entries(deltas).map(([num, val]) => [num, val])
        )
      };
      setEatingHistory(prev => [newEntry, ...prev]);

      // setError(`已成功执行吃码上报，本次新增上报：¥${totalNewReported.toLocaleString()}。`);
    } else {
      // setError('预览显示无需新增上报（所有号码风险均在控制范围内）。');
    }
  };

  const handleUndoEating = (id: string) => {
    const entry = eatingHistory.find(h => h.id === id);
    if (!entry) return;

    // 1. 从 eatingHistory 中移除
    const nextHistory = eatingHistory.filter(h => h.id !== id);
    setEatingHistory(nextHistory);

    // 2. 回滚 eatenAmounts
    const nextEaten = { ...eatenAmounts } as Record<number, number>;
    Object.entries(entry.distribution).forEach(([num, amount]) => {
      const n = parseInt(num);
      nextEaten[n] = Math.max(0, (nextEaten[n] || 0) - (amount as number));
    });
    setEatenAmounts(nextEaten);
    
    // setError('已撤回此条吃码上报记录，相关金额已从已上报统计中扣除。');
    // setTimeout(() => setError(null), 2000);
  };

  const handleResetEaten = () => {
    setEatenAmounts(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])));
    setEatingHistory([]);
  };

  const triggerClearAndPaste = useCallback(async () => {
    if (!clearConfirmActive) {
      // 1. 无阻塞内联二次确认为主，点击后进入 3s 倒计时确认闪烁
      setClearConfirmActive(true);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        setClearConfirmActive(false);
      }, 3000);

      // 把焦点归还并锁定至对应工作文本框，保障极高输入流畅度
      if (standaloneMode) {
        window.focus();
        standaloneInputRef.current?.focus();
      } else {
        modalInputRef.current?.focus();
      }
      return;
    }

    // 2. 3秒内第二次点击触发，直接取消状态并开始物理全量级清理
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setClearConfirmActive(false);

    // 1. 设置标记防止自动保存干扰，但允许输入逻辑运行
    isSwitchingRef.current = true;
    
    // 强制先失焦再聚焦，并在清除发生时重置活跃状态
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (standaloneMode) {
      window.focus();
      standaloneInputRef.current?.focus();
    } else {
      modalInputRef.current?.focus();
    }

    // 2. 准备空状态
    const emptyBet: Record<number, number> = {};
    for (let i = 1; i <= 49; i++) emptyBet[i] = 0;
    const emptyState = {
      financeBetData: emptyBet,
      eatenAmounts: {},
      financeRecords: [],
      compoundRecords: [],
      eatingHistory: [],
      totalTurnover: 0
    };

    // 3. 物理爆破本地存储中所有的业务数据键（不分系统，全量扫描）
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        // 抹除所有客户状态、汇总状态、以及包含下注/流水/吃码字样的键
        if (
          key.includes('customer_state_') || 
          key.includes('customer_summary_state') ||
          key.includes('financeBetData') ||
          key.includes('financeRecords') ||
          key.includes('compoundRecords') ||
          key.includes('eatingHistory') ||
          key.includes('eatenAmounts') ||
          key.includes('modalInputValue')
        ) {
          if (key.includes('financeBetData')) {
            localStorage.setItem(key, JSON.stringify(emptyBet));
          } else if (key.includes('eatenAmounts')) {
            localStorage.setItem(key, '{}');
          } else if (key.includes('modalInputValue')) {
            localStorage.setItem(key, '');
          } else {
            localStorage.setItem(key, key.includes('customer_') ? JSON.stringify(emptyState) : '[]');
          }
        }
      });

      // 4. 【核心修复】发送全局内存熔断信号，强制主窗口和其它所有系统窗口同步清空内存，防止“李四”数据回秒
      const resetSignal = { keepRisk: true, keepSpecial: true, isGlobal: true, timestamp: Date.now() };
      localStorage.setItem('LOTTERY_RESET_REQUEST', JSON.stringify(resetSignal));
      localStorage.setItem('MO_LOTTERY_RESET_REQUEST', JSON.stringify(resetSignal));
      localStorage.setItem('HK_LOTTERY_RESET_REQUEST', JSON.stringify(resetSignal));
      
      // 5. 立即执行本地重置函数（如果是主窗口调用）
      handleReset(true, true, undefined, true);
      handleResetEaten();
    } catch (e) {
      console.error('Master Wipe Failed', e);
    }

    // 6. 抹除当前窗口所有的状态变量
    setFinanceBetData(emptyBet);
    setFinanceRecords([]);
    setCompoundRecords([]);
    setEatenAmounts({});
    setEatingHistory([]);
    if (typeof setScaledBetData === 'function') setScaledBetData({});

    // 6. 处理粘贴
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const cleanedText = finalCleanText(text);
          setModalInputValue(cleanedText);
          if (typeof setLocalModalValue === 'function') setLocalModalValue(cleanedText);
        } else {
          setModalInputValue('');
          if (typeof setLocalModalValue === 'function') setLocalModalValue('');
        }
      } else {
        setModalInputValue('');
        if (typeof setLocalModalValue === 'function') setLocalModalValue('');
      }
    } catch (err) {
      console.warn('Clipboard failed');
      setModalInputValue('');
      if (typeof setLocalModalValue === 'function') setLocalModalValue('');
    }

    // 7. 仅在极端超长文本粘贴时重新挂载输入框以刷新滚动，清空时绝不销毁 DOM 节点
    // 这样能彻底避免 DOM 重建引起的原生输入框失去与操作系统的焦点环绑定（Focus Ring）
    const currentLength = modalInputValue ? modalInputValue.length : 0;
    if (currentLength > 1000) {
      setTextareaKey(prev => prev + 1);
    }
    setRefreshCounter(prev => prev + 1);
    setLastSubmittedModalValue('');
    
    // 8. 多阶段物理级抗干扰聚焦保障
    const attemptFocus = () => {
      const targetInput = standaloneMode ? standaloneInputRef.current : modalInputRef.current;
      if (targetInput) {
        if (standaloneMode) window.focus();
        targetInput.focus();
        // 物理聚焦并强制移动光标到最后，重置原生编辑输入态
        const len = targetInput.value.length;
        targetInput.setSelectionRange(len, len);
      }
    };

    // 立即在数据写入瞬间尝试重新聚焦
    attemptFocus();

    // 在 50ms、150ms、300ms 节点提供分级多次聚焦，极大抵抗 Electron 或 confirm 窗返回后的窗口聚焦延迟
    setTimeout(attemptFocus, 50);
    setTimeout(attemptFocus, 150);
    setTimeout(attemptFocus, 300);

    setTimeout(() => {
      isSwitchingRef.current = false;
      attemptFocus();
    }, 500);

    console.log('Global Clear Mode: System Activated with Re-render');
  }, [setFinanceBetData, setFinanceRecords, setCompoundRecords, setEatenAmounts, setEatingHistory, handleReset, handleResetEaten, setModalInputValue, setLocalModalValue, standaloneMode, setTextareaKey]);

  const handleAddCustomerSubmit = () => {
    if (!newCustomerName.trim()) return;
    const newId = 'cust_' + Date.now();
    const newCust = {
      id: newId,
      name: newCustomerName.trim(),
      createdAt: new Date().toISOString()
    };

    // Save coefficient for the new customer
    let coeff = parseInt(newCustomerCoefficient);
    if (isNaN(coeff)) coeff = 100;
    coeff = Math.max(1, Math.min(100, coeff));
    const decimalCoeff = coeff / 100;
    localStorage.setItem(`coefficient_${newId}`, decimalCoeff.toFixed(2));

    setCustomers(prev => [...prev, newCust]);
    setSelectedCustomerId(newId);
    setNewCustomerName('');
    setNewCustomerCoefficient('100');
    setIsAddCustomerModalOpen(false);
  };

  const moveCustomerUp = (idValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idValue === 'default') return;
    const index = customers.findIndex(c => c.id === idValue);
    // index 0 is always 'default' (Summary), so first real customer is index 1
    if (index <= 1) return; 
    
    const newCusts = [...customers];
    const temp = newCusts[index];
    newCusts[index] = newCusts[index - 1];
    newCusts[index - 1] = temp;
    setCustomers(newCusts);
  };

  const moveCustomerDown = (idValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idValue === 'default') return;
    const index = customers.findIndex(c => c.id === idValue);
    if (index === -1 || index === customers.length - 1) return;
    
    const newCusts = [...customers];
    const temp = newCusts[index];
    newCusts[index] = newCusts[index + 1];
    newCusts[index + 1] = temp;
    setCustomers(newCusts);
  };

  const handleDeleteCustomer = (idValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idValue === 'default') return; // Cannot delete default
    
    if (window.confirm('确认删除该客户及其所有下注记录吗？此操作不可恢复。')) {
      const newCusts = customers.filter(c => c.id !== idValue);
      setCustomers(newCusts);
      
      // Remove from both HK and MO systems
      localStorage.removeItem(`HK_customer_state_${idValue}`);
      localStorage.removeItem(`MO_customer_state_${idValue}`);
      localStorage.removeItem(`customer_state_${idValue}`); // legacy
      localStorage.removeItem(`coefficient_${idValue}`);
      
      if (selectedCustomerId === idValue) {
        setSelectedCustomerId('default');
      }
    }
  };
  const handleUndo = useCallback((recordId: string) => {
    // 1. Identify a meta version of the record to find basics (customerId)
    const financeRecordInView = financeRecords.find(r => r.id === recordId);
    const compoundRecordInView = compoundRecords.find(r => r.id === recordId);
    let metaRecord = financeRecordInView || compoundRecordInView;

    // Search broader if not in current view (e.g. from global history or after switching systems)
    if (!metaRecord) {
      for (const c of customers) {
        if (c.id === 'default') continue;
        const savedHK = localStorage.getItem(`HK_customer_state_${c.id}`) || localStorage.getItem(`customer_state_${c.id}`);
        const savedMO = localStorage.getItem(`MO_customer_state_${c.id}`);
        for (const s of [savedHK, savedMO]) {
          if (!s) continue;
          try {
            const d = JSON.parse(s);
            const found = [...(d.financeRecords || []), ...(d.compoundRecords || [])].find((r: any) => r.id === recordId);
            if (found) {
              metaRecord = found;
              break;
            }
          } catch(e) {}
        }
        if (metaRecord) break;
      }
    }

    if (!metaRecord) return;
    const targetCustomerId = metaRecord.customerId;
    if (!targetCustomerId) return;

    // 2. Always attempt to clear from both HK and MO systems to support cross-system entry linkage
    const systemsToCheck: ('HK' | 'MO')[] = ['HK', 'MO'];
    
    systemsToCheck.forEach(sys => {
      const sysPrefix = sys === 'MO' ? 'MO_' : 'HK_';
      const key = `${sysPrefix}customer_state_${targetCustomerId}`;
      let saved = localStorage.getItem(key);
      
      // Fallback only for HK migration
      if (!saved && sys === 'HK') {
        saved = localStorage.getItem(`customer_state_${targetCustomerId}`);
      }
      if (saved) {
        try {
          const data = JSON.parse(saved);
          let changed = false;

          // Try finance records
          const fRec = (data.financeRecords || []).find((r: any) => r.id === recordId);
          if (fRec) {
            // Use the items from THIS system's record to ensure correct amounts are subtracted
            fRec.items.forEach((item: any) => {
              // 05-11 修改：撤销时仅影响属于当前正在处理系统的下注项
              if (!item.system || item.system === sys) {
                item.targets.forEach((num: number) => {
                  if (data.financeBetData && data.financeBetData[num] !== undefined) {
                    const amountToSub = item.isSplitAmount ? Math.floor(item.amount) : item.amount;
                    data.financeBetData[num] = Math.round(((data.financeBetData[num] || 0) - amountToSub) * 100) / 100;
                  }
                });
              }
            });
            data.financeRecords = data.financeRecords.filter((r: any) => r.id !== recordId);
            changed = true;
          }

          // Try compound records
          const cRec = (data.compoundRecords || []).find((r: any) => r.id === recordId);
          if (cRec) {
            data.compoundRecords = data.compoundRecords.filter((r: any) => r.id !== recordId);
            changed = true;
          }

          if (changed) {
            localStorage.setItem(key, JSON.stringify(data));
            
            // Sync current UI state if this record belongs to the active customer and system
            if (sys === systemType && targetCustomerId === selectedCustomerId) {
              setFinanceBetData({...data.financeBetData});
              setFinanceRecords([...(data.financeRecords || [])]);
              setCompoundRecords([...(data.compoundRecords || [])]);
            }
          }
        } catch(e) {
          console.error('Error during undo sync:', e);
        }
      }
    });

    if (selectedCustomerId === 'default') {
      setRefreshCounter(prev => prev + 1);
    }
    
    // Cross-window signal sync
    if (!standaloneMode) {
      // Send signal to both systems' windows
      localStorage.setItem('LOTTERY_UNDO_REQUEST', JSON.stringify({ recordId, timestamp: Date.now() }));
      localStorage.setItem('MO_LOTTERY_UNDO_REQUEST', JSON.stringify({ recordId, timestamp: Date.now() }));
    }

    setConfirmingUndoId(null);
  }, [financeRecords, compoundRecords, customers, systemType, selectedCustomerId, setFinanceBetData, setFinanceRecords, setCompoundRecords, standaloneMode]);


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

  const handleParse = useCallback((isNegative: boolean = false, customInput?: string, overrideTargetId?: string, resetBefore: boolean = false) => {
    const inputToParse = customInput !== undefined ? customInput : (modalInputValue || '');
    if (!inputToParse || !inputToParse.trim()) return;

    // 防抖保护
    const nowTs = Date.now();
    if (nowTs - lastProcessedRef.current < 200) return;
    lastProcessedRef.current = nowTs;

    if (standaloneMode && isSubmitting) return;

    if (standaloneMode) {
      if (!popOutTargetId || popOutTargetId === 'default') {
        setError('请先选择录入的目标客户');
        return;
      }

      // Persist the last used customer ID
      localStorage.setItem('last_recorded_customer_id', popOutTargetId);

      setIsSubmitting(true);
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (window.electron) {
        window.electron.submitEntry({
          text: inputToParse,
          isNegative,
          timestamp: Date.now(),
          id: msgId,
          targetId: popOutTargetId,
          resetBefore
        });
      } else {
        const syncData = {
          text: inputToParse,
          isNegative,
          timestamp: Date.now(),
          id: msgId,
          targetId: popOutTargetId,
          resetBefore
        };
        localStorage.setItem(getSysKey('LOTTERY_EXTERNAL_SUBMIT'), JSON.stringify(syncData));
      }
      
      setLastSubmittedModalValue(inputToParse);
      
      // 添加一个控制台日志，方便在 Electron 开发工具中调试
      console.log(`[Standalone Submit] Target: ${popOutTargetId}, ID: ${msgId}, Content Length: ${inputToParse.length}`);
      
      setTimeout(() => {
        setIsSubmitting(false);
        // Ensure values are preserved but submitting lock is released
        setModalInputValue(inputToParse);
        setLocalModalValue(inputToParse);
      }, 200); // 稍微缩短锁定时间，提高连入效率
      return;
    }

    if (isSubmitting && !overrideTargetId) return;
    setIsSubmitting(true);

    // 如果是重新识别，清空最后提交记录，允许再次点击提交
    if (resetBefore) {
      setLastSubmittedModalValue('');
    }

    try {
      if (resetBefore) {
      // Determine target ID first to ensure handleReset clears the correct customer
      const finalTargetIdBeforeReset = (overrideTargetId && overrideTargetId !== 'default' && overrideTargetId !== '') 
        ? overrideTargetId 
        : ((popOutTargetId && popOutTargetId !== 'default' && popOutTargetId !== '') 
            ? popOutTargetId 
            : (selectedCustomerId !== 'default' && selectedCustomerId !== '' ? selectedCustomerId : (customers[0]?.id || '')));
      
      handleReset(true, true, finalTargetIdBeforeReset);
    }

    // 确定最终目标客户 ID
    const finalTargetId = (overrideTargetId && overrideTargetId !== 'default' && overrideTargetId !== '') 
      ? overrideTargetId 
      : ((popOutTargetId && popOutTargetId !== 'default' && popOutTargetId !== '') 
          ? popOutTargetId 
          : (selectedCustomerId !== 'default' && selectedCustomerId !== '' ? selectedCustomerId : (customers[0]?.id || '')));

    if (!finalTargetId) {
      setError('无法保存：请先创建客户');
      return;
    }

    // 内部弹窗/同步逻辑：处理视图跳转
    if (selectedCustomerId !== 'default' && finalTargetId !== selectedCustomerId) {
      setIsSubmitting(true);
      setSelectedCustomerId(finalTargetId);
      setTimeout(() => {
        setIsSubmitting(false);
        if (handleParseRef.current) {
          handleParseRef.current(isNegative, inputToParse, finalTargetId);
        }
      }, 300);
      return;
    }

    // --- 智能分发逻辑开始 ---
    const rawTasks = splitBySystem(inputToParse);
    let anySuccess = false;

    // Use shared customer library to find target
    const targetCustomer = customers.find(c => c.id === finalTargetId) || (customers.length > 0 ? customers[0] : null);
    const actualTargetId = targetCustomer ? targetCustomer.id : 'default';
    const actualTargetName = targetCustomer ? targetCustomer.name : '汇总';

    // Persist the last used customer ID
    if (actualTargetId && actualTargetId !== 'default') {
      localStorage.setItem('last_recorded_customer_id', actualTargetId);
    }

    const allParsedItems: { system: 'HK' | 'MO', items: BetItem[], text: string, preview: string }[] = [];
    
    rawTasks.forEach(task => {
      try {
        const items: BetItem[] = [];
        const taskText = task.text;

        if (activeView === 'compound') {
          // Compound parsing logic... (keeping for completeness)
          const types = ['三中三', '二中二', '三中二', '特碰'];
          const matches: { type: string, index: number }[] = [];
          types.forEach(t => {
            let idx = taskText.indexOf(t);
            while (idx !== -1) {
              matches.push({ type: t, index: idx });
              idx = taskText.indexOf(t, idx + 1);
            }
          });
          matches.sort((a, b) => a.index - b.index);

          if (matches.length > 0) {
            const splitSegments: { type: string, content: string }[] = [];
            for (let i = 0; i < matches.length; i++) {
              const start = matches[i].index;
              const end = (i + 1 < matches.length) ? matches[i+1].index : taskText.length;
              splitSegments.push({
                type: matches[i].type,
                content: taskText.substring(start + matches[i].type.length, end)
              });
            }

            splitSegments.forEach((seg, idx) => {
              const amountMatch = seg.content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                  seg.content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
              
              let amountPerGroup = 0;
              let contentToProcess = seg.content;

              if (amountMatch) {
                amountPerGroup = parseFloat(amountMatch[1]);
                contentToProcess = seg.content.replace(amountMatch[0], '');
              } else {
                for (let j = idx + 1; j < splitSegments.length; j++) {
                  const nextAmountMatch = splitSegments[j].content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                          splitSegments[j].content.match(/(\d+(\.\d+)?)\s*(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
                  if (nextAmountMatch) {
                    amountPerGroup = parseFloat(nextAmountMatch[1]);
                    break;
                  }
                }
              }

              if (amountPerGroup > 0) {
                const grossAmount = isNegative ? -amountPerGroup : amountPerGroup;
                const type = seg.type;
                let kValue = 0;
                if (type === '三中三' || type === '三中二') kValue = 3;
                else if (type === '二中二') kValue = 2;
                else if (type === '特碰') kValue = 1;

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
                      });
                    }
                  } else {
                    if (numbers.length >= kValue) {
                      const combos = getCombinations(numbers, kValue);
                      combos.forEach(combo => {
                        items.push({ targets: combo, amount: grossAmount, raw: `${combo.join('-')} ${type}` });
                      });
                    }
                  }
                });
              }
            });
          }
        } else {
          const results = parseInput(taskText);
          if (results && results.length > 0) {
            results.forEach(res => {
              const grossAmount = isNegative ? -Math.abs(res.amount) : res.amount;
              items.push({
                targets: res.numbers,
                amount: grossAmount,
                raw: res.raw,
                isSplitAmount: res.isSplitAmount
              });
            });
          }
        }

        if (items.length > 0) {
          let segmentPreview = '';
          if (activeView === 'compound') {
             const groupedByRaw: Record<string, number> = {};
             items.forEach(it => { groupedByRaw[it.raw] = (groupedByRaw[it.raw] || 0) + it.amount; });
             segmentPreview = Object.entries(groupedByRaw).map(([raw, amt]) => {
               const subTotal = Math.abs(amt); 
               const hasSplit = items.some(it => it.raw === raw && it.isSplitAmount);
               const suffix = hasSplit ? '（向下取整）' : '';
               return `${raw} 各${amt}（合计：${subTotal}）${suffix}`;
             }).join(' | ');
          } else {
             // 05-10 修改：完全尊重识别顺序，不再按金额排序，也不再聚合不同位置的同金额片段
             segmentPreview = items.map(it => {
               const subTotal = Math.abs(it.amount) * it.targets.length;
               const suffix = it.isSplitAmount ? '（向下取整）' : '';
               return `${it.raw} 各${it.amount}（合计：${subTotal}）${suffix}`;
             }).join(' | ');
          }

          allParsedItems.push({
            system: task.system,
            items: items,
            text: task.text,
            preview: segmentPreview
          });
        }
      } catch (err) {
        console.error('Task parse error:', err);
      }
    });

    if (allParsedItems.length === 0) {
      setIsSubmitting(false);
      return;
    }

    // 风险拦截联动：在保存前进行全局风险检测
    let totalRiskCount = 0;
    allParsedItems.forEach(p => {
      const allNums = p.items.flatMap(it => it.targets);
      totalRiskCount += getRiskMatchCount(allNums, p.system);
    });

    if (totalRiskCount > 8) {
      if (!window.confirm(`【风险拦截】检测到高风险号码 (共${totalRiskCount}处匹配)，确定要继续入账吗？`)) {
        setIsSubmitting(false);
        return;
      }
    }

    anySuccess = true;

    const now = new Date();
    const commonId = Math.random().toString(36).substr(2, 9);
    
    // 05-11 修改：合并所有系统的预览信息，形成共享流水显示
    const unifiedPreview = allParsedItems.map(p => {
      const prefix = p.system === 'HK' ? '[港]' : '[澳]';
      return `${prefix}${p.preview}`;
    }).join(' | ');

    const allItems = allParsedItems.flatMap(p => p.items.map(it => ({ ...it, system: p.system })));
    const unifiedTotal = allParsedItems.reduce((acc, p) => {
      const sysTotal = p.items.reduce((sum, it) => sum + (it.amount * (activeView === 'compound' ? 1 : it.targets.length)), 0);
      return acc + sysTotal;
    }, 0);

    const subTotals: Record<'HK' | 'MO', number> = {
      HK: allParsedItems.filter(p => p.system === 'HK').reduce((sum, p) => sum + p.items.reduce((s, it) => s + (it.amount * (activeView === 'compound' ? 1 : it.targets.length)), 0), 0),
      MO: allParsedItems.filter(p => p.system === 'MO').reduce((sum, p) => sum + p.items.reduce((s, it) => s + (it.amount * (activeView === 'compound' ? 1 : it.targets.length)), 0), 0)
    };

    const unifiedRecord: BetRecord = {
      id: commonId,
      time: now.toLocaleTimeString(),
      timestamp: now.getTime(),
      raw: inputToParse.length > 200 ? inputToParse.substring(0, 200) + '...' : inputToParse,
      fullRaw: inputToParse,
      parsedPreview: unifiedPreview,
      items: allItems as any,
      totalAmount: unifiedTotal,
      subTotals: subTotals, // Store sub-totals for separate system accounting
      rebate: rebate,
      customerId: actualTargetId,
      customerName: actualTargetName,
      system: undefined 
    };

    // 分别更新港澳系统的矩阵数据，但流水记录保持一致整合
    const systemsToUpdate: ('HK' | 'MO')[] = ['HK', 'MO'];
    
    systemsToUpdate.forEach(sys => {
      try {
        const sysItems = allParsedItems.filter(p => p.system === sys).flatMap(p => p.items);
        const sysPrefix = sys === 'MO' ? 'MO_' : 'HK_';
        const targetKey = `${sysPrefix}customer_state_${actualTargetId}`;
        const saved = localStorage.getItem(targetKey) || (sys === 'HK' ? localStorage.getItem(`customer_state_${actualTargetId}`) : null);
        
        let data = saved ? JSON.parse(saved) : { 
            financeBetData: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0])),
            financeRecords: [],
            compoundRecords: [],
            eatenAmounts: {}
        };

      // 无论此系统是否有下注，都同步共享流水历史
      if (activeView === 'compound') {
        data.compoundRecords = [unifiedRecord, ...(data.compoundRecords || [])];
      } else {
        data.financeRecords = [unifiedRecord, ...(data.financeRecords || [])];
        if (!data.financeBetData) data.financeBetData = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
        
        // 仅在本系统的矩阵中增加具体下注
        sysItems.forEach(it => {
          it.targets.forEach(num => {
            const amountToAdd = it.isSplitAmount ? Math.floor(it.amount) : it.amount;
            data.financeBetData[num] = Math.round(((data.financeBetData[num] || 0) + amountToAdd) * 100) / 100;
          });
        });

        localStorage.setItem(targetKey, JSON.stringify(data));
      }
    } catch(e) {}
  });

    // 重新校正矩阵和汇总数据
    setRefreshCounter(prev => prev + 1);
    
    // 提交后记录最后一次成功提交的值，用于禁用按钮逻辑
    setLastSubmittedModalValue(inputToParse);

    // 提交后清除输入
    if (!resetBefore) {
      setModalInputValue('');
      setLocalModalValue('');
      lastClipboardContent.current = '';
    }
    } finally {
      setIsSubmitting(false);
    }
  }, [modalInputValue, lastProcessedRef, standaloneMode, popOutTargetId, selectedCustomerId, customers, activeView, handleReset, rebate, refreshCounter, systemType, isSubmitting]);

  useEffect(() => {
    handleParseRef.current = handleParse;
    handleUndoRef.current = handleUndo;
  }, [handleParse, handleUndo]);


  const handlePasteAndRecognize = useCallback(async (clearFirst: boolean = false) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (clearFirst) {
          // 逻辑变更：清空所有系统和客户的数据，并保留特码和风险拦截
          if (standaloneMode) {
            const signal = { keepRisk: true, keepSpecial: true, isGlobal: true, timestamp: Date.now() };
            if (window.electron) window.electron.send('reset-entry', signal);
            else localStorage.setItem(getSysKey('LOTTERY_RESET_REQUEST'), JSON.stringify(signal));
          }
          handleReset(true, true, undefined, true);
          handleResetEaten();
        }
        const cleanedText = finalCleanText(text);
        setModalInputValue(cleanedText);
        setLocalModalValue(cleanedText);
      }
    } catch (err) {
      console.error('Clipboard read error:', err);
      setError('权限被拦截：请点击浏览器地址栏左侧的“锁形”图标，开启【剪切板】访问权限。');
      setTimeout(() => setError(null), 3000);
    }
  }, [standaloneMode, getSysKey, handleReset, handleResetEaten]);

  const triggerLastUndo = useCallback(() => {
    const rawToSearch = modalInputValue.trim();
    let targetRecord = null;
    
    // 逻辑变更：不再区分客户，撤销全系统（当前系统）中最新的一条流水
    if (enableSearchUndo && rawToSearch && rawToSearch.length > 3) {
      // 搜索模式：在所有客户中寻找匹配原始输入的记录
      for (const c of customers) {
        if (c.id === 'default') continue;
        const saved = localStorage.getItem(getSysKey(`customer_state_${c.id}`));
        if (saved) {
          try {
            const data = JSON.parse(saved);
            const found = [...(data.financeRecords || []), ...(data.compoundRecords || [])]
              .find(r => r.fullRaw.trim() === rawToSearch);
            if (found) {
              targetRecord = found;
              break;
            }
          } catch(e) {}
        }
      }
    } 
    
    if (!targetRecord) {
      // 默认模式：扫描所有客户，寻找时间戳最新的那一条
      let latestRecord: any = null;
      for (const c of customers) {
        if (c.id === 'default') continue;
        const saved = localStorage.getItem(getSysKey(`customer_state_${c.id}`));
        if (saved) {
          try {
            const data = JSON.parse(saved);
            const records = activeView === 'stats' ? (data.financeRecords || []) : (data.compoundRecords || []);
            if (records.length > 0) {
              const newest = records[0]; // 记录存入时通常是最新在首位
              
              if (newest && (!latestRecord || (newest.timestamp || 0) > (latestRecord.timestamp || 0))) {
                latestRecord = newest;
              }
            }
          } catch(e) {}
        }
      }
      targetRecord = latestRecord;
    }

    if (targetRecord) {
      const performUndo = () => {
        if (standaloneMode) {
          if (window.electron) {
            window.electron.send('undo-entry', { recordId: targetRecord!.id });
          } else {
            localStorage.setItem(getSysKey('LOTTERY_UNDO_REQUEST'), JSON.stringify({ recordId: targetRecord!.id, timestamp: Date.now() }));
          }
        } else {
          handleUndo(targetRecord!.id);
        }
      };

      if (requireUndoConfirm) {
        setUndoCallback({ 
          fn: performUndo, 
          label: `${targetRecord.raw}` 
        });
        setShowLastUndoConfirm(true);
      } else {
        performUndo();
      }
    } else {
      setError('没有可撤销的记录');
      setTimeout(() => setError(null), 2000);
    }
  }, [modalInputValue, enableSearchUndo, customers, getSysKey, activeView, handleUndo, requireUndoConfirm, standaloneMode]);


  const handlePopOut = useCallback(() => {
    console.log('触发 handlePopOut, mode:', modalMode);
    if (window.electron) {
      console.log('检测到 Electron 桥接 environment, 调用 showEntryWindow');
      window.electron.showEntryWindow(modalMode);
      setIsModalOpen(false);
      return;
    } else {
      console.log('当前非 Electron 环境，尝试使用浏览器自带窗口或模态框');
    }

    const width = 600;
    const height = 800;
    
    // 强制使用系统独立窗口弹出
    if (window.opener || window.name === 'EntryAssistant') {
      // 已经是独立窗口了，不进行嵌套弹出
      return;
    }

    const newWin = window.open(
      window.location.origin + window.location.pathname + '?mode=entry',
      'EntryAssistant',
      `width=${width},height=${height},resizable=yes,scrollbars=yes,status=no,location=no`
    );
    
    if (newWin) {
      setIsModalOpen(false);
      // 尝试聚焦
      newWin.focus();
    } else {
      // 降级使用内部弹窗 (仅在浏览器拦截时)
      setIsModalOpen(true);
    }
  }, [modalMode, setIsModalOpen]);


  const handleCopyData = () => {
    const activeBets = Object.entries(displayBetData)
      .filter(([_, amount]) => (amount as number) > 0)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    if (activeBets.length === 0) return;

    const totalAmount = activeBets.reduce((sum, [_, amount]) => sum + (amount as number), 0);
    const dataString = (systemType === 'HK' ? '港' : '澳') + "\n上报散码数据:\n" + 
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

  const handleClearBoard = () => {
    if (selectedCustomerId === 'default') {
      if (window.confirm('确定要清空【所有客户】的双系统（香港+澳门）所有录入数据、流水和账目吗？此操作不可逆。')) {
        isSwitchingRef.current = true;

        const emptyBet: Record<number, number> = {};
        for (let i = 1; i <= 49; i++) emptyBet[i] = 0;

        // 1. 清除大盘自身的 business 字段
        const systems = ['', 'MO_', 'HK_'];
        systems.forEach(p => {
          localStorage.setItem(`${p}financeBetData`, JSON.stringify(emptyBet));
          localStorage.setItem(`${p}financeRecords`, JSON.stringify([]));
          localStorage.setItem(`${p}compoundRecords`, JSON.stringify([]));
          localStorage.setItem(`${p}eatingHistory`, JSON.stringify([]));
          localStorage.setItem(`${p}eatenAmounts`, JSON.stringify({}));
        });

        // 2. 清除所有子客户的数据，但不删除客户本身
        customers.forEach(customer => {
          if (customer.id !== 'default') {
            const emptyState = {
              financeBetData: emptyBet,
              eatenAmounts: {},
              financeRecords: [],
              compoundRecords: [],
              eatingHistory: [],
              totalTurnover: 0
            };
            localStorage.setItem(`customer_state_${customer.id}`, JSON.stringify(emptyState));
            localStorage.setItem(`MO_customer_state_${customer.id}`, JSON.stringify(emptyState));
            localStorage.setItem(`HK_customer_state_${customer.id}`, JSON.stringify(emptyState));
          }
        });

        // 3. 重置内存状态
        setFinanceBetData(emptyBet);
        setFinanceRecords([]);
        setCompoundRecords([]);
        setEatingHistory([]);
        setEatenAmounts({});
        if (typeof setScaledBetData === 'function') {
          setScaledBetData({});
        }

        if (typeof setLastSubmittedModalValue === 'function') {
          setLastSubmittedModalValue('');
        }

        setError(null);
        setRefreshCounter(prev => prev + 1);

        setTimeout(() => {
          isSwitchingRef.current = false;
        }, 1000);
      }
      return;
    }

    const currentCustomer = customers.find(c => c.id === selectedCustomerId);
    const customerName = currentCustomer ? currentCustomer.name : '该客户';

    if (window.confirm(`确定要清空当前客户【${customerName}】的双系统（香港+澳门）所有录入数据、流水和账目吗？此操作不可逆。`)) {
      isSwitchingRef.current = true;

      // 调用 handleReset 进行当前选定客户的局部物理和内存状态清理，且 keepRiskNumbers=true, keepSpecialNumbers=true 保护特码和风险拦截系统
      handleReset(true, true, selectedCustomerId);

      if (typeof setLastSubmittedModalValue === 'function') {
        setLastSubmittedModalValue('');
      }
      setError(null);
    }
  };


  const handleExport = () => {
    try {
      const wb = XLSX.utils.book_new();
      let totalSheetsAdded = 0;

      // Special numbers are shared (auxSpecialNumber = HK, specialNumber = MO)
      const hkSpecial = auxSpecialNumber;
      const moSpecial = specialNumber;

      // Load Draw Numbers for Universal Compound Logic
      let hkDraw: (number | null)[] = Array(7).fill(null);
      let moDraw: (number | null)[] = Array(7).fill(null);
      const hkDrawSaved = localStorage.getItem('drawNumbers');
      if (hkDrawSaved) hkDraw = JSON.parse(hkDrawSaved);
      const moDrawSaved = localStorage.getItem('MO_drawNumbers');
      if (moDrawSaved) moDraw = JSON.parse(moDrawSaved);
      
      // Load Configs for HK/MO
      let hkRebateVal = 10, moRebateVal = 10;
      let hkOddsVal = 48.5, moOddsVal = 48.5;
      const rHK = localStorage.getItem('rebate'); if (rHK) hkRebateVal = parseFloat(rHK);
      const oHK = localStorage.getItem('odds'); if (oHK) hkOddsVal = parseFloat(oHK);
      const rMO = localStorage.getItem('MO_rebate'); if (rMO) moRebateVal = parseFloat(rMO);
      const oMO = localStorage.getItem('MO_odds'); if (oMO) moOddsVal = parseFloat(oMO);

      customers.forEach(customer => {
        if (customer.id === 'default') return;

        let hkRecs: any[] = [];
        let moRecs: any[] = [];

        const savedHK = localStorage.getItem(`customer_state_${customer.id}`);
        if (savedHK) {
          const data = JSON.parse(savedHK);
          hkRecs = (activeView === 'stats' ? (data.financeRecords || []) : (data.compoundRecords || []))
            .map((r: any) => ({ ...r, sys: '港', r: hkRebateVal, o: hkOddsVal }));
        }
        const savedMO = localStorage.getItem(`MO_customer_state_${customer.id}`);
        if (savedMO) {
          const data = JSON.parse(savedMO);
          moRecs = (activeView === 'stats' ? (data.financeRecords || []) : (data.compoundRecords || []))
            .map((r: any) => ({ ...r, sys: '澳', r: moRebateVal, o: moOddsVal }));
        }

        if (customer.id === selectedCustomerId) {
          if (systemType === 'HK') {
            hkRecs = (activeView === 'stats' ? financeRecords : compoundRecords)
              .map(r => ({ ...r, sys: '港', r: hkRebateVal, o: hkOddsVal }));
          } else {
            moRecs = (activeView === 'stats' ? financeRecords : compoundRecords)
              .map(r => ({ ...r, sys: '澳', r: moRebateVal, o: moOddsVal }));
          }
        }

        // Group by common ID (assigned in handleParse)
        const allCombinedRecs = [...hkRecs, ...moRecs];
        // Deduplicate unified records that exist in both lists
        const dedupedRecs = Array.from(new Map(allCombinedRecs.map(r => [r.id || `ts_${r.timestamp}`, r])).values());
        
        const groupedMap = new Map<string, any[]>();
        dedupedRecs.forEach(r => {
          const key = r.id || `ts_${r.timestamp}`;
          if (!groupedMap.has(key)) groupedMap.set(key, []);
          groupedMap.get(key)!.push(r);
        });

        const sortedKeys = Array.from(groupedMap.keys()).sort((a, b) => {
          const tA = groupedMap.get(a)![0].timestamp;
          const tB = groupedMap.get(b)![0].timestamp;
          return tA - tB;
        });

        const exportRows = sortedKeys.map(key => {
          const records = groupedMap.get(key)!;
          let totalWin = 0;
          let totalPay = 0;
          let totalStake = 0;
          
          // Robust original text lookup: prioritize any valid fullRaw, fallback to joined raw
          let originalText = records.map(r => r.fullRaw).find(f => !!f) || "";
          if (!originalText) {
            // Combine all available raw texts if fullRaw is missing (legacy data)
            originalText = Array.from(new Set(records.map(r => r.raw))).filter(Boolean).join(' | ');
          }

          const previewLines: string[] = [];

          records.forEach(record => {
            let recordWin = 0;
            const isDeduct = record.totalAmount < 0;

            record.items.forEach((item: any) => {
              let itemWin = 0;
              const itemSys = item.system || (record.sys === '澳' ? 'MO' : 'HK');
              const currentOdds = (itemSys === 'MO' || itemSys === '澳') ? moOddsVal : hkOddsVal;
              
              if (activeView === 'stats') {
                let h = 0;
                // Use the state values directly to ensure latest are captured
                const targetSpecial = (itemSys === 'MO' || itemSys === '澳') ? moSpecial : hkSpecial;
                if (targetSpecial && targetSpecial > 0) {
                  h = item.targets.filter((t: any) => t === targetSpecial).length;
                }
                const rawEarn = Math.abs(item.amount) * h;
                itemWin = item.isSplitAmount ? Math.floor(rawEarn) : rawEarn;
              } else {
                const draw = (itemSys === 'MO' || itemSys === '澳') 
                  ? { reg: moDraw.slice(0, 6).filter((n): n is number => n !== null), spec: moDraw[6] }
                  : { reg: hkDraw.slice(0, 6).filter((n): n is number => n !== null), spec: hkDraw[6] };
                
                let win = 0;
                if (item.raw.includes('特碰')) {
                  const hasS = draw.spec !== null && item.targets.includes(draw.spec);
                  const other = item.targets.find((t: any) => t !== draw.spec);
                  const hasR = other !== undefined && draw.reg.includes(other);
                  if (hasS && hasR) win = Math.abs(item.amount);
                } else {
                  const matches = item.targets.filter((t: any) => draw.reg.includes(t)).length;
                  let isW = false;
                  if (item.raw.includes('三中三')) isW = matches === 3;
                  else if (item.raw.includes('二中二')) isW = matches === 2;
                  else if (item.raw.includes('三中二')) isW = matches >= 2;
                  if (isW) win = Math.abs(item.amount);
                }
                itemWin = win;
              }

              recordWin += itemWin;
              const itemPayoff = itemWin * currentOdds;
              totalPay += isDeduct ? -itemPayoff : itemPayoff;
            });

            totalWin += isDeduct ? -recordWin : recordWin;
            totalStake += isDeduct ? -Math.abs(record.totalAmount) : Math.round(Math.abs(record.totalAmount));
            
            let p = record.parsedPreview || '';
            if (isDeduct) p = p.replace(/（合计：(\d+(?:\.\d+)?)）/g, '（合计：-$1）');
            
            // Determine system prefix for display
            const sysPrefix = record.system ? (record.system === 'HK' ? '港' : '澳') : (record.sys || '港');
            // 如果预览文本已经包含了系统前缀（如 [港] 开头），则不再重复添加
            const finalDisplayP = p.startsWith('[') ? p : `[${sysPrefix}] ${p}`;
            previewLines.push(finalDisplayP);
          });

          return {
            originalText,
            identified: previewLines.join('\n'),
            totalStake,
            totalWin: totalWin > 0 ? Math.round(totalWin) : 0,
            totalPay: Math.round(totalPay),
            isDeduct: totalStake < 0
          };
        });

        const wsData = [
          ['原数据', '识别后的数据', '下注金额', '用户中奖金额', '赔付金额（未扣水）'],
          ...exportRows.map(d => [
            d.originalText, 
            d.identified, 
            d.totalStake, 
            d.totalWin > 0 ? Math.round(d.totalWin) : '', 
            d.totalPay !== 0 ? Math.round(d.totalPay) : ''
          ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

        // Style Header
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const ref = XLSX.utils.encode_cell({ r: 0, c: C });
          if (ws[ref]) {
            ws[ref].s = {
              font: { name: "宋体", sz: 11, bold: true },
              alignment: { horizontal: "center", vertical: "center", wrapText: true }
            };
          }
        }

        // Style Data
        exportRows.forEach((d, i) => {
          const r = i + 1;
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const ref = XLSX.utils.encode_cell({ r: r, c: C });
            if (ws[ref]) {
              ws[ref].s = { font: { name: "宋体", sz: 11 }, alignment: { vertical: "center", wrapText: true } };
            }
          }

          if (d.isDeduct) {
             const cellIdentified = XLSX.utils.encode_cell({ r: r, c: 1 });
             if (ws[cellIdentified]) {
               if (!ws[cellIdentified].s.font) ws[cellIdentified].s.font = {};
               ws[cellIdentified].s.font.color = { rgb: "FF0000" };
             }
          }

          const cellC = XLSX.utils.encode_cell({ r: r, c: 2 }); // Bet Amount
          if (ws[cellC]) {
            ws[cellC].s.font.bold = true;
            ws[cellC].s.alignment.horizontal = "center";
            // Restore hidden comment with the full original text on column C
            if (d.originalText) {
              const lines = d.originalText.split('\n');
              let maxW = 0;
              lines.forEach(line => {
                let lw = 0;
                for (let j = 0; j < line.length; j++) {
                  lw += line.charCodeAt(j) > 255 ? 14 : 7; // Chinese approx 14px, else 7px
                }
                if (lw > maxW) maxW = lw;
              });

              ws[cellC].c = [{ 
                t: d.originalText, 
                a: "原数据",
                // Attempt to set comment box dimensions (supported by some xlsx writers)
                p: { 
                  wpx: Math.min(600, Math.max(150, maxW + 20)), 
                  hpx: Math.min(800, Math.max(60, lines.length * 18 + 25))
                }
              } as any];
              // XLSX comments are hidden by default, but we ensure visibility flag is false
              if (ws[cellC].c) {
                (ws[cellC].c as any).hidden = true;
                (ws[cellC].c as any).visible = false;
              }
            }
          }

          const cellD = XLSX.utils.encode_cell({ r: r, c: 3 }); // Win Amount
          if (ws[cellD]) {
            ws[cellD].s.font.bold = true;
            ws[cellD].s.font.color = { rgb: "FF0000" };
            ws[cellD].s.alignment.horizontal = "center";
          }

          const cellE = XLSX.utils.encode_cell({ r: r, c: 4 }); // Net Result
          if (ws[cellE]) {
            ws[cellE].s.alignment.horizontal = "center";
            ws[cellE].s.font.bold = true;
            if (d.totalPay < 0) {
              if (!ws[cellE].s.font) ws[cellE].s.font = {};
              ws[cellE].s.font.color = { rgb: "FF0000" };
            }
          }
        });

        ws['!cols'] = [{ wch: 40 }, { wch: 60 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, customer.name.substring(0, 31));
        totalSheetsAdded++;
      });

      if (totalSheetsAdded === 0) {
        setError('没有可导出的有效数据');
        return;
      }

      const fileName = `全客户报表_${activeView === 'stats' ? '常规' : '复式'}_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export failed:', err);
      setError('导出失败，请重试');
    }
  };

  const renderHighlightedText = (text: string, system?: 'HK' | 'MO') => {
    if (!text) return '';
    const tokens = text.split(/(\d+)/);
    const actualSys = system || systemType;
    const slice = actualSys === 'MO' ? riskNumbers.slice(0, 12) : riskNumbers.slice(12, 24);
    const riskSet = new Set(
      slice
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 49)
    );

    return tokens.map((token, i) => {
      if (/^\d+$/.test(token)) {
        const n = parseInt(token, 10);

        // Context check to avoid highlighting amounts as risk numbers
        const prevToken = i > 0 ? tokens[i - 1] : '';
        const nextToken = i < tokens.length - 1 ? tokens[i + 1] : '';
        const isLikelyAmount = 
          prevToken.includes('各') || 
          prevToken.includes('字') || 
          prevToken.includes('个') ||
          prevToken.includes('合计') || 
          prevToken.includes('共') ||
          prevToken.includes('每个') ||
          prevToken.includes('录入') ||
          prevToken.includes('¥') ||
          prevToken.includes('y') ||
          nextToken.includes('元') ||
          nextToken.includes('米') ||
          nextToken.includes('块') ||
          nextToken.includes(') ') ||
          nextToken.includes('）');

        if (n > 49) {
          return (
            <span key={i} className="text-red-700 font-bold bg-red-100 px-0.5 rounded border border-red-300 mx-0.5" title="超出范围">
              {token}
            </span>
          );
        }
        if (riskSet.has(n) && !isLikelyAmount) {
          return (
            <span key={i} className="text-red-600 font-bold underline decoration-red-600 decoration-2 underline-offset-2">
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
      const tasks = splitBySystem(input);
      let grandTotal = 0;
      const rawLines: string[] = [];
      const previewNodes: React.ReactNode[] = [];

      tasks.forEach((task, taskIdx) => {
        const { system, text } = task;
        const systemChar = system === 'HK' ? '港' : '澳';

        if (activeView === 'compound') {
          const types = ['三中三', '二中二', '三中二', '特碰'];
          const matches: { type: string, index: number }[] = [];
          types.forEach(t => {
            let idx = text.indexOf(t);
            while (idx !== -1) {
              matches.push({ type: t, index: idx });
              idx = text.indexOf(t, idx + 1);
            }
          });
          matches.sort((a, b) => a.index - b.index);

          if (matches.length > 0) {
            const segments: { type: string, content: string }[] = [];
            for (let i = 0; i < matches.length; i++) {
              const start = matches[i].index;
              const end = (i + 1 < matches.length) ? matches[i+1].index : text.length;
              segments.push({
                type: matches[i].type,
                content: text.substring(start + matches[i].type.length, end)
              });
            }

            segments.forEach((seg, sIdx) => {
              const amountMatch = seg.content.match(/(?:各|个|字|每|打|买|下|x|X|￥|:|：|=)?\s*(\d+(\.\d+)?)$/) || 
                                  seg.content.match(/(\d+(\.\d+)?)\s*(?:各|各|个|字|每|打|买|下|x|X|￥|:|：|=)?$/);
              
              let amountPerGroup = 0;
              let contentToProcess = seg.content;

              if (amountMatch) {
                amountPerGroup = parseFloat(amountMatch[1]);
                contentToProcess = seg.content.replace(amountMatch[0], '');
              } else {
                for (let j = sIdx + 1; j < segments.length; j++) {
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
                      segmentCount += count;
                      segmentNumbers.push(numbers.map(n => n.toString().padStart(2, '0')).join(' '));
                    }
                  }
                });

                if (segmentCount > 0) {
                  const subTotal = segmentCount * amountPerGroup;
                  grandTotal += subTotal;
                  const lineText = `${type}: ${segmentNumbers.join(' | ')} 各${amountPerGroup}（合计：${subTotal}）`;
                  rawLines.push(`${lineText} [${systemChar}]`);
                  
                  const allNumbersInSegment = contentToProcess.split(/\n/).flatMap(line => 
                    (line.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 49)
                  );
                  const matchCount = getRiskMatchCount(allNumbersInSegment, system);
                  const isHighRisk = matchCount > 8;

                  previewNodes.push(
                    <div key={`${taskIdx}-${sIdx}`} className={`mb-1 ${isHighRisk ? "text-red-500 font-bold" : ""}`}>
                      <span className="mr-1">[{systemChar}]</span>
                      {renderHighlightedText(lineText, system)}
                    </div>
                  );
                }
              }
            });
          }
        } else {
          const results = parseInput(text);
          results.forEach((res, rIdx) => {
            const count = res.numbers.length;
            const total = count * res.amount;
            grandTotal += total;
            const suffix = res.isSplitAmount ? '（向下取整）' : '';
            const lineText = `${res.raw} 各${res.amount}（合计：${total}）${suffix}`;
            rawLines.push(`${lineText} [${systemChar}]`);

            const matchCount = getRiskMatchCount(res.numbers, system);
            const isHighRisk = matchCount > 8;
            const hasInvalid = /\d+/.test(res.raw) && (res.raw.match(/\d+/g) || []).some(n => parseInt(n, 10) > 49);

            previewNodes.push(
              <div key={`${taskIdx}-${rIdx}`} className={`mb-1 ${hasInvalid ? "bg-red-50" : ""} ${isHighRisk ? "text-red-500 font-bold" : ""}`}>
                <span className="mr-1">[{systemChar}]</span>
                {renderHighlightedText(res.raw, system)}
                <span className={`opacity-70 ml-1 ${isHighRisk ? 'text-red-500' : ''}`}>
                  各{res.amount}（合计：{total}）{suffix}
                </span>
              </div>
            );
          });
        }
      });

      if (previewNodes.length === 0) return { preview: '等待输入...', rawPreview: '等待输入...', total: 0 };
      return { preview: <>{previewNodes}</>, rawPreview: rawLines.join('\n'), total: grandTotal };
    } catch (e) {
      console.error('Format preview error:', e);
      return { preview: '解析错误', rawPreview: '解析错误', total: 0 };
    }
  };

  // 2. 优化：弹窗计算优化。
  // 为了实现秒开感，取消所有人为延迟，并在组件常驻 DOM 时保持预读
  const [modalCalcReady, setModalCalcReady] = useState(true);
  
  const modalResults = useMemo(() => {
    // 弹窗没开或输入为空时，如果已经计算过就不动，没计算过才跳过
    if (!isModalOpen && !standaloneMode && localModalValue.length === 0) {
      return { preview: null, total: 0, items: [] };
    }
    
    return formatModalResults(deferredModalInputValue);
  }, [isModalOpen, standaloneMode, localModalValue.length, deferredModalInputValue, formatModalResults]);

  // 3. 增强弹窗内容的 Memoization，关键：减少不必要的重渲染依赖
  const memoizedModalContent = useMemo(() => {
    return (
      <EntryModalContent
        isOpen={isModalOpen}
        modalMode={modalMode}
        externalValue={localModalValue}
        onValueChange={setLocalModalValue}
        modalResults={modalResults}
        handleParse={handleParse}
        lastSubmittedModalValue={lastSubmittedModalValue}
        setLastSubmittedModalValue={setLastSubmittedModalValue}
        isSubmitting={isSubmitting}
        showLastUndoConfirm={showLastUndoConfirm}
        modalInputRef={modalInputRef}
        previewScrollRef={previewScrollRef}
        systemType={systemType}
        switchSystem={switchSystem}
        isSwitchingSystem={isSwitchingSystem}
        popOutTargetId={popOutTargetId}
        setPopOutTargetId={setPopOutTargetId}
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        customers={customers}
        handlePopOut={handlePopOut}
        standaloneMode={standaloneMode}
        dragControls={dragControls}
        handlePasteAndRecognize={handlePasteAndRecognize}
        triggerLastUndo={triggerLastUndo}
        setIsModalOpen={setIsModalOpen}
        error={error}
        triggerClearAndPaste={triggerClearAndPaste}
        clearConfirmActive={clearConfirmActive}
        ocrLoading={ocrLoading}
        ocrProgress={ocrProgress}
        processImageFile={processImageFile}
      />
    );
  }, [
    isModalOpen, 
    modalCalcReady, // 加入此依赖确保在计算就绪后也刷新一次内部（如果内部未自动刷新）
    modalMode, 
    localModalValue, 
    modalResults, 
    isSubmitting, 
    error,
    popOutTargetId,
    systemType, 
    isSwitchingSystem,
    customers,
    selectedCustomerId,
    lastSubmittedModalValue,
    showLastUndoConfirm,
    standaloneMode,
    handleParse,
    switchSystem,
    handlePopOut,
    handlePasteAndRecognize,
    triggerLastUndo,
    triggerClearAndPaste,
    clearConfirmActive,
    ocrLoading,
    ocrProgress,
    processImageFile,

    setLocalModalValue,
    setLastSubmittedModalValue,
    setIsModalOpen,
    setSelectedCustomerId,
    setPopOutTargetId
  ]);

  if (settingsMode) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-mono text-[#141414] overflow-y-auto overflow-x-hidden">
        <div className="bg-[#141414] text-[#E4E3E0] p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
          <h3 className="text-sm font-mono font-bold uppercase tracking-widest flex items-center gap-2">
            <Settings size={16} />
            系统设置
          </h3>
          <p className="text-[9px] opacity-50 uppercase tracking-tighter">Standalone Settings</p>
        </div>

        <div className="p-6 space-y-6 pb-24">
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
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">智能系统识别</label>
                <p className="text-[10px] font-mono opacity-40">开启后分流港澳关键词。</p>
              </div>
              <button 
                onClick={() => setTempSmartSystemRecognition(!tempSmartSystemRecognition)}
                className={`w-10 h-5 rounded-full transition-colors relative ${tempSmartSystemRecognition ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempSmartSystemRecognition ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">识别框精准撤销</label>
                <p className="text-[10px] font-mono opacity-40">优先匹配流水记录。</p>
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
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">风险值预警跟随客户</label>
              </div>
              <button 
                onClick={() => {
                  const next = !tempFollowCustomerRisk;
                  setTempFollowCustomerRisk(next);
                  if (!next) setTempEnableCustomerEatingReport(false);
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${tempFollowCustomerRisk ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempFollowCustomerRisk ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className={`flex items-center justify-between transition-opacity ${!tempFollowCustomerRisk ? 'opacity-30' : ''}`}>
              <div>
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">开启客户页吃码上报</label>
                <p className="text-[10px] font-mono opacity-40">不再强制切换到汇总模式。</p>
              </div>
              <button 
                onClick={() => tempFollowCustomerRisk && setTempEnableCustomerEatingReport(!tempEnableCustomerEatingReport)}
                disabled={!tempFollowCustomerRisk}
                className={`w-10 h-5 rounded-full transition-colors relative ${tempEnableCustomerEatingReport ? 'bg-indigo-600' : 'bg-gray-300'} ${!tempFollowCustomerRisk ? 'cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempEnableCustomerEatingReport ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">复制后自动粘贴</label>
              </div>
              <button 
                onClick={() => setTempAutoPasteEnabled(!tempAutoPasteEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative ${tempAutoPasteEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempAutoPasteEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>

          {/* 智能图片识别大模型 OCR 设置 */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400">智能图片识别 (OCR)</h4>
            
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold uppercase tracking-widest block">识别引擎</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTempOcrEngine('paddle')}
                  className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition-all ${
                    tempOcrEngine === 'paddle'
                      ? 'border-[#141414] bg-[#141414] text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  本地 OCR (Paddle)
                </button>
                <button
                  type="button"
                  onClick={() => setTempOcrEngine('gemini')}
                  className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition-all ${
                    tempOcrEngine === 'gemini'
                      ? 'border-[#141414] bg-[#141414] text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  Gemini 大模型
                </button>
              </div>
              <p className="text-[10px] font-mono opacity-40">本地 PaddleOCR 软件离线识别，或使用全球领先的 Gemini 大模型精确解析下注数据。</p>
            </div>

            {tempOcrEngine === 'gemini' && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block">Gemini API Key</label>
                  <input
                    type="password"
                    value={tempGeminiApiKey}
                    onChange={(e) => setTempGeminiApiKey(e.target.value)}
                    placeholder="输入您的 Google Gemini API 密钥"
                    className="w-full p-3 font-mono text-xs border-2 border-[#141414] focus:outline-none focus:bg-gray-50"
                  />
                  <div className="flex justify-between items-center text-[9px] font-mono opacity-50">
                    <span>密钥将 100% 仅保存在您的本地个人环境</span>
                    <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 font-bold hover:text-indigo-800">[获取免费 API Key]</a>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold uppercase tracking-widest block">大模型版本</label>
                  <select
                    value={tempGeminiModel}
                    onChange={(e) => setTempGeminiModel(e.target.value)}
                    className="w-full p-3 font-mono text-xs border-2 border-[#141414] bg-white focus:outline-none focus:bg-gray-50 cursor-pointer"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (推荐：高性价比)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (超强手写复杂排版分析)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-mono font-bold uppercase tracking-widest block">软件分辨率</label>
                <p className="text-[10px] font-mono opacity-40">紧凑模式 (730x658)</p>
              </div>
              <button 
                onClick={() => {
                  const next = !tempCompactMode;
                  setTempCompactMode(next);
                  if (next) {
                    setTempWidth(730);
                    setTempHeight(658);
                  } else {
                    setTempWidth(1420);
                    setTempHeight(903);
                  }
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${tempCompactMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempCompactMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">宽度 (Width)</span>
                <input 
                  type="number"
                  value={tempWidth}
                  onChange={(e) => setTempWidth(parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#141414] outline-none"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">高度 (Height)</span>
                <input 
                  type="number"
                  value={tempHeight}
                  onChange={(e) => setTempHeight(parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#141414] outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t-2 border-[#141414] z-20">
          <button 
            onClick={() => {
              setOdds(tempOdds);
              setRebate(tempRebate);
              setEnableSearchUndo(tempEnableSearchUndo);
              setSmartSystemRecognition(tempSmartSystemRecognition);
              setRequireUndoConfirm(tempRequireUndoConfirm);
              setAutoPasteEnabled(tempAutoPasteEnabled);
              setFollowCustomerRisk(tempFollowCustomerRisk);
              setEnableCustomerEatingReport(tempEnableCustomerEatingReport);
              setOcrEngine(tempOcrEngine);
              setGeminiApiKey(tempGeminiApiKey);
              setGeminiModel(tempGeminiModel);
              
              // Physical Sync to localStorage
              localStorage.setItem(getSysKey('odds'), tempOdds.toString());
              localStorage.setItem(getSysKey('rebate'), tempRebate.toString());
              localStorage.setItem(getSysKey('enableSearchUndo'), tempEnableSearchUndo.toString());
              localStorage.setItem(getSysKey('smartSystemRecognition'), tempSmartSystemRecognition.toString());
              localStorage.setItem(getSysKey('requireUndoConfirm'), tempRequireUndoConfirm.toString());
              localStorage.setItem(getSysKey('autoPasteEnabled'), tempAutoPasteEnabled.toString());
              localStorage.setItem(getSysKey('followCustomerRisk'), tempFollowCustomerRisk.toString());
              localStorage.setItem(getSysKey('enableCustomerEatingReport'), tempEnableCustomerEatingReport.toString());
              localStorage.setItem('isCompactMode', tempCompactMode.toString());
              localStorage.setItem('customWidth', tempWidth.toString());
              localStorage.setItem('customHeight', tempHeight.toString());
              localStorage.setItem('ocr_engine', tempOcrEngine);
              localStorage.setItem('gemini_api_key', tempGeminiApiKey);
              localStorage.setItem('gemini_model', tempGeminiModel);
              
              if (window.electron) {
                window.electron.send('resize-main-window', { width: tempWidth, height: tempHeight });
                window.electron.notifySettingsUpdated?.();
              }
            }}
            className="w-full bg-[#141414] text-[#E4E3E0] py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-[#333] active:bg-black active:scale-[0.98] transition-all transform duration-100"
          >
            保存设置
          </button>
        </div>
      </div>
    );
  }

  if (standaloneMode) {
    return (
      <div className="fixed inset-0 bg-[#F2F1ED] p-4 flex flex-col font-sans tracking-tight overflow-hidden">
        <div 
          className="flex items-center justify-between border-b-2 border-[#141414] pb-2 mb-4 shrink-0 select-none"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <Calculator size={18} />
            <span className="text-xl font-serif italic font-bold">智能录入助手</span>
          </div>
          <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <span className="text-[10px] font-mono font-bold text-white px-2 py-0.5 bg-blue-600 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Smart Capture
            </span>
            <span className={`text-[10px] font-mono font-bold text-white px-2 py-0.5 uppercase ${modalMode === 'deduct' ? 'bg-red-600' : 'bg-[#141414]'}`}>
              {modalMode === 'deduct' ? 'Deduct Mode' : 'Record Mode'}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0 select-text" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <div className="flex-1 flex flex-col space-y-1 min-h-0 relative">
            <div className="flex justify-between items-center">
              <label className="text-lg font-serif font-bold italic">需识别文字:</label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono font-bold uppercase">录入给:</span>
                <select 
                  value={popOutTargetId}
                  onChange={(e) => setPopOutTargetId(e.target.value)}
                  className="bg-white border-2 border-[#141414] px-2 py-0.5 text-[11px] font-mono font-bold focus:outline-none focus:bg-yellow-50 appearance-none pr-6 relative"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23141414%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem top 50%', backgroundSize: '0.65rem auto' }}
                >
                  <option value="default" disabled hidden={customers.length > 1}>请选择客户</option>
                  {customers.filter(c => c.id !== 'default').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {ocrLoading && (
              <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-500 animate-pulse">
                <div className="text-sm font-mono font-bold text-indigo-700 mb-1">📷 {ocrProgress}</div>
                <div className="text-[10px] text-gray-400 font-mono">离线安全通道：100% 物理级单机解析，不消耗外部网络流量</div>
              </div>
            )}
            <textarea
              key={textareaKey}
              ref={standaloneInputRef}
              value={modalInputValue}
              autoFocus
              spellCheck={false}
              onChange={(e) => {
                setModalInputValue(e.target.value);
                setLocalModalValue(e.target.value);
              }}
              onPaste={async (e) => {
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                      e.preventDefault();
                      await processImageFile(file);
                    }
                  }
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setStandaloneIsDragging(true); }}
              onDragLeave={() => setStandaloneIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setStandaloneIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  if (file.type.startsWith('image/')) {
                    await processImageFile(file);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (showLastUndoConfirm) return;
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleParse(false, modalInputValue);
                }
              }}
              onPointerDown={(e) => {
                // 彻底阻止冒泡并强制聚焦
                e.stopPropagation();
                window.focus();
                e.currentTarget.focus();
              }}
              onClick={(e) => {
                e.stopPropagation();
                window.focus();
                standaloneInputRef.current?.focus();
              }}
              placeholder={standaloneIsDragging ? "松开鼠标载入并识别图片内容 (PaddleOCR-json)..." : "请在此输入内容（支持直接粘贴截图或拖入图片文件进行本地OCR极速识别）..."}
              className={`w-full flex-1 p-3 font-mono text-base border-2 focus:border-blue-500 focus:outline-none transition-all resize-none shadow-inner cursor-text relative z-10 ${
                standaloneIsDragging ? "border-dashed border-indigo-500 bg-indigo-50/50 scale-[0.99]" : "border-gray-400 bg-white"
              }`}
              style={{ WebkitAppRegion: 'no-drag', caretColor: '#141414', userSelect: 'text', WebkitUserSelect: 'text' } as any}
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col space-y-1">
            <div className="flex justify-between items-end">
              <label className="text-lg font-serif font-bold italic">识别的结果:</label>
              <span className="text-lg font-mono font-bold text-blue-600">
                估算总额: ¥{modalResults.total.toLocaleString()}
              </span>
            </div>
            <div 
              ref={standalonePreviewScrollRef}
              className="flex-1 w-full p-3 font-mono text-base border-2 border-gray-400 bg-[#F5F5F0] overflow-y-auto whitespace-pre-wrap break-all shadow-inner"
            >
              {modalResults.preview}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-2 text-xs text-red-700 font-mono animate-pulse">
              {error}
            </div>
          )}

          <div className="grid grid-cols-5 gap-1 pt-2">
            <button onClick={() => handlePasteAndRecognize()} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">粘贴识别</button>
            <button 
              onClick={() => {
                standaloneInputRef.current?.focus();
                setLastSubmittedModalValue('');
              }} 
              className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap"
            >
              重新识别
            </button>
            <button onClick={() => setModalInputValue('')} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">清内容</button>
            <button onClick={triggerLastUndo} className="bg-white hover:bg-gray-100 border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap">撤销</button>
            <button 
              onClick={() => triggerClearAndPaste()}
              className={`${
                clearConfirmActive 
                  ? "bg-red-600 hover:bg-red-700 border-red-700 text-white animate-pulse" 
                  : "bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-900 active:bg-amber-300"
              } border py-2.5 text-[10px] font-bold transition-all rounded-none shadow-sm whitespace-nowrap font-bold`}
            >
              {clearConfirmActive ? '⚠️ 再次点击确认清空！' : '清空数据并粘贴'}
            </button>
          </div>
          
          <div className="grid grid-cols-5 gap-1 mt-1">
            <button 
              onClick={() => handleParse(false, modalInputValue)} 
              disabled={!modalInputValue.trim() || isSubmitting || modalInputValue === lastSubmittedModalValue} 
              className="col-span-4 bg-[#141414] hover:bg-[#2a2a2a] text-white py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale"
            >
              <Plus size={18} />
              {isSubmitting ? '处理中...' : '保存下单'}
            </button>
            <button 
              onClick={() => handleParse(true, modalInputValue)} 
              disabled={!modalInputValue.trim() || isSubmitting || modalInputValue === lastSubmittedModalValue} 
              className="col-span-1 bg-red-600 hover:bg-red-700 text-white py-4 text-xs font-bold transition-all flex items-center justify-center gap-1 mt-1 disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale"
            >
              <Minus size={14} />
              {isSubmitting ? '...' : '扣除'}
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
                      className={`flex-1 border-2 border-[#141414] py-2 font-mono text-[10px] font-bold transition-all ${
                        undoModalFocus === 'confirm' 
                          ? 'bg-red-600 text-white translate-x-[1px] translate-y-[1px] shadow-none' 
                          : 'bg-white text-[#141414] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                      }`}
                    >
                      确认撤销
                    </button>
                    <button 
                      onClick={() => {
                        setShowLastUndoConfirm(false);
                        setUndoCallback(null);
                      }}
                      className={`flex-1 border-2 border-[#141414] py-2 font-mono text-[10px] font-bold transition-all ${
                        undoModalFocus === 'cancel' 
                          ? 'bg-red-600 text-white translate-x-[1px] translate-y-[1px] shadow-none' 
                          : 'bg-white text-[#141414] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                      }`}
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

  // Get risk data to display based on setting
  const riskDisplayData = useMemo(() => {
    // 汇总模式下，直接使用内存中已经聚合好的状态。这样在执行吃码上报（setEatenAmounts）后排名会立即更新。
    if (selectedCustomerId === 'default') {
      return { bet: displayBetData, eaten: eatenAmounts };
    }

    if (!followCustomerRisk) {
      // 关闭跟随（全局模式）：统计所有正式客户的总数据用于风险计算
      const aggregateBetData: Record<number, number> = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));
      const aggregateEaten: Record<number, number> = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i + 1, 0]));

      customers.forEach(c => {
        // 包括 'default' 客户，因为汇总模式下执行的吃码可能存在于 default 的本地存储中
        const saved = localStorage.getItem(getSysKey(`customer_state_${c.id}`));
        if (saved) {
          const data = JSON.parse(saved);
          if (data.financeBetData && c.id !== 'default') { // 不要重复统计汇总页自身的 betData（如果有的话）
            const coeffSaved = localStorage.getItem(`coefficient_${c.id}`);
            const coeff = coeffSaved ? parseFloat(coeffSaved) : 1.0;
            Object.entries(data.financeBetData).forEach(([num, val]) => {
              const n = parseInt(num);
              const v = (val as number || 0);
              // 根据系数缩放并累加
              aggregateBetData[n] = (aggregateBetData[n] || 0) + Math.round(v * coeff);
            });
          }
          if (data.eatenAmounts) {
            Object.entries(data.eatenAmounts).forEach(([num, val]) => {
              const n = parseInt(num);
              const v = (val as number || 0);
              // 同步累计各客户已上报的数据
              aggregateEaten[n] = (aggregateEaten[n] || 0) + v;
            });
          }
        }
      });
      return { bet: aggregateBetData, eaten: aggregateEaten };
    }
    // 跟随模式：直接返回当前客户数据
    return { bet: financeBetData, eaten: eatenAmounts };
  }, [selectedCustomerId, followCustomerRisk, financeBetData, displayBetData, eatenAmounts, customers]);

  const appLayout = useMemo(() => (
    <div 
      className="w-full h-full bg-white text-[#141414] font-sans flex overflow-hidden relative shadow-xl"
    >
        {/* Sidebar Navigation (Overlay Mode) */}
        <AnimatePresence>
          {isSidebarVisible && !isCompactMode && (
            <>
              {/* Overlay Background */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarVisible(false)}
                className="absolute inset-0 bg-black/20 z-[45]"
              />
              <motion.aside 
                initial={{ x: -200 }}
                animate={{ x: 0 }}
                exit={{ x: -200 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute left-0 top-0 h-full w-[200px] bg-[#f5f5f5] border-r border-gray-200 flex flex-col z-50 shadow-2xl"
              >
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b border-gray-200">
                    <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-gray-800">财务智能统计</h1>
                    <div className="flex items-center justify-between mt-2">
                       <p className="text-[9px] font-mono opacity-50 uppercase">v2.4</p>
                       <div className="flex bg-gray-200 p-0.5 rounded text-[9px] font-bold">
                          <button 
                            onClick={() => switchSystem('HK')}
                            className={`px-2 py-0.5 rounded ${systemType === 'HK' ? 'bg-[#141414] text-white shadow-sm' : 'text-gray-500'}`}
                          >
                            香港
                          </button>
                          <button 
                            onClick={() => switchSystem('MO')}
                            className={`px-2 py-0.5 rounded ${systemType === 'MO' ? 'bg-[#141414] text-white shadow-sm' : 'text-gray-500'}`}
                          >
                            新澳门
                          </button>
                       </div>
                    </div>
                  </div>
                  
                  <nav className="flex-1 p-3 space-y-2">
                    <div className="space-y-1">
                      <label className="px-3 text-[9px] font-mono font-bold uppercase opacity-40">主要功能</label>
                      <button 
                        onClick={() => { setActiveView('stats'); setIsSidebarVisible(false); }}
                        className={`w-full h-11 flex items-center gap-3 px-4 rounded-md transition-all ${activeView === 'stats' ? 'bg-[#141414] text-white shadow-md' : 'text-gray-600 hover:bg-black/5'}`}
                      >
                        <Calculator size={18} />
                        <span className="text-sm font-bold">财务统计</span>
                      </button>
                      <button 
                        onClick={() => { setActiveView('compound'); setIsSidebarVisible(false); }}
                        className={`w-full h-11 flex items-center gap-3 px-4 rounded-md transition-all ${activeView === 'compound' ? 'bg-[#141414] text-white shadow-md' : 'text-gray-600 hover:bg-black/5'}`}
                      >
                        <TrendingUp size={18} />
                        <span className="text-sm font-bold">复式管理</span>
                      </button>
                      <button 
                        onClick={() => { 
                          setActiveView('eating'); 
                          if (!enableCustomerEatingReport) {
                            setSelectedCustomerId('default');
                          }
                          setIsSidebarVisible(false); 
                        }}
                        className={`w-full h-11 flex items-center gap-3 px-4 rounded-md transition-all ${activeView === 'eating' ? 'bg-[#141414] text-white shadow-md' : 'text-gray-600 hover:bg-black/5'}`}
                      >
                        <Upload size={18} />
                        <span className="text-sm font-bold">吃码上报</span>
                      </button>
                    </div>

                    <div className="pt-4 space-y-1">
                      <label className="px-3 text-[9px] font-mono font-bold uppercase opacity-40">数据操作</label>
                      <button 
                        onClick={() => { 
                          if (window.electron) {
                             window.electron.showSettingsWindow();
                          } else {
                             setIsSettingsOpen(true); 
                          }
                          setIsSidebarVisible(false); 
                        }}
                        className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-gray-600 hover:bg-black/5 transition-all"
                      >
                        <Settings size={18} />
                        <span className="text-sm font-bold">系统设置</span>
                      </button>
                      <button 
                        onClick={() => { handleExport(); setIsSidebarVisible(false); }}
                        className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-gray-600 hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 transition-all"
                      >
                        <Download size={18} />
                        <span className="text-sm font-bold">导出报表</span>
                      </button>
                      <button 
                        onClick={() => { setShowFactoryResetConfirm(true); setIsSidebarVisible(false); }}
                        className="w-full h-11 flex items-center gap-3 px-4 rounded-md text-red-600 hover:bg-red-50 transition-all"
                      >
                        <Trash2 size={18} />
                        <span className="text-sm font-bold">软件数据清零</span>
                      </button>
                    </div>
                  </nav>

                  <div className="p-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-mono font-bold">系统在线</span>
                    </div>
                    <div className="text-[10px] font-mono opacity-30">
                        © 2026 LOTTERY SYSTEM
                    </div>
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Workspace Frame */}
        <main className="w-full flex flex-col min-w-0 bg-white">
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
            <div className="grid grid-cols-14 gap-4 flex-1 min-h-0">
          {activeView === 'stats' ? (
            <>
              {/* Left Column: Number Distribution Matrix */}
              <div 
                className={`${isCompactMode ? 'col-span-14' : 'lg:col-span-8'} flex flex-col h-full min-h-0 transition-all duration-300`}
              >
                <section className={`${isCompactMode ? 'max-w-6xl mx-auto w-full' : ''} bg-white border border-[#141414] p-4 h-full flex flex-col overflow-hidden`}>
                  <div className="flex flex-col gap-1 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                          className={`p-1.5 hover:bg-gray-100 transition-all rounded flex items-center justify-center ${isSidebarVisible ? 'text-[#141414] bg-gray-100' : 'text-gray-500'}`}
                          title={isSidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
                        >
                          <Menu size={16} />
                        </button>
                        <Hash size={16} />
                        <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest">号码分布矩阵</h2>
                        <button 
                          onClick={() => switchSystem(systemType === 'HK' ? 'MO' : 'HK')}
                          disabled={isSwitchingSystem}
                          className={`px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${isSwitchingSystem ? 'opacity-50 cursor-wait' : ''} ${systemType === 'HK' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 hover:bg-indigo-200' : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'}`}
                        >
                          {isSwitchingSystem ? '切换中...' : (systemType === 'HK' ? '香港系统' : '新澳门系统')}
                        </button>
                        
                        {/* Customer Selector Section */}
                        {activeView !== 'eating' && (
                          <div className="flex items-center gap-2">
                            <div className="relative" ref={customerDropdownRef}>
                              <button 
                                onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                                className={`flex items-center gap-2 px-3 py-1 border border-[#141414] min-w-[120px] justify-between text-[10px] font-mono hover:bg-gray-50 transition-all rounded bg-white ${isCustomerDropdownOpen ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <User size={12} className="text-gray-500" />
                                  <span className="truncate text-[13px] font-bold">
                                    {customers.find(c => c.id === selectedCustomerId)?.name || '未选择客户'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] bg-blue-600 text-white px-1 rounded font-bold">{Math.round(currentCoefficient * 100)}%</span>
                                  <ChevronDown size={12} />
                                </div>
                              </button>
                              
                              <AnimatePresence>
                                {isCustomerDropdownOpen && (
                                  <motion.div 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    className="absolute left-0 top-full mt-1 w-48 bg-white border border-[#141414] shadow-xl z-50 py-1"
                                  >
                                    <div className="px-2 py-1.5 border-b border-gray-100 mb-1">
                                      <span className="text-[10px] text-gray-400 font-mono uppercase">本地客户数据库</span>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                      {customers.map(customer => (
                                        <div
                                          key={customer.id}
                                          onClick={() => {
                                            setSelectedCustomerId(customer.id);
                                            setIsCustomerDropdownOpen(false);
                                          }}
                                          className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-gray-50 transition-colors flex items-center justify-between cursor-pointer group ${selectedCustomerId === customer.id ? 'bg-gray-50 text-blue-600' : ''}`}
                                        >
                                            <div className="flex items-center gap-2">
                                              {customer.name}
                                              {selectedCustomerId === customer.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                            </div>
                                            
                                            {customer.id !== 'default' && (
                                              <div className="flex items-center gap-0.5 opacity-100 transition-all">
                                                <button 
                                                  onClick={(e) => moveCustomerUp(customer.id, e)}
                                                  className="p-1 text-black hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                                  title="上移"
                                                  disabled={customers.findIndex(c => c.id === customer.id) <= 1}
                                                >
                                                  <ChevronUp size={12} strokeWidth={3} className={customers.findIndex(c => c.id === customer.id) <= 1 ? 'opacity-20' : ''} />
                                                </button>
                                                <button 
                                                  onClick={(e) => moveCustomerDown(customer.id, e)}
                                                  className="p-1 text-black hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                                  title="下移"
                                                  disabled={customers.findIndex(c => c.id === customer.id) === customers.length - 1}
                                                >
                                                  <ChevronDown size={12} strokeWidth={3} className={customers.findIndex(c => c.id === customer.id) === customers.length - 1 ? 'opacity-20' : ''} />
                                                </button>
                                                <div className="w-px h-3 bg-gray-200 mx-0.5" />
                                                <button 
                                                  onClick={(e) => handleDeleteCustomer(customer.id, e)}
                                                  className="p-1 text-black hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                                  title="删除客户"
                                                >
                                                  <Trash2 size={12} strokeWidth={3} />
                                                </button>
                                              </div>
                                            )}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="border-t border-gray-100 mt-1 pt-1">
                                      <button 
                                        onClick={() => {
                                          setIsAddCustomerModalOpen(true);
                                          setIsCustomerDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-gray-50 text-blue-600 flex items-center gap-2"
                                      >
                                        <UserPlus size={12} />
                                        创建新客户库
                                      </button>
                                      <button 
                                        onClick={() => {
                                          setIsFormulaModalOpen(true);
                                          setIsCustomerDropdownOpen(false);
                                          // If on summary page, default to first real customer
                                          const firstRealCustomer = customers.find(c => c.id !== 'default');
                                          const targetId = selectedCustomerId === 'default' ? (firstRealCustomer?.id || 'default') : selectedCustomerId;
                                          setFormulaTargetId(targetId);
                                          const saved = localStorage.getItem(`coefficient_${targetId}`);
                                          const val = saved ? parseFloat(saved) : 1.0;
                                          setTempCoefficient(Math.round(val * 100).toString());
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-gray-50 text-blue-600 flex items-center gap-2"
                                      >
                                        <Percent size={12} />
                                        系数设置 (1%-100%)
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={toggleCompactMode}
                          className="ml-2 px-2 py-0.5 border border-[#141414] text-[10px] font-mono hover:bg-[#141414] hover:text-white transition-all rounded whitespace-nowrap"
                        >
                          {isCompactMode ? '放大' : '缩小'}
                        </button>
                      </div>

                      <div className="flex items-center gap-4">
                        {(enableCustomerEatingReport || isCompactMode) && (
                          <button 
                            onClick={() => {
                              setActiveView('eating');
                              if (!enableCustomerEatingReport) {
                                setSelectedCustomerId('default');
                              }
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[10px] font-mono hover:bg-blue-700 transition-all rounded shadow-[2px_2px_0_0_#141414] active:translate-y-0.5"
                          >
                            <Upload size={12} />
                            吃码上报
                          </button>
                        )}
                        <button 
                          id="copy-data-btn"
                          onClick={handleCopyData}
                          disabled={totalTurnover === 0}
                          className="flex items-center gap-1.5 px-2 py-1 bg-[#141414] text-white text-[10px] font-mono hover:bg-opacity-80 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Copy size={12} />
                          复制数据
                        </button>
                        <button 
                          onClick={handleClearBoard}
                          className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[10px] font-mono hover:bg-red-700 transition-all shadow-[2px_2px_0_0_#141414] active:translate-y-0.5"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                          清空面板
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col mt-1 mb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-xl font-mono font-bold text-black font-sans">客户港澳总和：</span>
                          <span className="text-xl font-mono font-bold text-black">¥{clientBothSystemsTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase">香港特码</span>
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
                            className={`w-12 h-6 border-2 border-[#141414] bg-white text-center text-[11px] font-mono font-bold focus:bg-gray-50 transition-colors uppercase outline-none ${auxSpecialNumber && auxSpecialNumber > 0 ? 'bg-gray-100' : ''}`}
                          />
                          <span className="text-[10px] font-mono uppercase ml-2">澳门特码</span>
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
                            className={`w-12 h-6 border-2 border-[#141414] bg-white text-center text-[11px] font-mono font-bold focus:bg-yellow-100 transition-colors uppercase outline-none ${specialNumber && specialNumber > 0 ? 'bg-yellow-50' : ''}`}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-500 font-mono">
                        <div>澳-当前客户合计: <span className="font-semibold text-gray-900">¥{macauTotal.toLocaleString()}</span></div>
                        <div>港-当前客户合计: <span className="font-semibold text-gray-900">¥{hkTotal.toLocaleString()}</span></div>
                      </div>
                    </div>
                  </div>

                  <MemoizedNumberMatrix 
                    financeBetData={summaryMatrixData}
                    specialNumber={specialNumber}
                    auxSpecialNumber={auxSpecialNumber}
                    isCompactMode={isCompactMode}
                  />

                  {/* History Section moved inside Matrix */}
                  {!isCompactMode && (
                    <div className="mt-2 pt-2 border-t border-[#141414] border-opacity-10 flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <History size={14} />
                          <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest">录入流水</h2>
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
                            const winningAmount = record.items.reduce((sum, item) => {
                              let hits = 0;
                              // System-aware win calculation
                              const itemSys = (item as any).system || record.system || (record.sys === '澳' ? 'MO' : 'HK');
                              if (itemSys === 'HK') {
                                if (auxSpecialNumber && auxSpecialNumber > 0) {
                                  hits += item.targets.filter(t => t === auxSpecialNumber).length;
                                }
                              } else {
                                if (specialNumber && specialNumber > 0) {
                                  hits += item.targets.filter(t => t === specialNumber).length;
                                }
                              }
                              const earn = hits * item.amount;
                              return sum + (item.isSplitAmount ? Math.floor(earn) : earn);
                            }, 0);

                            return (
                              <div key={record.id} className={`group ${index === arr.length - 1 ? '' : 'border-b border-dashed border-[#141414] border-opacity-10'} pb-1 relative overflow-hidden`}>
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono">{record.time}</span>
                                    {selectedCustomerId === 'default' && record.customerName && (
                                      <span className="text-[10px] font-mono px-1 bg-gray-100 text-gray-500 rounded">{record.customerName}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {winningAmount > 0 && (
                                      <span className="text-[10px] font-mono font-bold bg-yellow-400 px-1 rounded">中金: ¥{winningAmount}</span>
                                    )}
                                    <span className={`text-[11px] font-mono font-bold ${record.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {record.totalAmount >= 0 ? '+' : ''}¥{Math.round(record.totalAmount)}
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
                                  // Check if any item in this record has >8 matches with risk numbers for its system
                                  const isHighRisk = record.items.some(item => getRiskMatchCount(item.targets, record.system || (item as any).system || systemType) > 8);
                                  const displayInfo = record.parsedPreview || record.raw;
                                  return (
                                    <p className={`text-[11px] font-mono break-words mt-0.5 pr-8 leading-tight ${isHighRisk ? 'text-red-500 font-bold' : ''}`}>
                                      {/* Only show prefix if it's a legacy record with record.system defined and no parsedPreview */}
                                      {record.system && !record.parsedPreview && <span className="mr-1">[{record.system === 'HK' ? '港' : '澳'}]</span>}
                                      {renderHighlightedText(displayInfo, record.system as any)}
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
                                          onClick={() => {
                                            if (standaloneMode) {
                                              const signal = { recordId: record.id, timestamp: Date.now() };
                                              if (window.electron) window.electron.send('undo-entry', signal);
                                              else localStorage.setItem(getSysKey('LOTTERY_UNDO_REQUEST'), JSON.stringify(signal));
                                            }
                                            handleUndo(record.id);
                                          }}
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
                  )}
                </section>
              </div>

              {/* Middle Column: Input & History & Settings */}
              {!isCompactMode && (
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

                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        handlePopOut();
                      }}
                      className="w-full text-[#E4E3E0] py-4 font-mono text-base font-bold hover:bg-opacity-90 transition-all active:translate-y-1 flex items-center justify-center gap-2 bg-[#141414]"
                    >
                      <Plus size={20} />
                      录入下注
                    </button>
                  </div>
                </section>

                <section className="bg-white border border-[#141414] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Upload size={16} />
                      <h2 className="text-xs font-mono font-bold uppercase tracking-widest">报单系统</h2>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setActiveView('eating');
                        if (!enableCustomerEatingReport) {
                          setSelectedCustomerId('default');
                        }
                      }}
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
                      今日特别注意号码
                    </button>
                  </div>
                </section>
              </div>
            )}

              {/* Right Column: Risk Analysis (Vertical List) */}
              {!isCompactMode && (
                <div 
                  className="lg:col-span-3 flex flex-col h-full min-h-0"
                >
                  <section className="bg-white border border-[#141414] flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-2 py-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <User size={12} className="opacity-40" />
                      <select 
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="text-[10px] font-mono font-bold border-none bg-transparent focus:ring-0 cursor-pointer p-0 h-4 min-w-[60px]"
                      >
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <MemoizedRiskAnalysisRanking 
                    riskDisplayData={riskDisplayData}
                    rebate={rebate}
                    odds={odds}
                    threshold={eatingThreshold}
                  />
                </section>
                </div>
              )}
            </>
          ) : activeView === 'eating' ? (
            <div className="col-span-14 flex flex-col gap-4 h-full min-h-0">
               <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
                  {/* Left: Actions + Matrix */}
                  <div className="col-span-9 flex flex-col gap-4 h-full min-h-0">
                    {/* Eating View Header - Now width matched with matrix */}
                    <div className="flex items-center justify-between bg-white border border-[#141414] p-4 shrink-0">
                       <div className="flex items-center gap-4">
                         <button 
                           onClick={() => setActiveView('stats')}
                           className="flex items-center gap-2 hover:bg-gray-50 px-2 py-1 -ml-2 rounded transition-colors group"
                           title="返回财务统计"
                         >
                           <CornerUpLeft size={20} className="text-blue-600 group-hover:scale-110 transition-transform" />
                           <h1 className="text-xl font-serif italic font-bold whitespace-nowrap">吃码上报</h1>
                         </button>
                         <button 
                           onClick={() => switchSystem(systemType === 'HK' ? 'MO' : 'HK')}
                               disabled={isSwitchingSystem}
                               className={`px-3 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ml-2 whitespace-nowrap ${isSwitchingSystem ? 'opacity-50 cursor-wait' : ''} ${systemType === 'HK' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 hover:bg-indigo-200' : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'}`}
                             >
                               {isSwitchingSystem ? '切换中...' : (systemType === 'HK' ? '香港系统' : '新澳门系统')}
                             </button>
                         <div className="h-8 w-px bg-gray-200" />
                         <div className="flex flex-col">
                            <span className="text-[10px] font-mono opacity-50 uppercase whitespace-nowrap">当前吃码纯利</span>
                            <span className="text-2xl font-mono font-bold text-blue-600">
                              ¥{(Object.values(eatenAmounts) as number[]).reduce((a, b) => a + b, 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                         </div>
                       </div>

                       <div className="flex items-center gap-6">
                         <div className="flex flex-col items-start min-w-[180px]">
                           <label className="text-[10px] font-mono font-bold uppercase mb-1">
                             {eatingMode === 'threshold' ? '设定风险容忍限额 (亏损额)' : '设定自留保留比例 (%)'}
                           </label>
                           <div className="flex items-center gap-2">
                             <span className="text-sm font-mono font-bold">
                               {eatingMode === 'threshold' ? '- ¥' : '%'}
                             </span>
                             {eatingMode === 'threshold' ? (
                               <input 
                                 type="number"
                                 value={eatingThreshold}
                                 onChange={(e) => setEatingThreshold(Math.abs(parseInt(e.target.value) || 0))}
                                 className="w-32 h-10 border-2 border-[#141414] text-center font-mono font-bold text-lg focus:bg-blue-50 outline-none"
                               />
                             ) : (
                               <input 
                                 type="number"
                                 value={eatingPercentage}
                                 onChange={(e) => setEatingPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                 className="w-32 h-10 border-2 border-[#141414] text-center font-mono font-bold text-lg focus:bg-indigo-50 outline-none"
                               />
                             )}
                           </div>
                         </div>

                         <button 
                           onClick={() => setEatingMode(prev => prev === 'threshold' ? 'percentage' : 'threshold')}
                           className={`px-4 py-2 font-mono font-bold text-xs border-2 border-[#141414] transition-all active:translate-y-0.5 shadow-[2px_2px_0_0_#141414] whitespace-nowrap h-10 flex items-center justify-center ${eatingMode === 'percentage' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-[#141414]'}`}
                         >
                           {eatingMode === 'threshold' ? '百分比吃码' : '固定风险吃码'}
                         </button>

                         <button 
                           onClick={handleEatCodes}
                           className="bg-blue-600 text-white px-5 py-3 font-mono font-bold hover:bg-blue-700 transition-all active:translate-y-1 shadow-[4px_4px_0_0_#141414] whitespace-nowrap h-10 flex items-center justify-center font-bold"
                           title="计算并保存吃码结果，更新汇总页实地风险"
                         >
                           执行上报
                         </button>
                         
                         <div className="flex items-center gap-4">
                           <button 
                             onClick={handleResetEaten}
                             className="bg-white border-2 border-red-600 text-red-600 px-6 py-3 font-mono font-bold hover:bg-red-50 transition-all active:translate-y-1 shadow-[4px_4px_0_0_#141414] whitespace-nowrap h-10 flex items-center justify-center"
                           >
                             清空上报
                           </button>
                         </div>
                       </div>
                    </div>

                    {/* Matrix Preview Container */}
                    <div className="bg-white border border-[#141414] p-4 flex flex-col flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Hash size={16} />
                        <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest">号码分布矩阵 (吃码预览: x={eatingLimitX.toFixed(0)})</h2>
                      </div>
                      <div className="flex items-center gap-3">
                        {enableCustomerEatingReport && (
                          <select 
                            value={selectedCustomerId}
                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                            className="text-[10px] font-mono font-bold border border-gray-300 rounded px-1.5 h-6 bg-white mr-1 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                          >
                            {customers.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex items-center gap-1.5 mr-2">
                          <input 
                            type="checkbox" 
                            id="show-preview"
                            checked={showEatingPreview}
                            onChange={(e) => setShowEatingPreview(e.target.checked)}
                            className="w-3.5 h-3.5 border-gray-300 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <label htmlFor="show-preview" className="text-[11px] font-mono font-bold cursor-pointer select-none">显示吃码预警</label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 bg-amber-50 border border-amber-200" />
                          <span className="text-[10px] text-black font-mono">建议上报</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 bg-blue-50 border border-blue-200" />
                          <span className="text-[10px] text-black font-mono">已受控</span>
                        </div>
                      </div>
                    </div>

                    {/* Header for columns */}
                    <div className="grid grid-cols-5 gap-x-2 gap-y-0.5 mb-1 bg-gray-50 py-1 border-y border-gray-200">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-0.5">
                          <div className="min-w-[42px]"></div>
                          <div className="flex-1 flex gap-1">
                            <div className="flex-1 text-[9px] font-black text-black text-center">汇总数</div>
                            <div className="flex-1 text-[9px] font-black text-black text-center">余下上报</div>
                          </div>
                        </div>
                      ))}
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
                          const amountRaw = displayBetData[num] || 0;
                          const toReportTotal = (previewReportedData[num] as number) || 0;
                          const alreadyReported = eatenAmounts[num] || 0;
                          
                          const textColor = getBallTextColor(num);
                          const zodiac = getZodiacByNumber(num);
                          
                          // Styling logic:
                          // Amber: Needs NEW reporting (total suggested > already established)
                          // Blue: Safe or already fully reported (amount > 0 and no new reporting needed)
                          const needsMoreReport = showEatingPreview && toReportTotal > alreadyReported;
                          const isFullyReported = showEatingPreview && amountRaw > 0 && toReportTotal > 0 && toReportTotal <= alreadyReported;
                          const moreAmount = needsMoreReport ? (toReportTotal - alreadyReported) : 0;
                          
                          // "汇总数" follow-up: If preview is on, show what would remain (Total - Predicted Total Report)
                          // If preview is off, show current status (Total - Already Reported)
                          // 根据用户要求，汇总数应严格遵循： 总额 - 四舍五入后的上报额
                          const currentDisplayedKept = amountRaw > 0 ? (amountRaw - (showEatingPreview ? toReportTotal : alreadyReported)) : 0;
                          
                          return (
                            <div 
                              key={num}
                              className="flex items-center gap-1.5 py-1 transition-colors hover:bg-black/5 px-0.5 rounded lottery-table"
                            >
                              <div className="flex items-center gap-1 min-w-[42px]">
                                <span className={`text-base font-serif font-bold ${textColor}`}>
                                  {num.toString().padStart(2, '0')}
                                </span>
                                <span className={`text-[11pt] font-bold bg-black/5 px-1 rounded-sm ${textColor}`}>
                                  {zodiac}
                                </span>
                              </div>
                              <div className="flex-1 flex gap-1">
                                <div 
                                  className={`flex-1 h-6 flex items-center justify-center px-0.5 border text-[11pt] font-bold transition-all ${amountRaw > 0 ? (isFullyReported ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-[#141414]') : 'bg-gray-50/50 border-gray-100 text-gray-300'}`}
                                  title="汇总数 (实地自留)"
                                >
                                  {amountRaw > 0 ? currentDisplayedKept.toFixed(0) : ''}
                                </div>
                                <div 
                                  className={`flex-1 h-6 flex items-center justify-center px-0.5 border text-[11pt] font-bold transition-all ${needsMoreReport ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' : 'bg-gray-50/50 border-gray-100 text-gray-300'}`}
                                  title="待上报差额"
                                >
                                  {moreAmount > 0 ? moreAmount.toFixed(0) : ''}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Bottom: History Section */}
                    <div className="mt-auto border-t border-gray-100 pt-4 flex-1 overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <History size={14} className="opacity-50" />
                          <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-50">吃码上报录入历史</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              const activeSuggestions = Object.entries(previewReportedData)
                                .filter(([_, amount]) => (amount as number) > 0)
                                .sort(([a], [b]) => parseInt(a) - parseInt(b));
                              
                              if (activeSuggestions.length === 0) {
                                setError('暂无建议上报数据');
                                setTimeout(() => setError(null), 2000);
                                return;
                              }

                              const totalAmount = activeSuggestions.reduce((sum, [_, amount]) => sum + (amount as number), 0);
                              const dataString = (systemType === 'HK' ? '港' : '澳') + "\n上报数据：\n" + 
                                activeSuggestions.map(([num, amount]) => `${num.padStart(2, '0')}=${(amount as number).toFixed(0)}`).join(' ') +
                                `\n合计：${totalAmount.toFixed(0)}`;

                              navigator.clipboard.writeText(dataString).then(() => {
                                setError('已复制上报建议至剪贴板');
                                setTimeout(() => setError(null), 2000);
                              });
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-mono font-bold rounded shadow-sm border border-[#141414]/10 transition-colors mr-1"
                            title="复制当前建议的上报数据"
                          >
                            <Copy size={12} />
                            复制
                          </button>
                          
                          <button 
                            disabled={eatingPage <= 1}
                            onClick={() => setEatingPage(p => p - 1)}
                            className="p-1 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span className="text-[10px] font-mono font-bold">{eatingPage} / {Math.ceil(eatingHistory.length / EATING_PER_PAGE) || 1}</span>
                          <button 
                            disabled={eatingPage >= Math.ceil(eatingHistory.length / EATING_PER_PAGE)}
                            onClick={() => setEatingPage(p => p + 1)}
                            className="p-1 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-1.5">
                        {eatingHistory.length === 0 ? (
                          <div className="py-4 text-center text-[10px] font-mono opacity-20 italic">暂无上报历史</div>
                        ) : (
                          eatingHistory
                            .slice((eatingPage - 1) * EATING_PER_PAGE, eatingPage * EATING_PER_PAGE)
                            .map(entry => (
                              <div key={entry.id} className="border border-dashed border-gray-100 p-2 text-[11px] font-mono flex items-center justify-between relative overflow-hidden">
                                <div className="flex items-center gap-4">
                                  <span className="opacity-40">{entry.time}</span>
                                  <span className="font-bold">控亏: ¥{entry.threshold.toLocaleString()}</span>
                                  <span className="font-bold text-blue-600">上报: ¥{entry.totalEaten.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-w-[350px] justify-end">
                                     {Object.entries(entry.distribution)
                                       .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                       .map(([num, amount]) => (
                                         <div key={num} className="flex items-center gap-0.5">
                                           <span className={`text-[10px] font-bold ${getBallTextColor(parseInt(num))}`}>{num.padStart(2, '0')}</span>
                                           <span className="opacity-40">:</span>
                                           <span className="bg-blue-50 px-0.5 rounded-sm text-[10px] text-blue-700">¥{(amount as number).toLocaleString()}</span>
                                         </div>
                                       ))
                                     }
                                  </div>
                                  <div className="flex items-center gap-1 ml-2">
                                    <button 
                                      onClick={() => {
                                        const sortedEntries = Object.entries(entry.distribution)
                                          .sort(([a], [b]) => parseInt(a) - parseInt(b));
                                        const totalEaten = sortedEntries.reduce((sum, [_, amt]) => sum + (amt as number), 0);
                                        const text = (systemType === 'HK' ? '港' : '澳') + 
                                          "\n上报数据：\n" + 
                                          sortedEntries.map(([num, amount]) => `${num.padStart(2, '0')}=${amount}`)
                                          .join(' ') +
                                          `\n合计：${totalEaten.toFixed(0)}`;
                                        
                                        navigator.clipboard.writeText(text);
                                        setError('已复制上报指令至剪贴板');
                                        setTimeout(() => setError(null), 2000);
                                      }}
                                      className="p-1 hover:bg-gray-100 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                      title="复制上报指令"
                                    >
                                      <Copy size={12} />
                                    </button>
                                    <button 
                                      onClick={() => setConfirmingEatingUndoId(entry.id)}
                                      className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-colors"
                                      title="撤回此条上报"
                                    >
                                      <RotateCcw size={12} />
                                    </button>
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {confirmingEatingUndoId === entry.id && (
                                    <motion.div 
                                      initial={{ x: '100%' }}
                                      animate={{ x: 0 }}
                                      exit={{ x: '100%' }}
                                      className="absolute inset-0 bg-red-600 text-white flex items-center justify-between px-3 z-10"
                                    >
                                      <span className="text-[10px] font-mono font-bold uppercase">确认撤回此条上报记录?</span>
                                      <div className="flex gap-2">
                                        <button 
                                          onClick={() => {
                                            handleUndoEating(entry.id);
                                            setConfirmingEatingUndoId(null);
                                          }}
                                          className="text-[10px] font-mono font-bold underline"
                                        >
                                          是 (YES)
                                        </button>
                                        <button 
                                          onClick={() => setConfirmingEatingUndoId(null)}
                                          className="text-[10px] font-mono font-bold opacity-70"
                                        >
                                          否 (NO)
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Risk Comparison (Reactive Simulated Risk) */}
                  <div className="col-span-3 bg-white border border-[#141414] flex flex-col h-full overflow-hidden">
                    <div className="flex flex-col h-full">
                      {/* Reactive Simulated Risk (Including preview reports) */}
                      {(() => {
                        const simulatedKept = Object.keys(riskDisplayData.bet).reduce((acc, key) => {
                          const num = parseInt(key);
                          const gross = riskDisplayData.bet[num] || 0;
                          // If preview is off, only use confirmed reports
                          const eaten = showEatingPreview ? ((previewReportedData as any)[num] || 0) : (eatenAmounts[num] || 0);
                          const result = Math.max(0, gross - eaten);
                          if (result > 0) acc[num] = result;
                          return acc;
                        }, {} as Record<number, number>);

                        return (
                          <MemoizedRiskAnalysisRanking 
                            riskDisplayData={{ 
                              bet: simulatedKept, 
                              eaten: {} 
                            }} 
                            rebate={rebate} 
                            odds={odds} 
                            threshold={eatingThreshold}
                            title={showEatingPreview ? "吃码预演后风险数" : "吃码后风险数"}
                          />
                        );
                      })()}
                    </div>
                  </div>
               </div>
            </div>
          ) : (
            <>
              {/* Compound Management View */}
              <div 
                className="lg:col-span-4 flex flex-col gap-4 h-full min-h-0"
              >
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setActiveView('stats')}
                      className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 text-[#141414] border-2 border-[#141414] font-mono text-[11px] font-bold transition-all active:translate-y-0.5 rounded shadow-[4px_4px_0_0_rgba(0,0,0,1)] w-fit mb-2 group"
                    >
                      <ArrowLeft size={16} className="text-blue-600 group-hover:-translate-x-1 transition-transform" />
                      返回主统计界面
                    </button>
                  </div>
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
                        if (showLastUndoConfirm) return;
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
                          handlePopOut();
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
                className="lg:col-span-10 flex flex-col h-full min-h-0"
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
                        ¥{compoundRecords.reduce((sum, r) => sum + Math.abs(r.totalAmount || 0), 0).toLocaleString()}
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
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-mono font-bold px-2 py-1 ${hasAnyWin ? 'bg-yellow-500 text-white' : 'bg-[#141414] text-white'}`}>{record.time}</span>
                                {selectedCustomerId === 'default' && record.customerName && (
                                  <span className="text-[10px] font-mono px-1 bg-gray-200 text-gray-600 rounded">{record.customerName}</span>
                                )}
                              </div>
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
                                {record.system && <span className="mr-1">[{record.system === 'HK' ? '港' : '澳'}]</span>}
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
                                  <button 
                                    onClick={() => {
                                      if (standaloneMode) {
                                        const signal = { recordId: record.id, timestamp: Date.now() };
                                        if (window.electron) window.electron.send('undo-entry', signal);
                                        else localStorage.setItem(getSysKey('LOTTERY_UNDO_REQUEST'), JSON.stringify(signal));
                                      }
                                      handleUndo(record.id);
                                    }} 
                                    className="px-8 py-2 bg-white text-red-600 font-mono font-bold hover:bg-opacity-90"
                                  >
                                    是
                                  </button>
                                  <button onClick={() => setConfirmingUndoId(null)} className="px-8 py-2 border-2 border-white text-white font-mono font-bold hover:bg-white hover:text-red-600">否</button>
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
    </div>
  ), [
    isSidebarVisible, isCompactMode, systemType, activeView, selectedCustomerId, customers, 
    setIsSidebarVisible, switchSystem, setActiveView, setSelectedCustomerId, 
    setIsAddCustomerModalOpen, setIsSettingsOpen, setShowFactoryResetConfirm, handleExport,
    error, setError, isSwitchingSystem, isCustomerDropdownOpen, setIsCustomerDropdownOpen,
    currentCoefficient, moveCustomerUp, moveCustomerDown, handleDeleteCustomer,
    setIsFormulaModalOpen, setFormulaTargetId, setTempCoefficient, toggleCompactMode,
    totalTurnover, drawNumbers, setDrawNumbers, specialNumber, setSpecialNumber,
    specialNumberInput, setSpecialNumberInput, auxSpecialNumber, setAuxSpecialNumber,
    auxSpecialNumberInput, setAuxSpecialNumberInput, riskNumbers, setIsRiskModalOpen,
    summaryMatrixData, displayBetData, financeRecords, compoundRecords,
    handleUndo, setIsModalOpen, handleReset, eatenAmounts, 
    handleResetEaten, eatingThreshold, setEatingThreshold, rebate, odds, eatingHistory, handlePopOut, refreshCounter
  ]);

  return (
    <div className="h-screen w-screen bg-gray-100 flex justify-center overflow-hidden relative">
      {/* App Container with responsive width but full height */}
      {appLayout}
      {memoizedModalContent}

        {/* Global Last Undo Confirm Modal */}
      <AnimatePresence>
        {showLastUndoConfirm && (
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
                  className={`flex-1 border-2 border-[#141414] py-3 font-mono text-xs font-bold transition-all ${
                    undoModalFocus === 'confirm' 
                      ? 'bg-red-600 text-white translate-x-[1px] translate-y-[1px] shadow-none' 
                      : 'bg-white text-[#141414] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  确认撤销
                </button>
                <button 
                  onClick={() => {
                    setShowLastUndoConfirm(false);
                    setUndoCallback(null);
                  }}
                  className={`flex-1 border-2 border-[#141414] py-3 font-mono text-xs font-bold transition-all ${
                    undoModalFocus === 'cancel' 
                      ? 'bg-red-600 text-white translate-x-[1px] translate-y-[1px] shadow-none' 
                      : 'bg-white text-[#141414] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal (Fallback for non-Electron) */}
      <AnimatePresence>
        {isSettingsOpen && !window.electron && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{ duration: 0 }}
              className="bg-white border-2 border-[#141414] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="bg-[#141414] text-[#E4E3E0] p-4 flex justify-between items-center">
                <h3 className="text-sm font-mono font-bold uppercase tracking-widest flex items-center gap-2">
                  <Settings size={16} />
                  系统设置
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
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">智能系统识别</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，录入内容包含地区关键词（如“港”、“澳”）时会自动分发到对应系统。</p>
                    </div>
                    <button 
                      onClick={() => setTempSmartSystemRecognition(!tempSmartSystemRecognition)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempSmartSystemRecognition ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempSmartSystemRecognition ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

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
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">风险值预警跟随客户</label>
                      <p className="text-[10px] font-mono opacity-40">开启后矩阵风险基于当前客户计算；关闭则始终基于汇总数据。</p>
                    </div>
                    <button 
                      onClick={() => {
                        const next = !tempFollowCustomerRisk;
                        setTempFollowCustomerRisk(next);
                        if (!next) setTempEnableCustomerEatingReport(false);
                      }}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempFollowCustomerRisk ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempFollowCustomerRisk ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className={`flex items-center justify-between transition-opacity ${!tempFollowCustomerRisk ? 'opacity-30' : ''}`}>
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">开启客户页吃码上报</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，点击“吃码上报”时不再强制切换到汇总模式。</p>
                    </div>
                    <button 
                      onClick={() => tempFollowCustomerRisk && setTempEnableCustomerEatingReport(!tempEnableCustomerEatingReport)}
                      disabled={!tempFollowCustomerRisk}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempEnableCustomerEatingReport ? 'bg-indigo-600' : 'bg-gray-300'} ${!tempFollowCustomerRisk ? 'cursor-not-allowed' : ''}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempEnableCustomerEatingReport ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">复制后自动粘贴</label>
                      <p className="text-[10px] font-mono opacity-40">开启后，监控剪切板内容，并在复制动作发生后自动填充录入框。</p>
                    </div>
                    <button 
                      onClick={() => setTempAutoPasteEnabled(!tempAutoPasteEnabled)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempAutoPasteEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempAutoPasteEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {/* 智能图片识别大模型 OCR 设置 */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400">智能图片识别 (OCR)</h4>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-mono font-bold uppercase tracking-widest block">识别引擎</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTempOcrEngine('paddle')}
                        className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition-all ${
                          tempOcrEngine === 'paddle'
                            ? 'border-[#141414] bg-[#141414] text-white'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        本地 OCR (Paddle)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempOcrEngine('gemini')}
                        className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition-all ${
                          tempOcrEngine === 'gemini'
                            ? 'border-[#141414] bg-[#141414] text-white'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        Gemini 大模型
                      </button>
                    </div>
                    <p className="text-[10px] font-mono opacity-40">本地 PaddleOCR 软件离线识别，或使用全球领先的 Gemini 大模型精确解析下注数据。</p>
                  </div>

                  {tempOcrEngine === 'gemini' && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-mono font-bold uppercase tracking-widest block">Gemini API Key</label>
                        <input
                          type="password"
                          value={tempGeminiApiKey}
                          onChange={(e) => setTempGeminiApiKey(e.target.value)}
                          placeholder="输入您的 Google Gemini API 密钥"
                          className="w-full p-3 font-mono text-xs border-2 border-[#141414] focus:outline-none focus:bg-gray-50 bg-white"
                        />
                        <div className="flex justify-between items-center text-[9px] font-mono opacity-50">
                          <span>密钥将 100% 仅保存在您的本地个人环境</span>
                          <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 font-bold hover:text-indigo-800">[获取免费 API Key]</a>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-mono font-bold uppercase tracking-widest block">大模型版本</label>
                        <select
                          value={tempGeminiModel}
                          onChange={(e) => setTempGeminiModel(e.target.value)}
                          className="w-full p-3 font-mono text-xs border-2 border-[#141414] bg-white focus:outline-none focus:bg-gray-50 cursor-pointer"
                        >
                          <option value="gemini-2.5-flash">gemini-2.5-flash (推荐：高性价比)</option>
                          <option value="gemini-2.5-pro">gemini-2.5-pro (超强手写复杂排版分析)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-2 border-t border-[#141414]/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-mono font-bold uppercase tracking-widest block">软件分辨率</label>
                      <p className="text-[10px] font-mono opacity-40">开启“紧凑模式”后优先使用预设尺寸 (730x658)。也可在下方自由调整。</p>
                    </div>
                    <button 
                      onClick={() => {
                        const next = !tempCompactMode;
                        setTempCompactMode(next);
                        if (next) {
                          setTempWidth(730);
                          setTempHeight(658);
                        } else {
                          setTempWidth(1420);
                          setTempHeight(903);
                        }
                      }}
                      className={`w-10 h-5 rounded-full transition-colors relative ${tempCompactMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tempCompactMode ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">宽度 (Width)</span>
                      <input 
                        type="number"
                        value={tempWidth}
                        onChange={(e) => setTempWidth(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#141414] outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">高度 (Height)</span>
                      <input 
                        type="number"
                        value={tempHeight}
                        onChange={(e) => setTempHeight(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#141414] outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] font-mono opacity-60 bg-gray-50 p-2 border border-gray-200 mt-1">
                    当前预览：<span className="font-bold text-[#141414]">{tempWidth} x {tempHeight}</span> 
                    {tempCompactMode ? <span className="ml-1 text-indigo-600 font-bold">(紧凑模式)</span> : <span className="ml-1 text-gray-400">(标准/自由)</span>}
                  </p>
                </div>

                <button 
                  onClick={() => {
                    // Only apply changes on Save
                    setOdds(tempOdds);
                    setRebate(tempRebate);
                    setEnableSearchUndo(tempEnableSearchUndo);
                    setSmartSystemRecognition(tempSmartSystemRecognition);
                    setRequireUndoConfirm(tempRequireUndoConfirm);
                    setAutoPasteEnabled(tempAutoPasteEnabled);
                    setFollowCustomerRisk(tempFollowCustomerRisk);
                    setEnableCustomerEatingReport(tempEnableCustomerEatingReport);
                    setOcrEngine(tempOcrEngine);
                    setGeminiApiKey(tempGeminiApiKey);
                    setGeminiModel(tempGeminiModel);
                    
                    if (tempCompactMode !== isCompactMode || tempWidth !== customWidth || tempHeight !== customHeight) {
                      setIsCompactMode(tempCompactMode);
                      setCustomWidth(tempWidth);
                      setCustomHeight(tempHeight);
                      
                      localStorage.setItem('isCompactMode', tempCompactMode.toString());
                      localStorage.setItem('customWidth', tempWidth.toString());
                      localStorage.setItem('customHeight', tempHeight.toString());
                      
                      // Resize Electron window if applicable
                      if (window.electron) {
                        window.electron.send('resize-main-window', { width: tempWidth, height: tempHeight });
                      }
                    }
                    
                    localStorage.setItem(getSysKey('odds'), tempOdds.toString());
                    localStorage.setItem(getSysKey('rebate'), tempRebate.toString());
                    localStorage.setItem(getSysKey('enableSearchUndo'), tempEnableSearchUndo.toString());
                    localStorage.setItem(getSysKey('smartSystemRecognition'), tempSmartSystemRecognition.toString());
                    localStorage.setItem(getSysKey('requireUndoConfirm'), tempRequireUndoConfirm.toString());
                    localStorage.setItem(getSysKey('autoPasteEnabled'), tempAutoPasteEnabled.toString());
                    localStorage.setItem(getSysKey('followCustomerRisk'), tempFollowCustomerRisk.toString());
                    localStorage.setItem(getSysKey('enableCustomerEatingReport'), tempEnableCustomerEatingReport.toString());
                    localStorage.setItem('ocr_engine', tempOcrEngine);
                    localStorage.setItem('gemini_api_key', tempGeminiApiKey);
                    localStorage.setItem('gemini_model', tempGeminiModel);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full bg-[#141414] text-[#E4E3E0] py-4 font-mono text-sm font-bold hover:bg-opacity-90 active:bg-black active:scale-[0.98] transition-all transform duration-100"
                >
                  保存并关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Reset Confirmation Modal */}
      <AnimatePresence>
        {isAddCustomerModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#141414] w-full max-w-sm overflow-hidden shadow-[8px_8px_0_0_#141414]"
            >
              <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#F2F1ED]">
                <h3 className="text-sm font-mono font-bold uppercase">添加新客户</h3>
                <button onClick={() => setIsAddCustomerModalOpen(false)} className="p-1 hover:bg-gray-200 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4 bg-[#F2F1ED]">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">客户姓名 / 数据库名称</label>
                  <input 
                    type="text" 
                    autoFocus
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomerSubmit()}
                    placeholder="例如: 张三, 李四..."
                    className="w-full px-3 py-2 border-2 border-[#141414] text-sm font-mono focus:outline-none focus:bg-yellow-50 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">系数设置 (1% - 100%)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newCustomerCoefficient}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val === '') {
                          setNewCustomerCoefficient('');
                          return;
                        }
                        const num = parseInt(val);
                        if (num >= 1 && num <= 100) {
                          setNewCustomerCoefficient(num.toString());
                        }
                      }}
                      onBlur={() => {
                        if (newCustomerCoefficient === '') setNewCustomerCoefficient('100');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomerSubmit()}
                      className="w-full px-3 py-2 border-2 border-[#141414] text-center text-sm font-mono focus:outline-none focus:bg-blue-50 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-bold">%</span>
                  </div>
                  <p className="text-[8px] font-mono opacity-50 uppercase">该客户汇总时将按此比例缩放，默认为 100%</p>
                </div>
                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={handleAddCustomerSubmit}
                    disabled={!newCustomerName.trim()}
                    className="flex-1 py-3 bg-[#141414] text-white text-xs font-mono font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
                  >
                    确认创建
                  </button>
                  <button 
                    onClick={() => setIsAddCustomerModalOpen(false)}
                    className="flex-1 py-3 border-2 border-[#141414] text-xs font-mono font-bold hover:bg-white transition-all"
                  >
                    取消
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isFormulaModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#141414] w-full max-w-sm overflow-hidden shadow-[8px_8px_0_0_#141414]"
            >
              <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#F2F1ED]">
                <h3 className="text-sm font-mono font-bold uppercase">系数设置管理</h3>
                <button onClick={() => setIsFormulaModalOpen(false)} className="p-1 hover:bg-gray-200 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4 bg-[#F2F1ED]">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">选择指定客户</label>
                  <select 
                    value={formulaTargetId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setFormulaTargetId(newId);
                      const saved = localStorage.getItem(`coefficient_${newId}`);
                      const val = saved ? parseFloat(saved) : 1.0;
                      setTempCoefficient(Math.round(val * 100).toString());
                    }}
                    className="w-full px-3 py-2 border-2 border-[#141414] text-sm font-mono focus:outline-none bg-white"
                  >
                    {customers.filter(c => c.id !== 'default').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">设定系数值 (1% - 100%)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      autoFocus
                      value={tempCoefficient}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val === '') {
                          setTempCoefficient('');
                          return;
                        }
                        const num = parseInt(val);
                        if (num >= 1 && num <= 100) {
                          setTempCoefficient(num.toString());
                        }
                      }}
                      onBlur={() => {
                        if (tempCoefficient === '') {
                          const saved = localStorage.getItem(`coefficient_${formulaTargetId}`);
                          const val = saved ? parseFloat(saved) : 1.0;
                          setTempCoefficient(Math.round(val * 100).toString());
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveFormulaCoefficient()}
                      className="w-full h-12 border-2 border-[#141414] text-center text-2xl font-mono font-bold focus:outline-none focus:bg-blue-50 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl font-mono font-bold">%</span>
                  </div>
                  <p className="text-[9px] font-mono text-gray-400 text-center uppercase tracking-tighter">该系数仅对选定客户生效，用于汇总聚合时的金额加权计算</p>
                </div>
                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={handleSaveFormulaCoefficient}
                    className="flex-1 py-4 bg-[#141414] text-white text-xs font-mono font-bold hover:bg-opacity-90 transition-all"
                  >
                    确认应用系数
                  </button>
                  <button 
                    onClick={() => setIsFormulaModalOpen(false)}
                    className="flex-1 py-4 border-2 border-[#141414] text-xs font-mono font-bold hover:bg-white transition-all"
                  >
                    取消
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

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
                  onClick={() => {
                    if (standaloneMode) {
                      const signal = { keepRisk: false, keepSpecial: false, timestamp: Date.now() };
                      if (window.electron) window.electron.send('reset-entry', signal);
                      else localStorage.setItem(getSysKey('LOTTERY_RESET_REQUEST'), JSON.stringify(signal));
                    }
                    handleReset(false);
                    setShowResetConfirm(false);
                  }}
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

        {showFactoryResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-red-600 p-8 max-w-md w-full shadow-[12px_12px_0_0_rgba(220,38,38,1)]"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <AlertCircle size={32} />
                <h3 className="text-2xl font-serif italic font-bold">极致危险：业务数据清零</h3>
              </div>
              <p className="text-sm font-mono font-bold text-red-600 mb-2">您正在尝试清空软件业务数据。</p>
              <div className="bg-red-50 p-4 border-l-4 border-red-600 mb-6 space-y-2">
                <p className="text-xs font-mono text-red-800">• 永久删除所有下注流水记录</p>
                <p className="text-xs font-mono text-red-800">• 清空当前吃码上报状态</p>
                <p className="text-xs font-mono text-red-800">• 各个客户的财务账目将重置</p>
                <p className="text-[10px] font-mono text-green-700 mt-2 font-bold select-none">注意：客户库 (名单) 与系统配置将被保留。</p>
              </div>
              <p className="text-[10px] font-mono opacity-60 mb-8 uppercase tracking-widest text-center">此操作不可撤销，不可恢复</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleClearBusinessData}
                  className="w-full bg-red-600 text-white py-4 font-mono text-base font-bold hover:bg-red-700 transition-all active:translate-y-1"
                >
                  确认清理业务数据
                </button>
                <button 
                  onClick={() => setShowFactoryResetConfirm(false)}
                  className="w-full border-2 border-[#141414] py-3 font-mono text-sm font-bold hover:bg-gray-50 transition-all"
                >
                  不，点错了 (返回)
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

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-2 text-amber-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    澳门风险号
                  </h4>
                  <div className="grid grid-cols-6 gap-2">
                    {riskNumbers.slice(0, 12).map((val, i) => (
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
                        className="w-full h-10 border-2 border-[#141414] bg-white text-center text-lg font-mono font-bold focus:bg-yellow-100 transition-colors"
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-2 text-indigo-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    香港风险号
                  </h4>
                  <div className="grid grid-cols-6 gap-2">
                    {riskNumbers.slice(12, 24).map((val, i) => {
                      const idx = i + 12;
                      return (
                        <input
                          key={idx}
                          ref={el => riskInputRefs.current[idx] = el}
                          type="text"
                          inputMode="numeric"
                          value={val}
                          onChange={(e) => {
                            handleRiskInputChange(idx, e.target.value);
                          }}
                          onKeyDown={(e) => handleRiskKeyDown(idx, e)}
                          onPaste={(e) => handleRiskPaste(idx, e)}
                          placeholder="--"
                          className="w-full h-10 border-2 border-[#141414] bg-white text-center text-lg font-mono font-bold focus:bg-yellow-100 transition-colors"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button 
                  onClick={() => setIsRiskModalOpen(false)}
                  className="w-full bg-[#141414] text-white py-3 font-mono font-bold hover:bg-opacity-90 active:translate-y-1"
                >
                  确认保存 (CONFIRM)
                </button>
                <button 
                  onClick={() => setRiskNumbers(Array(24).fill(''))}
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
                  <MemoizedRecordsList 
                    records={activeView === 'stats' ? financeRecords : compoundRecords}
                    activeView={activeView}
                    handleUndo={handleUndo}
                    confirmingUndoId={confirmingUndoId}
                    setConfirmingUndoId={setConfirmingUndoId}
                    standaloneMode={standaloneMode}
                    selectedCustomerId={selectedCustomerId}
                    renderHighlightedText={renderHighlightedText}
                    getRiskMatchCount={getRiskMatchCount}
                    auxSpecialNumber={auxSpecialNumber}
                    specialNumber={specialNumber}
                  />
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
// --- New Memoized Components for Performance ---

const NumberMatrix = ({ financeBetData, specialNumber, auxSpecialNumber, isCompactMode }: { 
  financeBetData: Record<number, number>, 
  specialNumber: number | null, 
  auxSpecialNumber: number | null, 
  isCompactMode: boolean 
}) => {
  const rows = 12;
  const indices = useMemo(() => {
    const arr = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 5; c++) {
        let num = null;
        if (c === 4) {
          if (r === 0) num = 49;
          else num = null;
        } else {
          num = c * 12 + r + 1;
          if (num > 48) num = null;
        }
        arr.push(num);
      }
    }
    return arr;
  }, []);

  return (
    <div className={`grid grid-cols-5 gap-x-2 gap-y-1 mb-4 ${isCompactMode ? 'max-w-4xl mx-auto' : ''}`}>
      {indices.map((num, idx) => {
        if (num === null) return <div key={`empty-${idx}`} />;
        
        const amount = financeBetData[num] || 0;
        const textColor = getBallTextColor(num);
        const isSpecial = specialNumber === num;
        const isAux = auxSpecialNumber === num;
        
        return (
          <div 
            key={num}
            className={`flex items-center gap-1.5 py-1 transition-colors hover:bg-black/5 px-0.5 rounded lottery-table ${isSpecial ? 'bg-yellow-300 ring-2 ring-yellow-400 font-bold' : ''} ${isAux ? 'bg-gray-300 ring-2 ring-gray-400 font-bold' : ''}`}
          >
            <div className="flex items-center gap-1 min-w-[42px]">
              <span className={`text-base font-serif font-bold ${textColor}`}>
                {num.toString().padStart(2, '0')}
              </span>
              <span className={`text-[11pt] font-bold bg-black/5 px-1 rounded-sm ${textColor}`}>
                {getZodiacByNumber(num)}
              </span>
            </div>
            <div className={`w-18 h-6 flex items-center justify-start px-1 border border-gray-200 text-left text-[11pt] font-bold bg-white ${amount < 0 ? 'text-red-500 bg-red-50/70 border-red-200' : 'text-[#141414]'}`}>
              {amount !== 0 ? amount.toFixed(0) : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MemoizedNumberMatrix = React.memo(NumberMatrix);

const RiskAnalysisRanking = ({ riskDisplayData, rebate, odds, threshold, title }: { 
  riskDisplayData: { bet: Record<number, number>, eaten: Record<number, number> },
  rebate: number,
  odds: number,
  threshold: number,
  title?: string
}) => {
  const rankingData = useMemo(() => {
    // Pre-calculate netIncome for the whole set to avoid O(N^2)
    const keptAmounts = Array.from({ length: 49 }, (_, i) => {
      const n = i + 1;
      return Math.max(0, (riskDisplayData.bet[n] || 0) - (riskDisplayData.eaten[n] || 0));
    });
    const totalKeptGross = keptAmounts.reduce((s, v) => s + v, 0);
    const netIncome = Math.round(totalKeptGross * (1 - rebate / 100));

    return Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      // 实地下注数 = 原始总额 - 已上报额
      const targetKeptAmount = Math.max(0, (riskDisplayData.bet[num] || 0) - (riskDisplayData.eaten[num] || 0));
      const payout = Math.round(targetKeptAmount * odds);
      const risk = netIncome - payout;
      return { num, amount: targetKeptAmount, risk };
    })
    .sort((a, b) => a.risk - b.risk);
  }, [riskDisplayData, rebate, odds]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex-1 overflow-hidden bg-blue-50/5 w-full relative">
        <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-gray-50 text-[10px] font-black h-5 shrink-0 uppercase tracking-tighter w-full overflow-hidden">
          <div className="grid grid-cols-[68px_1fr_1fr_48px] w-full h-full">
            <div className="flex items-center justify-start px-1 border-r border-gray-200 shrink-0">号码</div>
            <div className="flex items-center justify-start px-2 border-r border-gray-200">下注数</div>
            <div className="flex items-center justify-start px-2 border-r border-gray-200">{title || '风险数'}</div>
            <div className="flex items-center justify-start px-1 whitespace-nowrap shrink-0">排序</div>
          </div>
        </div>
        <div className="flex flex-col h-[calc(100%-1.25rem)]">
          {rankingData.map((item, index) => {
            const textColor = getBallTextColor(item.num);
            const zodiac = getZodiacByNumber(item.num);
            const isExceeding = item.risk < -threshold;
            return (
              <div 
                key={item.num} 
                className={`py-0 px-0 ${index === 48 ? '' : 'border-b border-gray-200'} flex items-center transition-colors lottery-table ${isExceeding ? 'bg-red-50/50' : 'bg-emerald-50/50'} w-full flex-1 min-h-0`}
              >
                <div className="grid grid-cols-[68px_1fr_1fr_48px] w-full h-full">
                  <div className="flex items-center justify-start gap-0 px-1 shrink-0 border-r border-gray-200 overflow-hidden">
                    <span className={`text-[12px] font-black uppercase tracking-tighter leading-none ${textColor} w-5`}>{item.num.toString().padStart(2, '0')}</span>
                    <span className={`text-[12px] font-black uppercase tracking-tighter leading-none flex items-center justify-center ${textColor}`}>{zodiac}</span>
                  </div>
                  
                  <div className={`px-2 border-r border-gray-200 flex items-center justify-start text-[12px] font-black uppercase tracking-tighter ${textColor} overflow-hidden font-mono`}>
                    {item.amount.toFixed(0)}
                  </div>

                  <div className={`px-2 border-r border-gray-200 flex items-center justify-start text-[12px] font-black uppercase tracking-tighter ${textColor} overflow-hidden font-mono`}>
                    {item.risk < 0 ? '-' : ''}{Math.abs(item.risk).toFixed(0)}
                  </div>

                  <div className={`px-1 flex items-center justify-start text-[12px] font-black uppercase tracking-tighter ${textColor} shrink-0 overflow-hidden font-mono`}>
                    {index + 1}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const MemoizedRiskAnalysisRanking = React.memo(RiskAnalysisRanking);

const RecordsList = ({ 
  records, activeView, handleUndo, confirmingUndoId, setConfirmingUndoId, 
  standaloneMode, selectedCustomerId, renderHighlightedText, getRiskMatchCount,
  auxSpecialNumber, specialNumber
}: any) => {
  return (
    <>
      {records.map((record: any) => {
        const winningAmount = activeView === 'stats'
          ? record.items.reduce((sum: number, item: any) => {
              let hits = 0;
              const itemSys = item.system || record.system || (record.sys === '澳' ? 'MO' : 'HK');
              if (itemSys === 'HK') {
                if (auxSpecialNumber && auxSpecialNumber > 0) {
                  hits += item.targets.filter((t: any) => t === auxSpecialNumber).length;
                }
              } else {
                if (specialNumber && specialNumber > 0) {
                  hits += item.targets.filter((t: any) => t === specialNumber).length;
                }
              }
              const earn = hits * item.amount;
              return sum + (item.isSplitAmount ? Math.floor(earn) : earn);
            }, 0)
          : 0;

        const isHighRisk = record.items.some((item: any) => getRiskMatchCount(item.targets, record.system) > 8);

        return (
          <div key={record.id} className={`group border-b border-dashed border-[#141414] border-opacity-20 pb-2 relative overflow-hidden bg-white/50 p-2 rounded lottery-table ${isHighRisk ? 'ring-2 ring-red-500 ring-inset' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className="text-[11pt] opacity-60">{record.time}</span>
                {selectedCustomerId === 'default' && record.customerName && (
                  <span className="text-[10pt] font-mono px-1 bg-gray-200 text-gray-600 rounded">{record.customerName}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {winningAmount > 0 && (
                  <span className="text-[11pt] font-bold bg-yellow-400 px-1 rounded">中金: ¥{winningAmount}</span>
                )}
                <span className={`text-[11pt] font-bold ${record.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {record.totalAmount >= 0 ? '+' : ''}¥{Math.round(record.totalAmount)}
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
            <p className={`text-[11pt] font-serif font-bold mt-1 uppercase ${isHighRisk ? 'text-red-500' : ''}`}>{renderHighlightedText(record.fullRaw || record.raw, record.system as any)}</p>
            {record.parsedPreview && (
              <div className={`mt-1 p-1 bg-gray-50 text-[11pt] font-serif font-bold whitespace-pre-wrap border-l-2 border-gray-200 uppercase ${isHighRisk ? 'text-red-500 border-red-500' : 'opacity-60'}`}>
                {record.system && !record.parsedPreview && <span className="mr-1">[{record.system === 'HK' ? '港' : '澳'}]</span>}
                {renderHighlightedText(record.parsedPreview, record.system as any)}
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
                      onClick={() => {
                        handleUndo(record.id);
                        setConfirmingUndoId(null);
                      }}
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
      })}
    </>
  );
};

const MemoizedRecordsList = React.memo(RecordsList);

const EntryModalContent = React.memo(({ 
  isOpen, modalMode, modalResults, handleParse, 
  lastSubmittedModalValue, setLastSubmittedModalValue, isSubmitting, showLastUndoConfirm, modalInputRef, 
  systemType: _systemType, switchSystem: _switchSystem, 
  isSwitchingSystem: _isSwitchingSystem, popOutTargetId, setPopOutTargetId, selectedCustomerId, 
  setSelectedCustomerId, customers, handlePopOut, standaloneMode, dragControls, 
  handlePasteAndRecognize, triggerLastUndo, setIsModalOpen, error,
  externalValue, onValueChange, triggerClearAndPaste, clearConfirmActive,
  ocrLoading, ocrProgress, processImageFile
}: any) => {
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [modalIsDragging, setModalIsDragging] = useState(false);
  
  // 核心优化：内部私有状态，打字时不触发父组件重绘，实现秒回显
  const [internalValue, setInternalValue] = useState(externalValue || '');
  const [textareaKey, setTextareaKey] = useState(0);

  // 当外部强制改变（如清空、粘贴）时同步
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== internalValue) {
      setInternalValue(externalValue || '');
      // 仅在高负载大段粘贴（长度 > 1000）下才触发重新挂载，清空时坚决保持原生 DOM 不被销毁，防止原生的焦点状态和 selection 丢失
      if (externalValue && externalValue.length > 1000) {
        setTextareaKey(prev => prev + 1);
      }
    }
  }, [externalValue]);

  const isActuallyVisible = isOpen || standaloneMode;

  // 打字完成后延迟同步给父组件
  useEffect(() => {
    const timer = setTimeout(() => {
      const sanitizedInternal = internalValue || '';
      const sanitizedExternal = externalValue || '';
      if (sanitizedInternal !== sanitizedExternal) {
        onValueChange(sanitizedInternal);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [internalValue, externalValue, onValueChange]);

  // 关键：当弹窗从隐藏转为显示时，或 DOM 重新挂载后，手动触发 focus
  useEffect(() => {
    if (isActuallyVisible) {
      const focus = () => {
        if (modalInputRef && modalInputRef.current) {
          modalInputRef.current.focus();
          // 如果是清空操作，确保光标在最前面，如果是粘贴，确保在最后面
          const len = modalInputRef.current.value.length;
          modalInputRef.current.setSelectionRange(len, len);
        }
      };
      
      focus();
      // 在 Electron 中，渲染压力大时可能需要微秒级延时
      const timer = setTimeout(focus, 50);
      return () => clearTimeout(timer);
    }
  }, [isActuallyVisible, modalInputRef, textareaKey]);

  return (
    <div 
      className={`fixed inset-0 z-50 overflow-hidden flex items-center justify-center ${
        isActuallyVisible ? '' : 'pointer-events-none'
      }`}
      style={{ 
        visibility: isActuallyVisible ? 'visible' : 'hidden',
        // GPU 加速：预先分配图层，减少 Electron 切换时的 Composite 时间
        transform: 'translateZ(0)',
        willChange: 'visibility'
      }}
    >
      <div 
        className="absolute inset-0 bg-black/20" 
        onClick={() => !standaloneMode && setIsModalOpen(false)}
      />
      <motion.div 
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        initial={false}
        animate={{ 
          // 仅在打开时有简单的位移，取消所有缩放和渐变
          x: 'calc(50vw - 325px)', 
          y: 'calc(50vh - 354px)',
          opacity: isActuallyVisible ? 1 : 0
        }}
        transition={{ 
          type: 'tween', 
          duration: 0 // 甚至在 tween 中也强制 0 持续时间
        }}
        style={{ 
          width: '650px', 
          height: '708px',
          willChange: 'transform'
        }}
        className="bg-[#F2F1ED] border-4 border-[#141414] p-6 flex flex-col gap-4 shadow-[12px_12px_0_0_rgba(0,0,0,0.2)] pointer-events-auto absolute"
      >
        <div 
          onPointerDown={(e: any) => dragControls.start(e)}
          className="flex items-center justify-between border-b border-[#141414] pb-2 cursor-move select-none"
          style={!standaloneMode ? { WebkitAppRegion: 'drag' } as React.CSSProperties : {}}
        >
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest pointer-events-none text-[#141414]">
              智能下注录入
            </h3>
          </div>
            <button 
              onClick={() => {
                if (standaloneMode && (window as any).electron) {
                  (window as any).electron.hideEntryWindow();
                } else {
                  setIsModalOpen(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs font-mono hover:underline text-[#141414]"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              [隐藏]
            </button>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold opacity-60 uppercase text-[#141414]">录入给:</span>
              <select 
                value={popOutTargetId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setPopOutTargetId(newId);
                  if (selectedCustomerId !== 'default' && newId !== 'default') {
                    setSelectedCustomerId(newId);
                  }
                }}
                className="bg-white border text-[11px] font-mono font-bold px-2 py-0.5 focus:outline-none focus:bg-yellow-50 appearance-none pr-6 relative rounded-none border-gray-400 text-[#141414]"
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23141414%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem top 50%', backgroundSize: '0.6rem auto' }}
              >
                <option value="default" disabled hidden={customers.length > 1}>请选择客户</option>
                {customers.filter((c: any) => c.id !== 'default').map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {internalValue && internalValue.trim() && modalResults.total !== undefined && (
              <span className="text-sm font-mono font-bold text-blue-600">
                估算总额: ¥{modalResults.total.toLocaleString()}
              </span>
            )}
          </div>


          <div className="flex-1 flex flex-col space-y-1 min-h-0 relative">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-mono font-bold uppercase opacity-60 text-[#141414]">输入文字内容:</label>
            </div>
            {ocrLoading && (
              <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-500 animate-pulse">
                <div className="text-sm font-mono font-bold text-indigo-700 mb-1">📷 {ocrProgress}</div>
                <div className="text-[10px] text-gray-400 font-mono">离线安全通道：100% 物理级单机解析，不消耗外部网络流量</div>
              </div>
            )}
            <textarea
              key={textareaKey}
              ref={modalInputRef}
              value={internalValue}
              autoFocus
              spellCheck={false}
              onChange={(e) => {
                setInternalValue(e.target.value);
                onValueChange(e.target.value);
              }}
              onPaste={async (e) => {
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                      e.preventDefault();
                      await processImageFile(file);
                    }
                  }
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setModalIsDragging(true); }}
              onDragLeave={() => setModalIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setModalIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  if (file.type.startsWith('image/')) {
                    await processImageFile(file);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (showLastUndoConfirm) return;
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleParse(false, internalValue);
                }
              }}
              onClick={() => modalInputRef.current?.focus()}
              placeholder={modalIsDragging ? "松开鼠标载入并识别图片内容 (PaddleOCR-json)..." : "请在此输入或粘贴彩票下注信息（支持直接粘贴截图或拖入图片启动离线OCR）..."}
              className={`w-full h-32 p-3 font-mono text-base border-2 focus:border-blue-500 focus:outline-none transition-all resize-none shadow-inner text-[#141414] cursor-text relative z-10 ${
                modalIsDragging ? "border-dashed border-indigo-500 bg-indigo-50/50 scale-[0.99]" : "border-gray-400 bg-white"
              }`}
              style={{ WebkitAppRegion: 'no-drag', caretColor: '#141414' } as any}
            />
          </div>

          <div className="flex-1 flex flex-col space-y-1 min-h-0">
            <div className="flex justify-between items-end">
              <label className="text-[10px] font-mono font-bold uppercase opacity-60 text-[#141414]">识别的结果:</label>
            </div>
            <div 
              ref={previewScrollRef}
              className="w-full flex-1 p-3 font-mono text-base border-2 border-gray-400 bg-[#F5F5F0] overflow-y-auto whitespace-pre-wrap break-all shadow-inner text-[#141414]"
            >
              {modalResults.preview}
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
            onClick={() => setInternalValue('')}
            className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
          >
            清内容
          </button>
          <button 
            onClick={triggerLastUndo}
            className="bg-[#F0F0F0] hover:bg-[#E0E0E0] border border-gray-400 py-2.5 text-[10px] font-bold transition-all active:bg-gray-300 rounded-none shadow-sm text-[#141414] whitespace-nowrap"
          >
            撤销
          </button>
          <button 
            onClick={() => triggerClearAndPaste()}
            className={`${
              clearConfirmActive 
                ? "bg-red-600 hover:bg-red-700 border-red-700 text-white animate-pulse" 
                : "bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-900 active:bg-amber-300"
            } border py-2.5 text-[10px] font-bold transition-all rounded-none shadow-sm whitespace-nowrap font-bold`}
          >
            {clearConfirmActive ? '⚠️ 再次确认！' : '清空数据并粘贴'}
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1 mt-1">
          <button 
            onClick={() => handleParse(false, internalValue)}
            disabled={!internalValue.trim() || isSubmitting || internalValue === lastSubmittedModalValue}
            className="col-span-4 bg-[#141414] hover:bg-[#2a2a2a] text-white border border-[#141414] py-4 text-sm font-bold transition-all active:bg-black flex items-center justify-center gap-2 rounded-none shadow-md disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale disabled:border-gray-400"
          >
            <Plus size={18} />
            {isSubmitting ? '处理中...' : '保存下单'}
          </button>
          <button 
            onClick={() => handleParse(true, internalValue)}
            disabled={!internalValue.trim() || isSubmitting || internalValue === lastSubmittedModalValue}
            className="col-span-1 bg-red-600 hover:bg-red-700 text-white border border-red-600 py-4 text-xs font-bold transition-all active:bg-red-800 flex items-center justify-center gap-1 rounded-none shadow-md disabled:opacity-50 disabled:bg-gray-400 disabled:grayscale disabled:border-gray-400"
          >
            <Minus size={14} />
            {isSubmitting ? '...' : '扣除'}
          </button>
        </div>
      </motion.div>
    </div>
  );
});

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
