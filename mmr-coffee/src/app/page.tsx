"use client";
import { useCallback, useRef, useState } from "react";
import { Collection } from "@/components/sections/Collection";
import { Experience } from "@/components/sections/Experience";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { Journey } from "@/components/sections/Journey";
import { Menu } from "@/components/sections/Menu";
import { Nav } from "@/components/sections/Nav";
import { Story } from "@/components/sections/Story";
import { Cursor } from "@/components/ui/Cursor";
import { Grain } from "@/components/ui/Grain";
import { LiquidTransition, type LiquidHandle } from "@/components/ui/LiquidTransition";
import { Preloader } from "@/components/ui/Preloader";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import { motionState } from "@/lib/scroll";

export default function Home() {
  const [started, setStarted] = useState(false);
  const liquid = useRef<LiquidHandle>(null);
  const onDone = useCallback(() => setStarted(true), []);

  /** Navigate with a liquid wipe: flood, jump while covered, drain. */
  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const jump = () => {
      if (motionState.lenis) motionState.lenis.scrollTo(el, { immediate: true, force: true });
      else el.scrollIntoView();
    };
    if (liquid.current) liquid.current.play(jump);
    else jump();
  }, []);

  return (
    <>
      <SmoothScroll />
      <Preloader onDone={onDone} />
      <Cursor />
      <Grain />
      <LiquidTransition ref={liquid} />
      <Nav go={go} visible={started} />
      <main>
        <Hero started={started} go={go} />
        <Journey />
        <Collection go={go} />
        <Experience />
        <Story />
        <Menu />
      </main>
      <Footer />
    </>
  );
}
