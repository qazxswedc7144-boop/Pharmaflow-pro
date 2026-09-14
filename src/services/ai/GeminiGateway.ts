/**
 * PharmaFlow Gemini Gateway Layer
 * Enterprise boundary for Gemini model interactions, intelligent routing, server proxy, rate limiting, retries, and streaming.
 */

import {
  AIRequestOptions,
  AIResponse,
  AIModelTarget,
} from './types';
import { PromptManager } from './PromptManager';
import { aiContextBuilder } from './AIContextBuilder';
import { AIResponseValidator } from './AIResponseValidator';
import { AIUsageTracker } from './AIUsageTracker';

export class GeminiGateway {
  private static DEFAULT_MODEL: AIModelTarget = 'gemini-3.6-flash';
  private static ADVANCED_MODEL: AIModelTarget = 'gemini-3.1-pro-preview';

  private static RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private static MAX_USER_REQUESTS_PER_WINDOW = 30; // 30 req/min user limit
  private static MAX_PROMPT_CHARS = 20000; // Prompt character ceiling
  private static DEFAULT_TIMEOUT_MS = 20000; // 20 seconds timeout limit
  private static MAX_RETRIES = 3;

  private static userRequestCounts: Map<string, { count: number; windowStart: number }> = new Map();

  /**
   * Intelligent Model Router
   * Determines whether to target fast Flash or deep Pro model based on task complexity,
   * requested capabilities, and user role.
   */
  public static selectModel(options: AIRequestOptions): AIModelTarget {
    if (options.model) {
      return options.model;
    }

    const role = options.userContext.userRole;
    const complexity = options.taskComplexity || 'simple';
    const contexts = options.includeContexts || [];

    // Rule 1: High complexity task explicitly requested
    if (complexity === 'complex') {
      return this.ADVANCED_MODEL;
    }

    // Rule 2: Deep financial audit or drug safety cross-validation by administrative roles
    if (
      (contexts.includes('financials') || contexts.includes('drugInfo')) &&
      (role === 'admin' || role === 'accountant' || role === 'pharmacist') &&
      complexity === 'medium'
    ) {
      return this.ADVANCED_MODEL;
    }

    // Default fast Flash model
    return this.DEFAULT_MODEL;
  }

