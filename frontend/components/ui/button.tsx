import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#4f8ef7] text-white hover:bg-[#3d7ce6] shadow-sm shadow-[#4f8ef7]/20",
  secondary: "bg-[#1a2540] text-[#eef2fb] hover:bg-[#223052]",
  ghost: "bg-transparent text-[#93a0b4] hover:bg-[#131c30] hover:text-white",
  outline: "border border-[#2a3a5f] text-[#eef2fb] hover:bg-[#131c30]",
  danger: "bg-[#f87171]/15 text-[#f87171] hover:bg-[#f87171]/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
  icon: "h-10 w-10",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8ef7]/60",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
      {...props}
    />
  )
);
Button.displayName = "Button";
