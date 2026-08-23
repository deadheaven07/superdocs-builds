import React from "react";
import { clsx } from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "purple" | "indigo" | "outline";
  size?: "sm" | "md";
  className?: string;
  icon?: React.ReactNode;
}

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
  icon,
}: BadgeProps) {
  const variantStyles = {
    default: "bg-slate-800 text-slate-300 border-slate-700/80",
    success: "bg-emerald-950/70 text-emerald-300 border-emerald-800/60 shadow-sm shadow-emerald-900/20",
    warning: "bg-amber-950/70 text-amber-300 border-amber-800/60 shadow-sm shadow-amber-900/20",
    danger: "bg-rose-950/70 text-rose-300 border-rose-800/60 shadow-sm shadow-rose-900/20",
    purple: "bg-purple-950/70 text-purple-300 border-purple-800/60 shadow-sm shadow-purple-900/20",
    indigo: "bg-indigo-950/70 text-indigo-300 border-indigo-800/60 shadow-sm shadow-indigo-900/20",
    outline: "bg-transparent text-slate-400 border-slate-700 hover:border-slate-500",
  }[variant];

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs font-medium",
    md: "px-2.5 py-1 text-xs font-semibold tracking-wide",
  }[size];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border transition-all duration-150",
        variantStyles,
        sizeStyles,
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
