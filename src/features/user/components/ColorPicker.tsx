import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export const AVATAR_COLORS = [
  "#E53935",
  "#FB8C00",
  "#FDD835",
  "#43A047",
  "#00897B",
  "#1E88E5",
  "#8E24AA",
  "#D81B60",
  "#6D4C41",
  "#757575",
];

type ColorPickerPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

function getRadialPosition(
  index: number,
  total: number,
  position: ColorPickerPosition,
  radius: number
) {
  const angleRange = 90;
  const startAngle = {
    "top-right": -90,
    "bottom-right": 0,
    "bottom-left": 90,
    "top-left": 180,
  }[position];

  const denom = Math.max(1, total - 1);
  const angle = startAngle + (index / denom) * angleRange;
  const rad = (angle * Math.PI) / 180;

  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function getHoverZone(position: ColorPickerPosition): CSSProperties {
  switch (position) {
    case "top-right":
      return { top: 0, right: 0, width: "50%", height: "50%" };
    case "top-left":
      return { top: 0, left: 0, width: "50%", height: "50%" };
    case "bottom-right":
      return { bottom: 0, right: 0, width: "50%", height: "50%" };
    case "bottom-left":
      return { bottom: 0, left: 0, width: "50%", height: "50%" };
    default:
      return { top: 0, right: 0, width: "50%", height: "50%" };
  }
}

/**
 * Radial color picker anchored to a relative avatar container.
 *
 * Put this inside a `relative` wrapper that is the same size as the avatar circle.
 * Hover the quadrant => swatches appear around the avatar center.
 */
interface ColorPickerProps {
  value?: string | null;
  onChange?: (color: string) => void;
  position?: ColorPickerPosition;
  radius?: number;
  swatchSize?: number;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  position = "top-right",
  radius = 86,
  swatchSize = 18,
  className,
}: ColorPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selected = value ?? AVATAR_COLORS[0];
  const hoverZone = useMemo(() => getHoverZone(position), [position]);

  return (
    <div
      className={cn("absolute inset-0", className)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hover hot-zone */}
      <div
        className="absolute z-20"
        style={hoverZone}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      />

      {/* Indicator bubble (always visible) */}
      <div
        className="absolute z-30"
        style={{
          ...(position === "top-right" ? { top: -6, right: -6 } : {}),
          ...(position === "top-left" ? { top: -6, left: -6 } : {}),
          ...(position === "bottom-right" ? { bottom: -6, right: -6 } : {}),
          ...(position === "bottom-left" ? { bottom: -6, left: -6 } : {}),
        }}
      >
        <button
          type="button"
          className="h-8 w-8 rounded-full bg-background border-2 border-border shadow-sm flex items-center justify-center"
          aria-label="Choose avatar color"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((v) => !v)}
        >
          <div
            className="h-4 w-4 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: selected }}
          />
        </button>
      </div>

      {/* Swatches (anchored at avatar center) */}
      <div
        className="absolute inset-0 z-40"
        style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        {AVATAR_COLORS.map((color, index) => {
          const isSelected = color === selected;
          const pos = getRadialPosition(index, AVATAR_COLORS.length, position, radius);

          return (
            <button
              key={color}
              type="button"
              onClick={() => {
                onChange?.(color);
                setIsExpanded(false);
              }}
              className={cn(
                "absolute rounded-full flex items-center justify-center",
                "transition-all ease-[cubic-bezier(0.4,0,0.2,1)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
              style={{
                left: "50%",
                top: "50%",
                width: swatchSize,
                height: swatchSize,
                transform: isExpanded
                  ? `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`
                  : "translate(-50%, -50%)",
                opacity: isExpanded ? 1 : 0,
                transitionDelay: isExpanded ? `${index * 18}ms` : "0ms",
                transitionDuration: "150ms",
              }}
              aria-label={`Select color ${color}`}
              aria-pressed={isSelected}
            >
              <div
                className={cn(
                  "h-full w-full rounded-full shadow-md ring-1 ring-black/10 transition-transform",
                  "hover:scale-125",
                  isSelected && "ring-2 ring-white shadow-lg scale-110"
                )}
                style={{ backgroundColor: color }}
              >
                {isSelected && (
                  <div className="flex h-full w-full items-center justify-center">
                    <Check className="h-3 w-3 text-white drop-shadow" strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}