  /**
   * Main execution method for AI requests with full reliability, rate limiting, and audit logging.
   */
  public static async execute<T = string>(options: AIRequestOptions): Promise<AIResponse<T>> {
    const startTime = Date.now();
    const model = this.selectModel(options);
    const userId = options.userContext.userId;

    // 1. Rate Limiting Check
    const rateCheck = this.checkRateLimit(userId);
    if (!rateCheck.allowed) {
      AIUsageTracker.logUsage({
        userId,
        branchId: options.userContext.branchId,
        model,
        promptId: options.promptId,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startTime,
        status: 'blocked',
        errorMessage: 'تجاوز حد الاستخدام المسموح لطلبات الذكاء الاصطناعي (30 طلب/دقيقة).',
      });

      return this.buildFallbackResponse<T>(
        model,
        'تم تجاوز حد الاستعلامات المتاحة للذكاء الاصطناعي. يُرجى الانتظار لدقيقة واحدة قبل المحاولة مجدداً.',
        Date.now() - startTime
      );
    }

    // 2. Prompt Template & Permission Authorization
    let systemInstruction = 'أنت مساعد ذكي احترافي لنظام إدارة الصيدليات PharmaFlow ERP.';
    let finalPrompt = options.rawPrompt || '';

    if (options.promptId) {
      const template = PromptManager.getTemplate(options.promptId);
      if (!template) {
        return this.buildFallbackResponse<T>(
          model,
          `نموذج الاستعلام المطلوب غير موجود: ${options.promptId}`,
          Date.now() - startTime
        );
      }

      const authCheck = PromptManager.authorizeUserForTemplate(template, options.userContext);
      if (!authCheck.authorized) {
        AIUsageTracker.logUsage({
          userId,
          branchId: options.userContext.branchId,
          model,
          promptId: options.promptId,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: Date.now() - startTime,
          status: 'blocked',
          errorMessage: authCheck.reason,
        });

        return this.buildFallbackResponse<T>(
          model,
          authCheck.reason || 'غير مصرح لك باستخدام هذا النموذج.',
          Date.now() - startTime
        );
      }

      systemInstruction = template.systemInstruction;

      // 3. Gather Operational Context via Business Services Layer
      if (options.includeContexts && options.includeContexts.length > 0) {
        const consolidatedContext = await aiContextBuilder.buildContext(
          options.userContext,
          options.includeContexts,
          options.variables
        );

        options.variables = {
          ...options.variables,
          inventoryContext: consolidatedContext.inventory,
          salesContext: consolidatedContext.sales,
          purchaseContext: consolidatedContext.purchases,
          financialContext: consolidatedContext.financials,
          drugContext: consolidatedContext.drugInfo,
        };
      }

      finalPrompt = PromptManager.compilePrompt(template.userTemplate, options.variables || {});
    }

    // 4. Prompt Size Protection
    if (finalPrompt.length > this.MAX_PROMPT_CHARS) {
      AIUsageTracker.logUsage({
        userId,
        branchId: options.userContext.branchId,
        model,
        promptId: options.promptId,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startTime,
        status: 'blocked',
        errorMessage: 'تجاوز نص الطلب الحد الأقصى المسموح به (20,000 حرف).',
      });

      return this.buildFallbackResponse<T>(
        model,
        'تجاوز نص الطلب الحد الأقصى المسموح به لضمان سلامة خوادم المؤسسة.',
        Date.now() - startTime
      );
    }

    // 5. Server-Side Execution Proxy with Retry & Timeout
    try {
      const timeoutMs = options.timeoutMs || this.DEFAULT_TIMEOUT_MS;
      const apiResponse = await this.callServerAIProxyWithRetry(
        {
          model,
          systemInstruction,
          prompt: finalPrompt,
          temperature: options.temperature ?? 0.2,
        },
        timeoutMs
      );

      const latencyMs = Date.now() - startTime;

      // 6. Response Safety & Validation
      const safetyCheck = AIResponseValidator.validateTextResponse(
        apiResponse.text,
        options.includeContexts?.[0]
      );

      if (!safetyCheck.isSafe) {
        AIUsageTracker.logUsage({
          userId,
          branchId: options.userContext.branchId,
          model,
          promptId: options.promptId,
          promptTokens: apiResponse.usage?.promptTokens || 0,
          completionTokens: apiResponse.usage?.completionTokens || 0,
          latencyMs,
          status: 'blocked',
          errorMessage: safetyCheck.blockReason,
        });

        return {
          id: `res_safe_block_${Date.now()}`,
          modelUsed: model,
          rawOutput: safetyCheck.blockReason || 'محتوى الإجابة يمثل مخاطرة غير مسموح بها.',
          safetyCheck,
          usage: {
            promptTokens: apiResponse.usage?.promptTokens || 0,
            completionTokens: apiResponse.usage?.completionTokens || 0,
            totalTokens: (apiResponse.usage?.promptTokens || 0) + (apiResponse.usage?.completionTokens || 0),
            latencyMs,
          },
          timestamp: new Date().toISOString(),
        };
      }

      let parsedData: T | undefined;
      if (options.variables?.format === 'json') {
        const jsonValidation = AIResponseValidator.validateJSONResponse<T>(safetyCheck.sanitizedText || apiResponse.text);
        if (jsonValidation.isValid) {
          parsedData = jsonValidation.parsed;
        }
      }

      // Log success
      AIUsageTracker.logUsage({
        userId,
        branchId: options.userContext.branchId,
        model,
        promptId: options.promptId,
        promptTokens: apiResponse.usage?.promptTokens || 0,
        completionTokens: apiResponse.usage?.completionTokens || 0,
        latencyMs,
        status: 'success',
      });

      return {
        id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        modelUsed: model,
        rawOutput: safetyCheck.sanitizedText || apiResponse.text,
        parsedData,
        safetyCheck,
        usage: {
          promptTokens: apiResponse.usage?.promptTokens || 0,
          completionTokens: apiResponse.usage?.completionTokens || 0,
          totalTokens: (apiResponse.usage?.promptTokens || 0) + (apiResponse.usage?.completionTokens || 0),
          latencyMs,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      AIUsageTracker.logUsage({
        userId,
        branchId: options.userContext.branchId,
        model,
        promptId: options.promptId,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs,
        status: 'error',
        errorMessage: err.message,
      });

      return this.buildFallbackResponse<T>(
        model,
        `فشلت خدمة الذكاء الاصطناعي: ${err.message || 'خطأ في الاتصال بالحادم'}`,
        latencyMs
      );
    }
  }

  /**
   * Server-Sent Events (SSE) Streaming execution wrapper
   */
  public static async stream(
    options: AIRequestOptions,
    onChunk: (chunk: string) => void
  ): Promise<{ success: boolean; errorCode?: string; message?: string }> {
    const startTime = Date.now();
    const model = this.selectModel(options);
    const userId = options.userContext.userId;

    const rateCheck = this.checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return {
        success: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: 'تم تجاوز حد الطلبات المتاحة (30 طلب/دقيقة).',
      };
    }

    let systemInstruction = 'أنت مساعد ذكي احترافي لنظام إدارة الصيدليات PharmaFlow ERP.';
    let finalPrompt = options.rawPrompt || '';

    if (options.promptId) {
      const template = PromptManager.getTemplate(options.promptId);
      if (template) {
        systemInstruction = template.systemInstruction;
        finalPrompt = PromptManager.compilePrompt(template.userTemplate, options.variables || {});
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || this.DEFAULT_TIMEOUT_MS);

      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          systemInstruction,
          prompt: finalPrompt,
          temperature: options.temperature ?? 0.2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok || !res.body) {
        return {
          success: false,
          errorCode: 'STREAM_INIT_FAILED',
          message: `فشل إنشاء بث البيانات (HTTP ${res.status})`,
        };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();

          if (dataStr === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              onChunk(parsed.text);
            }
          } catch {
            // Ignore partial lines
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      AIUsageTracker.logUsage({
        userId,
        branchId: options.userContext.branchId,
        model,
        promptId: options.promptId,
        promptTokens: Math.ceil(finalPrompt.length / 4),
        completionTokens: 50,
        latencyMs,
        status: 'success',
      });

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'STREAM_ERROR',
        message: err.name === 'AbortError' ? 'انتهت مهلة استجابة البث (20 ثانية).' : err.message,
      };
    }
  }

