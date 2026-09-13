import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

export type GlassIconVariant = 'blue' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'violet' | 'slate' | 'cyan' | 'purple';
export type GlassIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface GlassIconProps {
  icon: LucideIcon;
  variant?: GlassIconVariant;
  size?: GlassIconSize;
  className?: string;
  glow?: boolean;
  animated?: boolean;
  id?: string;
  notificationActive?: boolean;
}

export default function GlassIcon({
  icon: IconComponent,
  variant = 'blue',
  size = 'md',
  className = '',
  glow = false,
  animated = true,
  id,
  notificationActive = false
}: GlassIconProps) {
  // Variant configurations for gradients and colors
  const variants: Record<GlassIconVariant, {
    border: string;
    iconColor: string;
    bgColor: string;
  }> = {
    blue: {
      border: 'border-blue-400/40 dark:border-blue-500/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-500/5',
    },
    emerald: {
      border: 'border-emerald-400/40 dark:border-emerald-500/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/5',
    },
    rose: {
      border: 'border-rose-400/40 dark:border-rose-500/30',
      iconColor: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-500/5',
    },
    amber: {
      border: 'border-amber-400/40 dark:border-amber-500/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/5',
    },
    indigo: {
      border: 'border-indigo-400/40 dark:border-indigo-500/30',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-500/5',
    },
    violet: {
      border: 'border-violet-400/40 dark:border-violet-500/30',
      iconColor: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-500/5',
    },
    purple: {
      border: 'border-purple-400/40 dark:border-purple-500/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-500/5',
    },
    slate: {
      border: 'border-slate-300/40 dark:border-slate-600/30',
      iconColor: 'text-slate-600 dark:text-slate-400',
      bgColor: 'bg-slate-500/5',
    },
    cyan: {
      border: 'border-cyan-400/40 dark:border-cyan-500/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-500/5',
    }
  };

  const currentVariant = variants[variant];

  // Size configurations
  const sizes: Record<GlassIconSize, {
    container: string;
    icon: string;
  }> = {
    xs: {
      container: 'w-7 h-7 rounded-lg',
      icon: 'h-3.5 w-3.5',
    },
    sm: {
      container: 'w-9 h-9 rounded-xl',
      icon: 'h-4.5 w-4.5',
    },
    md: {
      container: 'w-11 h-11 rounded-2xl',
      icon: 'h-5 w-5',
    },
    lg: {
      container: 'w-14 h-14 rounded-2xl',
      icon: 'h-7 w-7',
    },
    xl: {
      container: 'w-20 h-20 rounded-3xl',
      icon: 'h-10 w-10',
    }
  };

  const currentSize = sizes[size];

  return (
    <div 
      id={id}
      className={`relative inline-flex items-center justify-center shrink-0 group ${className}`}
    >
      {/* Glass container with custom border, reflection highlight pseudo-elements and subtle internal glow */}
      <div 
        className={`glass-card relative flex items-center justify-center ${currentVariant.bgColor} ${currentSize.container} ${
          animated ? 'transform group-hover:scale-105 group-hover:-translate-y-0.5 transition-all duration-300 ease-out' : ''
        }`}
      >
        {/* The sharp foreground icon component with conditional infinite wiggling animation */}
        <motion.div
          animate={notificationActive ? {
            rotate: [0, -14, 12, -14, 12, -8, 6, -3, 0],
          } : {}}
          transition={notificationActive ? {
            duration: 1.4,
            repeat: Infinity,
            repeatType: "loop",
            repeatDelay: 1.6,
            ease: "easeInOut"
          } : {}}
          className="relative z-10 flex items-center justify-center"
        >
          <IconComponent 
            className={`relative z-10 ${currentVariant.iconColor} ${currentSize.icon} transition-transform duration-300 group-hover:rotate-1`} 
          />
        </motion.div>

        {/* Pulsing Notification Badge Dot at top-right corner of the icon container */}
        {notificationActive && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 z-20">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
          </span>
        )}
      </div>
    </div>
  );
}
