"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseX: number;
  baseY: number;
  opacity: number;
};

const SPACING = 50;

function createParticles(width: number, height: number) {
  const particles: Particle[] = [];

  for (let x = SPACING / 2; x < width; x += SPACING) {
    for (let y = SPACING / 2; y < height; y += SPACING) {
      const opacity = 0.15 + Math.random() * 0.25;

      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        vx: 0,
        vy: 0,
        size: 1.5 + Math.random() * 1.5,
        color: `rgba(255, 255, 255, ${opacity})`,
        opacity,
      });
    }
  }

  return particles;
}

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const mouse = { x: -1000, y: -1000, radius: 160 };

    const setCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(width, height);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.hypot(dx, dy);

        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);

          particle.vx += Math.cos(angle) * force * 2.4;
          particle.vy += Math.sin(angle) * force * 2.4;
          particle.color = `rgba(228, 22, 19, ${0.3 + force * 0.7})`;
          particle.size = 1.5 + force * 3;
        } else {
          particle.vx += (particle.baseX - particle.x) * 0.04;
          particle.vy += (particle.baseY - particle.y) * 0.04;
          particle.color = `rgba(255, 255, 255, ${particle.opacity})`;
          particle.size = 1.5 + Math.random() * 0.3;
        }

        particle.vx *= 0.84;
        particle.vy *= 0.84;
        particle.x += particle.vx;
        particle.y += particle.vy;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        if (distance < mouse.radius * 1.5) {
          for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex++) {
            const nextParticle = particles[nextIndex];
            const nextDistance = Math.hypot(
              particle.x - nextParticle.x,
              particle.y - nextParticle.y
            );

            if (nextDistance < 80) {
              ctx.beginPath();
              ctx.moveTo(particle.x, particle.y);
              ctx.lineTo(nextParticle.x, nextParticle.y);
              ctx.strokeStyle = `rgba(228, 22, 19, ${
                0.08 * (1 - nextDistance / 80)
              })`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    setCanvasSize();
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", setCanvasSize);
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", setCanvasSize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "auto" }}
    />
  );
}