  /**
   * Internal HTTP proxy caller with exponential backoff retries and timeout control.
   */
  private static async callServerAIProxyWithRetry(
    payload: {
      model: AIModelTarget;
      systemInstruction: string;
      prompt: string;
      temperature: number;
    },
    timeoutMs: number
  ): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          return await res.json();
        }

        const errorJson = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        lastError = new Error(errorJson.message || `خطأ الخادم (HTTP ${res.status})`);

        // If client error (4xx except 429), don't retry
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw lastError;
        }
      } catch (err: any) {
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = new Error('انتهت مهلة معالجة طلب الذكاء الاصطناعي (20 ثانية).');
        }
      }

      // Exponential delay before retry (500ms, 1000ms, 2000ms)
      if (attempt < this.MAX_RETRIES) {
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }

    throw lastError || new Error('فشلت جميع محاولات الاتصال بخدمة الذكاء الاصطناعي.');
  }

  /**
   * User-level sliding window rate limiter
   */
  private static checkRateLimit(userId: string): { allowed: boolean } {
    const now = Date.now();
    const current = this.userRequestCounts.get(userId);

    if (!current || now - current.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      this.userRequestCounts.set(userId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (current.count >= this.MAX_USER_REQUESTS_PER_WINDOW) {
      return { allowed: false };
    }

    current.count += 1;
    return { allowed: true };
  }

  /**
   * Helper to construct safe fallback response preventing UI crashes
   */
  private static buildFallbackResponse<T>(
    model: AIModelTarget,
    errorMessage: string,
    latencyMs: number
  ): AIResponse<T> {
    return {
      id: `res_err_${Date.now()}`,
      modelUsed: model,
      rawOutput: errorMessage,
      safetyCheck: {
        isSafe: false,
        blockReason: errorMessage,
        flaggedCategories: [],
      },
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
