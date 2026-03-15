"use client";
import { useState } from "react";
import { motion, MotionConfig, AnimatePresence } from "motion/react";

interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  normalColor?: string;
  loadingColor?: string;
  textColor?: string;
  loadingTextColor?: string;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
}

const textAnimation = {
  variants: {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40, filter: "blur(4px)" },
  },
  initial: "initial",
  animate: "animate",
  exit: "exit",
};

const iconAnimation = {
  variants: {
    initial: { opacity: 0, scale: 0 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0 },
  },
  initial: "initial",
  animate: "animate",
  exit: "exit",
};

const LoadingSpinner = ({
  size,
  loadingTextColor,
}: {
  size: "sm" | "md" | "lg";
  loadingTextColor: string;
}) => {
  const spinnerSizes = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
  };

  return (
    <svg className={spinnerSizes[size]} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="10"
        className="stroke-black/10"
        strokeWidth="4"
        fill="none"
      />
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke={loadingTextColor}
        strokeWidth="4"
        fill="none"
        strokeDasharray="62.33185307179586"
        strokeDashoffset="43.66456772333291"
        strokeLinecap="round"
        animate={{ rotate: [0, 360 * 3] }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </svg>
  );
};

const Button = ({
  children = "Submit",
  className,
  onClick,
  disabled = false,
  loading: externalLoading,
  loadingText = "Loading",
  normalColor = "#27B1FF",
  loadingColor = "#1ba6f6",
  textColor = "white",
  loadingTextColor = "white",
  size = "sm",
  fullWidth = false,
  style,
  type = "button",
}: ButtonProps) => {
  const [internalLoading, setInternalLoading] = useState(false);

  // Use external loading state if provided, otherwise use internal state
  const isLoading =
    externalLoading !== undefined ? externalLoading : internalLoading;

  const handleClick = () => {
    if (disabled || isLoading) return;

    if (onClick) {
      onClick();
    } else {
      // Only toggle internal state if no external onClick is provided
      setInternalLoading((prev) => !prev);
    }
  };

  // Size configurations
  const sizeClasses = {
    sm: "h-10 px-4 text-sm",
    md: "h-14 px-6 text-xl",
    lg: "h-16 px-8 text-2xl",
  };

  return (
    <MotionConfig transition={{ type: "spring", duration: 0.6, bounce: 0.4 }}>
      <motion.button
        type={type}
        onClick={handleClick}
        disabled={disabled || isLoading}
        whileTap={!disabled && !isLoading ? { scale: 0.98 } : {}}
        className={`
          relative flex font-sans text-[0.9rem] items-center justify-center gap-3 overflow-hidden  tracking-tight
          text-center font-medium whitespace-nowrap transition-all duration-300 select-none
          ${sizeClasses[size]}
          ${fullWidth ? "w-full" : ""}
          ${
            disabled || isLoading
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:brightness-90"
          }
          ${className || ""}
        `}
        style={{
          borderRadius: 100,
          backgroundColor: isLoading ? loadingColor : normalColor,
          color: isLoading ? loadingTextColor : textColor,
          ...style,
        }}
        layout
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {isLoading && (
            <motion.div key="loading-icon" {...iconAnimation} layout="position">
              <LoadingSpinner size={size} loadingTextColor={loadingTextColor} />
            </motion.div>
          )}
          <motion.div
            key={`${isLoading ? "loading" : "normal"}-text`}
            {...textAnimation}
            layout="position"
            className="flex items-center gap-1.5"
          >
            {isLoading ? loadingText : children}
          </motion.div>
        </AnimatePresence>
      </motion.button>
    </MotionConfig>
  );
};

export { Button };
export default Button;
