import React, { createContext, useContext, useMemo, useState } from "react";

type HomeChatbarDockContextValue = {
  docked: boolean;
  setDocked: (next: boolean) => void;
};

const HomeChatbarDockContext = createContext<HomeChatbarDockContextValue>({
  docked: false,
  setDocked: () => {},
});

export function HomeChatbarDockProvider({ children }: { children: React.ReactNode }) {
  const [docked, setDocked] = useState(false);

  const value = useMemo<HomeChatbarDockContextValue>(
    () => ({
      docked,
      setDocked,
    }),
    [docked]
  );

  return (
    <HomeChatbarDockContext.Provider value={value}>
      {children}
    </HomeChatbarDockContext.Provider>
  );
}

export function useHomeChatbarDock() {
  return useContext(HomeChatbarDockContext);
}
