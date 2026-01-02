import React from "react";
import { cn } from "@/shared/lib/utils";

const SIZE_CLASS = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  "2xl": "max-w-[96rem]",
  full: "max-w-none",
} as const;

type ContainerProps<T extends React.ElementType> = {
  as?: T;
  size?: keyof typeof SIZE_CLASS | string;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "size" | "className" | "children">;

export function Container<T extends React.ElementType = "div">({
  as,
  size = "lg",
  className,
  children,
  ...props
}: ContainerProps<T>) {
  const sizeClass = SIZE_CLASS[size as keyof typeof SIZE_CLASS] ?? size;
  const Component = (as ?? "div") as React.ElementType;

  return (
    <Component
      {...props}
      className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", sizeClass, className)}
    >
      {children}
    </Component>
  );
}
