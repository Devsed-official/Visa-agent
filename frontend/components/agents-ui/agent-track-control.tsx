'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type VariantProps } from 'class-variance-authority';
import { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import { motion } from 'motion/react';
import {
  type TrackReferenceOrPlaceholder,
  useMaybeRoomContext,
  useMediaDeviceSelect,
} from '@livekit/components-react';
import { Check, ChevronDown, Mic, Video } from 'lucide-react';
import { AgentAudioVisualizerBar } from '@/components/agents-ui/agent-audio-visualizer-bar';
import { AgentTrackToggle } from '@/components/agents-ui/agent-track-toggle';
import { toggleVariants } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

const TRANSITION_EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Props for the AgentTrackControl component.
 */
export type AgentTrackControlProps = VariantProps<typeof toggleVariants> & {
  /**
   * The type of media device (audioinput or videoinput).
   */
  kind: MediaDeviceKind;
  /**
   * The track source to control (Microphone, Camera, or ScreenShare).
   */
  source: 'camera' | 'microphone' | 'screen_share';
  /**
   * Whether the track is currently enabled/published.
   */
  pressed?: boolean;
  /**
   * Whether the control is in a pending/loading state.
   */
  pending?: boolean;
  /**
   * Whether the control is disabled.
   */
  disabled?: boolean;
  /**
   * Additional CSS class names to apply to the container.
   */
  className?: string;
  /**
   * The audio track reference for visualization (only for microphone).
   */
  audioTrack?: TrackReferenceOrPlaceholder;
  /**
   * Callback when the pressed state changes.
   */
  onPressedChange?: (pressed: boolean) => void;
  /**
   * Callback when a media device error occurs.
   */
  onMediaDeviceError?: (error: Error) => void;
  /**
   * Callback when the active device changes.
   */
  onActiveDeviceChange?: (deviceId: string) => void;
};

/**
 * A combined track toggle and device selector control with smooth expanding animation.
 * Includes a toggle button and an inline expanding device list.
 *
 * @example
 * ```tsx
 * <AgentTrackControl
 *   kind="audioinput"
 *   source={Track.Source.Microphone}
 *   pressed={isMicEnabled}
 *   onPressedChange={(pressed) => setMicEnabled(pressed)}
 *   onActiveDeviceChange={(deviceId) => setMicDevice(deviceId)}
 * />
 * ```
 */
export function AgentTrackControl({
  kind,
  source,
  pressed,
  pending,
  disabled,
  className,
  audioTrack,
  onPressedChange,
  onMediaDeviceError,
  onActiveDeviceChange,
}: AgentTrackControlProps) {
  const room = useMaybeRoomContext();
  const [isOpen, setIsOpen] = useState(false);
  const [requestPermissions, setRequestPermissions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    room,
    kind,
    requestPermissions,
    onError: onMediaDeviceError,
  });

  const filteredDevices = useMemo(() => devices.filter((d) => d.deviceId !== ''), [devices]);
  const activeDevice = filteredDevices.find((d) => d.deviceId === activeDeviceId);
  const hasMultipleDevices = filteredDevices.length > 1;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleDeviceList = () => {
    if (!isOpen) {
      setRequestPermissions(true);
    }
    setIsOpen(!isOpen);
  };

  const handleDeviceSelect = (deviceId: string) => {
    setActiveMediaDevice(deviceId);
    onActiveDeviceChange?.(deviceId);
    setIsOpen(false);
  };

  const Icon = kind === 'audioinput' ? Mic : Video;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Floating expandable device list - positioned above */}
      <motion.div
        layout
        className="absolute bottom-full right-0 mb-2 w-64 origin-bottom-right"
        initial={false}
        animate={{
          opacity: isOpen ? 1 : 0,
          scale: isOpen ? 1 : 0.95,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        transition={{
          duration: 0.35,
          ease: TRANSITION_EASE,
        }}
      >
        <motion.div
          layout
          className="bg-white dark:bg-[#1a1a1a] border border-[#E0E0E0] dark:border-[#404040] overflow-hidden shadow-lg"
          style={{ borderRadius: 20 }}
          transition={{
            layout: {
              duration: 0.35,
              ease: TRANSITION_EASE,
            },
          }}
        >
          <motion.div
            className="p-2 flex flex-col gap-1"
            initial="closed"
            animate={isOpen ? 'open' : 'closed'}
            variants={{
              open: {
                transition: {
                  staggerChildren: 0.05,
                  delayChildren: 0.1,
                },
              },
              closed: {
                transition: {
                  staggerChildren: 0.03,
                  staggerDirection: -1,
                },
              },
            }}
          >
            {filteredDevices.map((device) => {
              const isActive = device.deviceId === activeDeviceId;
              return (
                <motion.button
                  key={device.deviceId}
                  onClick={() => handleDeviceSelect(device.deviceId)}
                  variants={{
                    open: { opacity: 1, y: 0 },
                    closed: { opacity: 0, y: 8 },
                  }}
                  transition={{
                    duration: 0.25,
                    ease: TRANSITION_EASE,
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors duration-200 w-full text-left cursor-pointer',
                    isActive
                      ? 'bg-[#f1f1f1] dark:bg-[#2a2a2a] text-[#292D32] dark:text-white'
                      : 'text-[#5D6369] dark:text-[#a0a0a0] hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a] hover:text-[#292D32] dark:hover:text-white'
                  )}
                >
                  <span className="text-[13px] font-medium font-inter tracking-tight truncate flex-1">
                    {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-[#27B1FF]" />}
                </motion.button>
              );
            })}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Main control button */}
      <div
        className="flex items-center bg-white dark:bg-[#1a1a1a] border border-[#E0E0E0] dark:border-[#404040] overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        {/* Toggle button */}
        <AgentTrackToggle
          source={source}
          pressed={pressed}
          pending={pending}
          disabled={disabled}
          onPressedChange={onPressedChange}
          className={cn(
            'rounded-full border-0 shadow-none',
            hasMultipleDevices && 'rounded-r-none',
            pressed
              ? 'bg-[#f1f1f1] hover:bg-[#e8e8e8] text-[#292D32] dark:bg-[#2a2a2a] dark:hover:bg-[#333] dark:text-white'
              : 'bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400'
          )}
        />

        {/* Divider */}
        {hasMultipleDevices && (
          <div
            className={cn(
              'w-px h-5',
              pressed
                ? 'bg-[#E0E0E0] dark:bg-[#404040]'
                : 'bg-red-200 dark:bg-red-800/50'
            )}
          />
        )}

        {/* Device select chevron */}
        {hasMultipleDevices && (
          <button
            onClick={handleToggleDeviceList}
            className={cn(
              'flex h-9 w-8 items-center justify-center transition-colors rounded-r-full cursor-pointer',
              pressed
                ? 'bg-[#f1f1f1] hover:bg-[#e8e8e8] dark:bg-[#2a2a2a] dark:hover:bg-[#333]'
                : 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30'
            )}
          >
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{
                duration: 0.35,
                ease: TRANSITION_EASE,
              }}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4',
                  pressed
                    ? 'text-[#5D6369] dark:text-[#a0a0a0]'
                    : 'text-red-500 dark:text-red-400'
                )}
              />
            </motion.div>
          </button>
        )}
      </div>
    </div>
  );
}
