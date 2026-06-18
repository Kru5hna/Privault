import { LandingBody } from "@/components/landing/landing-body";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { ScrollProgress, SmoothScroll } from "@/components/landing/motion-primitives";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-white font-sans antialiased">
      <SmoothScroll />
      <ScrollProgress />
      <LandingNav />
      <LandingHero />
      <LandingBody />
      <LandingFooter />
    </div>
  );
}
