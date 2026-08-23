import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", disabled, children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

    const variants = {
      default: "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-glow-sm hover:shadow-glow-md",
      secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80 shadow-sm",
      outline: "border border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 hover:text-white",
      ghost: "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60",
      destructive: "bg-rose-600 hover:bg-rose-500 text-white shadow-sm",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-xs gap-1.5",
      md: "px-4 py-2 text-sm gap-2",
      lg: "px-5 py-2.5 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        className={clsx(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";