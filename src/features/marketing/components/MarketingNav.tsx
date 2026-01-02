import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import {
  ABOUT_SECTIONS,
  FEATURES_SECTIONS,
  PRICING_SECTIONS,
  type MarketingSection,
} from "@/features/marketing/data/sections";
import { Button } from "@/shared/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";

function TopLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="cursor-pointer text-sm font-normal text-muted-foreground flex items-center gap-0.5 rounded-lg px-3 py-1.5 whitespace-nowrap hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      {children}
    </Link>
  );
}

interface NavDropdownProps {
  id: string;
  label: string;
  basePath: string;
  sections: MarketingSection[];
  isOpen: boolean;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
}

function NavDropdown({ id, label, basePath, sections, isOpen, setOpenKey }: NavDropdownProps) {
  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpenKey(id);       // open this one
        } else {
          setOpenKey((curr) => (curr === id ? null : curr)); // close if it's this one
        }
      }}
    >
      {/* Trigger: hover OR click to open */}
      <DropdownMenuTrigger
        asChild
        onMouseEnter={() => setOpenKey(id)}
      >
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors",
            "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
          )}
        >
          <span>{label}</span>
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </DropdownMenuTrigger>

      {/* Close when mouse leaves the dropdown panel */}
      <DropdownMenuContent
        align="center"
        sideOffset={8}
        onMouseLeave={() => setOpenKey(null)}
        className="bg-popover/90 border border-border/60 backdrop-blur-md rounded-xl p-2 min-w-[180px] shadow-xl"
      >
        <DropdownMenuItem asChild>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="w-full justify-start px-2 py-1.5 text-sm font-normal hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Link to={basePath}>Overview</Link>
          </Button>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {sections.filter((s) => s.id !== "overview").map((section) => (
          <DropdownMenuItem key={section.id} asChild>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="
              w-full justify-start px-2 py-1.5
              text-sm font-normal
              hover:bg-accent hover:text-accent-foreground
              transition-colors
              cursor-pointer
              "
            >
              <Link to={`${basePath}#${section.id}`}>
                {section.label}
              </Link>
            </Button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarketingNav() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="flex items-center gap-3 lg:gap-4">
      <li>
        <NavDropdown
          id="about"
          label="About"
          basePath="/about"
          sections={ABOUT_SECTIONS}
          isOpen={openId === "about"}
          setOpenKey={setOpenId}
        />
      </li>
      <li>
        <NavDropdown
          id="features"
          label="Features"
          basePath="/features"
          sections={FEATURES_SECTIONS}
          isOpen={openId === "features"}
          setOpenKey={setOpenId}
        />
      </li>
      <li>
        <NavDropdown
          id="pricing"
          label="Pricing"
          basePath="/pricing"
          sections={PRICING_SECTIONS}
          isOpen={openId === "pricing"}
          setOpenKey={setOpenId}
        />
      </li>
    </ul>
  );
}





