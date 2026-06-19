"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-[var(--popover)] group-[.toaster]:text-[var(--popover-foreground)] group-[.toaster]:border-[var(--border)] group-[.toaster]:rounded-none group-[.toaster]:shadow-2xl",
          description: "group-[.toast]:text-white/60",
          actionButton: "group-[.toast]:bg-[#E41613] group-[.toast]:text-white group-[.toast]:font-bold group-[.toast]:rounded-none group-[.toast]:border group-[.toast]:border-[#E41613] group-[.toast]:hover:bg-black group-[.toast]:transition-colors group-[.toast]:px-4 group-[.toast]:py-2 group-[.toast]:text-xs cursor-pointer",
          cancelButton: "group-[.toast]:bg-transparent group-[.toast]:text-white/80 group-[.toast]:font-semibold group-[.toast]:rounded-none group-[.toast]:border group-[.toast]:border-white/20 group-[.toast]:hover:bg-white/5 group-[.toast]:transition-colors group-[.toast]:px-4 group-[.toast]:py-2 group-[.toast]:text-xs cursor-pointer",
          closeButton: "group-[.toast]:bg-black group-[.toast]:text-white group-[.toast]:border-white/10 group-[.toast]:hover:bg-white/10 group-[.toast]:transition-colors cursor-pointer",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
