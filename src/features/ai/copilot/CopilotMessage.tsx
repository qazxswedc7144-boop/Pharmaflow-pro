/**
 * PharmaFlow AI Copilot - Message Renderer
 * Renders individual user and assistant messages with model badges, formatting, and safety disclaimers.
 */

import React, { memo } from 'react';
import {
  Sparkles,
  User as UserIcon,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Bot,
  Copy,
  Check,
} from 'lucide-react';

export interface CopilotMessageData {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorCode?: string;
}

interface CopilotMessageProps {
  message: CopilotMessageData;
  onRetry?: () => void;
}

export const CopilotMessage: React.FC<CopilotMessageProps> = memo(({ message, onRetry }) => {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.sender === 'user';

  const handleCopy = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`flex gap-3 my-3 w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      dir="rtl"
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs mt-1 ${
          isUser
            ? 'bg-gradient-to-br from-slate-700 to-slate-900'
            : 'bg-gradient-to-br from-teal-600 to-teal-800'
        }`}
      >
        {isUser ? <UserIcon size={16} /> : <Bot size={18} />}
      </div>

      {/* Message Box */}
      <div
        className={`flex flex-col max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 shadow-xs relative ${
          isUser
            ? 'bg-teal-800 text-white rounded-tr-xs'
            : message.isError
            ? 'bg-red-50 border border-red-200 text-red-900 rounded-tl-xs'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
        }`}
      >
        {/* Header Metadata */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-black/5 text-[11px] opacity-80">
          <div className="flex items-center gap-1.5 font-bold">
            {isUser ? (
              <span>المستخدم</span>
            ) : (
              <>
                <Sparkles size={12} className="text-teal-600" />
                <span className="text-teal-900">المساعد الذكي</span>
                {message.modelUsed && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200/60">
                    {message.modelUsed}
                  </span>
                )}
              </>
            )}
          </div>
          <span className="text-[10px] opacity-70 font-mono">{message.timestamp}</span>
        </div>

        {/* Content */}
        <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-teal-600 animate-pulse mr-1 align-middle" />
          )}
        </div>

        {/* Assistant Safety Disclaimer */}
        {!isUser && !message.isError && message.text && !message.isStreaming && (
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <div className="flex items-center gap-1 font-medium text-amber-700/80 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/50">
              <ShieldCheck size={12} className="shrink-0 text-amber-600" />
              <span>المعلومات المقدمة للمراجعة فقط ولا تغني عن القرار المهني</span>
            </div>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
              title="نسخ النص"
            >
              {copied ? <Check size={12} className="text-teal-600" /> : <Copy size={12} />}
            </button>
          </div>
        )}

        {/* Error State with Retry Button */}
        {message.isError && (
          <div className="mt-3 pt-2 border-t border-red-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-red-700 font-bold">
              <AlertTriangle size={14} className="shrink-0" />
              <span>فشل الحصول على الاستجابة</span>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw size={12} />
                <span>إعادة المحاولة</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

CopilotMessage.displayName = 'CopilotMessage';
