
"use client";

import { useState, useRef } from "react";
import { Paperclip, SendHorizontal, Image as ImageIcon, Smile, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSendMessage: (content: string, media?: string) => void;
  className?: string;
  initialValue?: string;
}

/**
 * @fileOverview Overhauled Message Input for Conversation Screen.
 * Fixed: Spacious typing area, full-width design, and responsive action buttons.
 */
export function MessageInput({ onSendMessage, className, initialValue }: MessageInputProps) {
  const [content, setContent] = useState(initialValue || "");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (content.trim()) {
      onSendMessage(content);
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("p-4 border-t border-gray-100 bg-white/90 backdrop-blur-xl shrink-0 pb-[env(safe-area-inset-bottom,16px)]", className)}>
      <div className="flex items-end gap-3 max-w-5xl mx-auto">
        <div className="flex-1 flex items-center bg-gray-50 rounded-[1.5rem] px-4 min-h-[52px] border border-black/5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:bg-white transition-all">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 min-h-[40px] max-h-[120px] bg-transparent border-none focus-visible:ring-0 resize-none py-3 px-2 text-[15px] font-medium"
          />
          
          <button className="w-10 h-10 flex items-center justify-center text-gray-400">
            <Smile className="w-5 h-5" />
          </button>
        </div>

        <Button 
          onClick={handleSend}
          disabled={!content.trim()}
          size="icon"
          className={cn(
            "w-[52px] h-[52px] rounded-full shrink-0 shadow-lg active:scale-90 transition-all",
            content.trim() ? "bg-[#00A2FF] text-white shadow-blue-200" : "bg-gray-100 text-gray-400 shadow-none"
          )}
        >
          <Send className="w-6 h-6" />
        </Button>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" />
    </div>
  );
}
