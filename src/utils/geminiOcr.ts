import { GoogleGenAI } from "@google/genai";

/**
 * Executes a Gemini Gemini API model call directly from client environment using user's custom API key.
 * This ensures compatibility with fully standalone and packaged Electron app setups without requiring extra servers.
 */
export async function performGeminiOcr(file: File, apiKey: string, model = 'gemini-2.5-flash'): Promise<string> {
  if (!apiKey) {
    throw new Error('请先在 [系统设置] 中填写您的 Gemini API 密钥 (API Key)。');
  }

  // Convert File to Base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resString = reader.result as string;
      const commaIndex = resString.indexOf(',');
      if (commaIndex !== -1) {
        resolve(resString.substring(commaIndex + 1));
      } else {
        resolve(resString);
      }
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const prompt = `你是一个高精度的手写/打印账单与下注数据文字识别 (OCR) 专家。
当前正在处理一张含有下注投注信息的截图或照片。
请在此项任务中，执行彻底、精确的文字识别，识别出图片中所有的文本信息，特别是下注玩法的目标和金额、地区及系统（如澳、港）。
请严格遵守以下输出要求：
1. **只返回识别到的原始文本内容**，不可有任何分析、说明、提示或包装，也不需要 Markdown 格式的代码块。
2. 保持每行原有的回车结构。
3. 如果文字模糊或有手写谐音，也请按最清晰的字形原样转化。
不要说任何多余的话、不要有解释，直接返回识别出的下注纯文本（例如：‘澳10.20各50’）。`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: file.type || "image/png",
            data: base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  });

  if (!response || !response.text) {
    throw new Error('大模型未返回任何识别结果，请确认图片是否清晰。');
  }

  return response.text;
}
