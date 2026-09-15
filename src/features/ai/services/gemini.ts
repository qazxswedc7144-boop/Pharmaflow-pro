// src/features/ai/services/gemini.ts
import { TokenProvider } from "@/services/auth/tokenProvider";
import { unifiedTransport } from "@/shared/network/transport/unifiedTransport";

/**
 * Makes a secure request to the backend server-side Gemini AI proxy via UnifiedTransport.
 */
async function callAiProxy(model: string, contents: any): Promise<{ text: string; candidates: any[] }> {
  if (!TokenProvider.getAccessToken()) {
    return {
      text: "التحليلات في وضع عدم الاتصال حالياً. يرجى تسجيل الدخول أولاً لتفعيل نظام التحليلات الذكي.",
      candidates: []
    };
  }

  try {
    const res = await unifiedTransport.post<{ text: string; candidates: any[] }>("/api/ai/generate-content", {
      model,
      contents
    }, {
      profile: "AI"
    });

    return res || { text: "", candidates: [] };
  } catch (error: any) {
    console.warn("[GeminiEngine Client] Proxy call info:", error.message || error);
    return {
      text: "النظام يعمل حالياً في وضع عدم الاتصال المستقل، أو أن هناك مشكلة مؤقتة في الاتصال بخدمة الذكاء الاصطناعي.",
      candidates: []
    };
  }
}

/**
 * Gemini AI Engine Client - Invokes secure node proxies to query Gemini.
 */
export class GeminiEngine {
  static getClient() {
    return {
      models: {
        generateContent: async (options: { model: string; contents: any }) => {
          return callAiProxy(options.model, options.contents);
        }
      }
    };
  }

  static async generateInsight(prompt: string): Promise<string> {
    const res = await callAiProxy("gemini-3.5-flash", prompt);
    return res.text;
  }
}

export const ai = {
  getModel: (model: string = "gemini-flash-latest") => {
    return {
      generateContent: async (contents: any) => {
        return callAiProxy(model, contents);
      }
    };
  },
  generateInsight: GeminiEngine.generateInsight,
  models: {
    generateContent: async (options: { model: string; contents: any }) => {
      return callAiProxy(options.model, options.contents);
    }
  }
};
