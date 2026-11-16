"use client";
import { useCallback, useState } from "react";
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
import { Preloader } from "@/components/ui/Preloader";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import { scrollToId } from "@/lib/scroll";

export default function Home() {
  const [started, setStarted] = useState(false);
  const onDone = useCallback(() => setStarted(true), []);

  const go = useCallback((id: string) => scrollToId(id), []);

  return (
    <>
      <SmoothScroll />
      <Preloader onDone={onDone} />
      <Cursor />
      <Grain />
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
