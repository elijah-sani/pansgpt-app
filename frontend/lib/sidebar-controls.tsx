"use client";

import { createContext, useContext } from "react";

type SidebarControls = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const noop = () => {};

export const SidebarControlsContext = createContext<SidebarControls>({
  isOpen: false,
  open: noop,
  close: noop,
  toggle: noop,
});

export const useSidebarControls = () => useContext(SidebarControlsContext);
export const useSidebarTrigger = () => useSidebarControls().open;
