import * as React from "react";

import { Button, type ButtonProps } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

type TooltipSide = React.ComponentPropsWithoutRef<typeof TooltipContent>["side"];
type TooltipAlign = React.ComponentPropsWithoutRef<typeof TooltipContent>["align"];

interface IconButtonProps extends ButtonProps {
  label: string;
  shortcut?: string;
  tooltipSide?: TooltipSide;
  tooltipAlign?: TooltipAlign;
  tooltipSideOffset?: number;
  tooltipAlignOffset?: number;
}

function IconButton({
  label,
  shortcut,
  tooltipSide = "top",
  tooltipAlign = "center",
  tooltipSideOffset = 6,
  tooltipAlignOffset,
  ...props
}: IconButtonProps) {
  const ariaLabel = props["aria-label"] ?? label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={ariaLabel} {...props} />
      </TooltipTrigger>
      <TooltipContent
        side={tooltipSide}
        align={tooltipAlign}
        sideOffset={tooltipSideOffset}
        alignOffset={tooltipAlignOffset}
        shortcut={shortcut}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { IconButton };
