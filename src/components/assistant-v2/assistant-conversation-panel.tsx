"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AssistantConversationPanelProps {
  children: ReactNode;
  className?: string;
}

export function AssistantConversationPanel({
  children,
  className,
}: AssistantConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    scrollToBottom();

    const observer = new MutationObserver(scrollToBottom);
    observer.observe(el, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex max-h-[min(650px,calc(100dvh-22rem))] flex-col gap-4 overflow-y-auto scroll-smooth px-4 py-4 lg:max-h-[650px] lg:px-0 lg:py-0",
        className
      )}
    >
      {children}
      <div ref={bottomRef} aria-hidden className="h-px shrink-0" />
    </div>
  );
}
