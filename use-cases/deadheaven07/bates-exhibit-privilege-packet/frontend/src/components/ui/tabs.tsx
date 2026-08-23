import { createContext, useContext, ReactNode } from "react";
import { clsx } from "clsx";

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={clsx(className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={clsx(
        "inline-flex h-11 items-center justify-center rounded-xl bg-slate-900/90 border border-slate-800/80 p-1 text-slate-400 backdrop-blur-md shadow-inner-light",
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");

  const { value: currentValue, onValueChange } = context;
  const isActive = currentValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && onValueChange(value)}
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-40 disabled:pointer-events-none",
        isActive
          ? "bg-slate-800 text-sky-400 shadow-sm border border-slate-700 font-bold"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
        className
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used within Tabs");

  const { value: currentValue } = context;
  const isActive = currentValue === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      className={clsx("mt-2 ring-offset-white focus:outline-none", className)}
    >
      {children}
    </div>
  );
}