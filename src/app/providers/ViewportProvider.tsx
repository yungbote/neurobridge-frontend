import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export const BREAKPOINTS = {
  xs: 360,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
  "3xl": 1920,
  "4xl": 2560,
} as const;

type BreakpointKey = keyof typeof BREAKPOINTS;
type BreakpointMap = Record<BreakpointKey, boolean>;

interface ViewportState {
  width: number;
  height: number;
  bp: BreakpointKey | "base";
  up: BreakpointMap;
  down: BreakpointMap;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface ViewportContextValue extends ViewportState {
  between: (min: BreakpointKey, maxExclusive: BreakpointKey) => boolean;
}

const KEYS = Object.keys(BREAKPOINTS) as BreakpointKey[];

const getActiveBreakpoint = (width: number): ViewportState["bp"] => {
  let active: ViewportState["bp"] = "base";
  for (const k of KEYS) {
    if (width >= BREAKPOINTS[k]) active = k;
  }
  return active;
};

const compute = (width: number, height: number): ViewportState => {
  const up = {} as BreakpointMap;
  const down = {} as BreakpointMap;
  for (const k of KEYS) {
    const px = BREAKPOINTS[k];
    up[k] = width >= px;
    down[k] = width < px;
  }

  return {
    width,
    height,
    bp: getActiveBreakpoint(width),
    up,
    down,
    isMobile: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
  };
};

const defaultState = compute(0, 0);

const ViewportContext = createContext<ViewportContextValue>({
  ...defaultState,
  between: () => false,
});

interface ViewportProviderProps {
  children: ReactNode;
}

export const ViewportProvider = ({ children }: ViewportProviderProps) => {
  const [state, setState] = useState<ViewportState>(() => {
    if (typeof window === "undefined") return compute(0, 0);
    return compute(window.innerWidth, window.innerHeight);
  });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqls = KEYS.map((k) =>
      window.matchMedia(`(min-width: ${BREAKPOINTS[k]}px)`)
    );
    const recompute = () => {
      setState(compute(window.innerWidth, window.innerHeight));
    };
    const scheduleRecompute = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recompute();
      });
    };
    recompute();
    const onMQChange = () => recompute();
    for (const mql of mqls) {
      if (mql.addEventListener) mql.addEventListener("change", onMQChange);
      else mql.addListener(onMQChange);
    }
    window.addEventListener("resize", scheduleRecompute);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const mql of mqls) {
        if (mql.removeEventListener) mql.removeEventListener("change", onMQChange);
        else mql.removeListener(onMQChange);
      }
      window.removeEventListener("resize", scheduleRecompute);
    };
  }, []);

  const value = useMemo(() => {
    const between = (min: BreakpointKey, maxExclusive: BreakpointKey) => {
      const minPx = BREAKPOINTS[min];
      const maxPx = BREAKPOINTS[maxExclusive];
      if (typeof minPx !== "number" || typeof maxPx !== "number") return false;
      return state.width >= minPx && state.width < maxPx;
    };
    return { ...state, between };
  }, [state]);

  return (
    <ViewportContext.Provider value={value}>
      {children}
    </ViewportContext.Provider>
  );
};

export function useViewport() {
  return useContext(ViewportContext);
}

export function useIsMobile() {
  return useViewport().isMobile;
}

export function useIsTablet() {
  return useViewport().isTablet;
}

export function useIsDesktop() {
  return useViewport().isDesktop;
}

export function useUp(key: BreakpointKey) {
  const { up } = useViewport();
  return !!up?.[key];
}

export function useDown(key: BreakpointKey) {
  const { down } = useViewport();
  return !!down?.[key];
}









