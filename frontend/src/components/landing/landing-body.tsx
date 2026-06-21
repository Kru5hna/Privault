"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/app/context";
import {
  CHALLENGE_STEPS,
  FAQ_ITEMS,
  LANDING_STATS,
  SECURITY_STRATEGIES,
  VAULT_FEATURES,
} from "./data";
import { CtaActions } from "./cta-actions";
import {
  AnimatedCounter,
  FadeUp,
  MagneticButton,
} from "./motion-primitives";
import { StrategyCard } from "./strategy-card";

export function LandingBody() {
  return (
    <>
      <StatsBand />
      <MissionSection />
      <ChallengeSection />
      <SpecificationsSection />
      <StrategiesSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}


function StatsBand() {
  return (
    <section className="relative bg-[#E41613] py-14 sm:py-16 md:py-20 overflow-hidden">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-12">
          {LANDING_STATS.map((stat, index) => (
            <FadeUp key={stat.label} delay={index * 0.1}>
              <div className="text-center md:text-left">
                <div className="font-serif text-5xl md:text-6xl font-light text-white">
                  <AnimatedCounter
                    value={stat.value}
                    start={stat.start}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    duration={2}
                  />
                </div>
                <div className="text-micro text-white/60 mt-3">
                  {stat.label}
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function MissionSection() {
  const { user } = useAuth();
  return (
    <section
      id="about"
      className="relative py-16 sm:py-28 md:py-40 bg-[#0A0A0A] overflow-hidden dotted-grid-dark"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <FadeUp>
              <p className="text-label text-[#E41613] mb-6">Core Mission</p>
            </FadeUp>
            <FadeUp delay={0.15}>
              <div className="w-16 h-[1px] bg-white/20" />
            </FadeUp>
          </div>

          <div className="lg:col-span-8">
            <FadeUp delay={0.2}>
              <h2 className="text-display text-[clamp(2rem,4vw,3.5rem)] text-white/90 leading-[1.15]">
                We built the vault that{" "}
                <span className="text-[#E41613] italic font-serif font-normal">
                  cannot be opened.
                </span>{" "}
                Not by us. Not by hackers. Not by governments.
              </h2>
            </FadeUp>
            <FadeUp delay={0.35}>
              <p className="mt-8 text-base text-white/40 font-light leading-relaxed max-w-xl">
                Founded in 2026, Privault exists because &quot;trust us&quot; is not a
                security model. Every file is encrypted with AES-256-GCM in your
                browser before transmission. Your RSA-2048 private key never
                reaches our servers. Your password derivations use independent
                salts so auth and encryption stay separate. No backdoors. No
                recovery emails. No exceptions.
              </p>
            </FadeUp>
            <FadeUp delay={0.45}>
              <Link
                href={user ? "/dashboard" : "/register"}
                className="inline-flex items-center gap-2 mt-8 text-micro text-white/60 hover:text-[#E41613] transition-colors group"
              >
                {user ? "Go to Dashboard" : "Start encrypting today"}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  &rarr;
                </span>
              </Link>
            </FadeUp>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChallengeSection() {
  return (
    <section
      id="challenge"
      className="relative py-16 sm:py-28 md:py-40 bg-[#0A0A0A] overflow-hidden border-t border-white/5"
    >
      <div className="absolute inset-0 dotted-grid-dark opacity-30" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E41613]/50 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-12 sm:mb-20 max-w-3xl">
          <FadeUp>
            <p className="text-label text-[#E41613] mb-4">The Challenge</p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="font-serif text-3xl md:text-5xl font-light text-white leading-tight">
              We dare you to{" "}
              <span className="italic text-[#E41613]">break in.</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="mt-6 text-base text-white/40 font-light leading-relaxed max-w-xl">
              Most security products ask you to trust their word. We&apos;re
              asking you to try your luck.
            </p>
          </FadeUp>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CHALLENGE_STEPS.map((item, index) => (
            <FadeUp key={item.step} delay={index * 0.15}>
              <div
                className={`relative border ${
                  item.highlight
                    ? "border-[#E41613]/40 bg-[#E41613]/[0.03]"
                    : "border-white/10 bg-white/[0.02]"
                } p-8 h-full transition-all duration-500 hover:border-[#E41613]/50`}
              >
                {item.highlight && (
                  <div className="absolute top-0 right-0 bg-[#E41613] px-3 py-1">
                    <span className="text-micro text-white">YOU GET THIS</span>
                  </div>
                )}
                <span className="text-micro text-white/20 mb-6 block">
                  Step {item.step}
                </span>
                <h3 className="font-serif text-xl font-normal text-white mb-4">
                  {item.title}
                </h3>
                <p className="text-sm text-white/35 leading-relaxed font-light">
                  {item.desc}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp delay={0.6}>
          <div className="mt-16 text-center">
            <p className="text-micro text-white/30 mb-6">
              Still not convinced? Every line of code is open for inspection.
            </p>
            <a
              href="https://github.com/kru5hna/privault"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-[#E41613] transition-colors font-mono"
            >
              <span className="text-micro">GitHub</span>
              <span className="inline-block text-lg">&rarr;</span>
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function SpecificationsSection() {
  const { user } = useAuth();
  return (
    <section
      id="metrics"
      className="relative py-16 sm:py-28 md:py-32 bg-[#111111] border-y border-white/5"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <FadeUp>
              <p className="text-label text-white/40 mb-4">Specifications</p>
            </FadeUp>
            <FadeUp delay={0.1}>
              <h3 className="font-serif text-3xl md:text-4xl font-light text-white mb-6">
                Your Vault,
                <br />
                <span className="text-[#E41613]">Your Keys</span>
              </h3>
            </FadeUp>
            <FadeUp delay={0.2}>
              <p className="text-sm text-white/40 font-light leading-relaxed mb-8">
                Every locking operation happens seamlessly inside your browser.
                Your master password never leaves your device, keeping you in
                complete control. It&apos;s private document storage that feels
                simple.
              </p>
            </FadeUp>
            <FadeUp delay={0.3}>
              <MagneticButton>
                <Link href={user ? "/dashboard" : "/register"} className="btn-primary">
                  <span className="btn-bg" />
                  <span className="btn-text">{user ? "Go to Dashboard" : "Create Secure Vault"}</span>
                </Link>
              </MagneticButton>
            </FadeUp>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 gap-[1px] bg-white/5 border border-white/5 overflow-hidden sm:grid-cols-2">
              {VAULT_FEATURES.map((feature, index) => (
                <FadeUp key={feature.title} delay={index * 0.12}>
                  <div className="bg-[#111111] p-6 sm:p-8 md:p-10 hover:bg-white/[0.02] transition-colors duration-500 group h-full">
                    <div className="h-2 w-2 rounded-full bg-[#E41613] mb-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="font-serif text-xl font-light text-white mb-3 group-hover:text-[#E41613] transition-colors duration-500">
                      {feature.title}
                    </div>
                    <div className="text-sm text-white/40 font-light leading-relaxed">
                      {feature.desc}
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StrategiesSection() {
  return (
    <section
      id="features"
      className="relative py-16 sm:py-28 md:py-40 bg-[#0A0A0A] overflow-hidden"
    >
      <div className="absolute inset-0 dotted-grid-dark opacity-60" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-12 max-w-3xl sm:mb-20">
          <FadeUp>
            <p className="text-label text-[#E41613] mb-4">
              Cryptographic Strategies
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="font-serif text-3xl md:text-5xl font-light text-white leading-tight">
              Simple concepts,{" "}
              <span className="italic text-[#E41613]">
                robust <br />
              </span>{" "}
              protection across all your documents.
            </h2>
          </FadeUp>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {SECURITY_STRATEGIES.map((card, index) => (
            <FadeUp key={card.num} delay={index * 0.12}>
              <StrategyCard card={card} />
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="relative py-20 sm:py-28 md:py-40 bg-[#0A0A0A] border-t border-white/5 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-brand text-[15vw] text-white/[0.02] select-none whitespace-nowrap">
          ENCRYPTED
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
        <FadeUp>
          <p className="text-label text-[#E41613] mb-6">Get Started</p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-6xl font-light text-white leading-tight mb-8">
            Stop trusting.
            <br />
            <span className="italic text-[#E41613]">Start proving.</span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="text-base text-white/40 font-light leading-relaxed mb-12 max-w-lg mx-auto">
            Create your vault in seconds. No credit card. No tracking. No
            &quot;we take your privacy seriously&quot; marketing fluff. Just
            encryption that actually works the way you think it does.
          </p>
        </FadeUp>
        <FadeUp delay={0.3}>
          <CtaActions />
        </FadeUp>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id="faq"
      className="relative py-16 sm:py-28 md:py-40 bg-black overflow-hidden border-t border-white/5"
    >
      <div className="absolute inset-0 dotted-grid-dark opacity-30 pointer-events-none" />
      
      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-12 sm:mb-20 text-center">
          <FadeUp>
            <p className="text-label text-[#E41613] mb-4">FAQ</p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="font-serif text-3xl md:text-5xl font-light text-white leading-tight">
              Frequently Asked <span className="italic text-[#E41613]">Questions</span>
            </h2>
          </FadeUp>
        </div>

        <div className="space-y-4 max-w-3xl mx-auto">
          {FAQ_ITEMS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <FadeUp key={index} delay={index * 0.08}>
                <div 
                  className="border-b border-white/10 hover:border-white/20 transition-colors duration-300"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between py-6 text-left focus:outline-none group cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <span className="text-lg md:text-xl font-light text-white/90 group-hover:text-white transition-colors duration-300 pr-4">
                      {faq.question}
                    </span>
                    <div className="flex-shrink-0 ml-4">
                      <div className="relative w-8 h-8 rounded-full border border-white/10 group-hover:border-white/30 flex items-center justify-center transition-colors duration-300 bg-white/5">
                        <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                          <span className="absolute w-3.5 h-[1.5px] bg-white transition-transform duration-300" />
                          <span
                            className={`absolute w-[1.5px] h-3.5 bg-white transition-transform duration-300 ${
                              isOpen ? "rotate-90 scale-y-0" : ""
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pb-6 pr-12 text-sm md:text-base text-white/50 leading-relaxed font-light">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

