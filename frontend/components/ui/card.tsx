import * as React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-[#1e2a45] bg-[#0d1424]",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: CardProps) {
  return <div className={["p-5 pb-0", className].join(" ")} {...props} />;
}

export function CardContent({ className = "", ...props }: CardProps) {
  return <div className={["p-5", className].join(" ")} {...props} />;
}

export function CardFooter({ className = "", ...props }: CardProps) {
  return <div className={["p-5 pt-0", className].join(" ")} {...props} />;
}

export function CardTitle({ className = "", ...props }: CardProps) {
  return (
    <h3
      className={["text-base font-semibold text-white", className].join(" ")}
      {...props}
    />
  );
}

export function CardDescription({ className = "", ...props }: CardProps) {
  return (
    <p
      className={["mt-1 text-sm text-[#93a0b4]", className].join(" ")}
      {...props}
    />
  );
}
