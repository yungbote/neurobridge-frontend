import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ABOUT_SECTIONS } from "@/pages/nonauthenticated/AboutPage";
import { FEATURES_SECTIONS } from "@/pages/nonauthenticated/FeaturesPage";
import { PRICING_SECTIONS } from "@/pages/nonauthenticated/PricingPage";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function TopLink({ to, children }) {
  return (
    <Link
      to={to}
      className="cursor-pointer text-sm font-normal text-muted-foreground flex items-center gap-0.5 rounded-lg px-3 py-1.5 whitespace-nowrap hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      {children}
    </Link>
  );
}

function NavDropdown({ id, label, basePath, sections, isOpen, setOpenKey }) {
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
        className="bg-muted/70 dark:bg-muted/60 border border-border/60 backdrop-blur-xl rounded-lg p-2 min-w-[180px]"
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
  const [openId, setOpenId] = useState(null);

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








