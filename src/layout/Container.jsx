import React from "react";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  "2xl": "max-w-[96rem]",
  full: "max-w-none",
};

export function Container({
  as = "div",
  size = "lg",
  className,
  children,
  ...props
}) {
  const sizeClass = SIZE_CLASS[size] ?? size;

  return React.createElement(
    as,
    {
      ...props,
      className: cn("mx-auto w-full px-4 sm:px-6 lg:px-8", sizeClass, className),
    },
    children
  );
}
