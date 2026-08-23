import React, { useEffect } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl" | "2xl";
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "xl",
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  }[width];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className={clsx(
            "w-screen bg-slate-900 border-l border-slate-800 shadow-2xl shadow-slate-950/90 flex flex-col transform transition-transform duration-300 ease-in-out",
            widthClasses
          )}
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-800/90 bg-slate-900/95 backdrop-blur flex items-start justify-between">
            <div className="space-y-1">
              <div className="text-lg font-semibold text-slate-100 font-display flex items-center gap-2">
                {title}
              </div>
              {subtitle && (
                <div className="text-xs text-slate-400">
                  {subtitle}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
