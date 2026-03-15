'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useSessionContext, useLocalParticipant } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { TileLayout } from '@/components/interview/tile-layout';

const MotionBottom = motion.create('div');

const BOTTOM_VIEW_MOTION_PROPS = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut' as const,
  },
};

interface SessionViewProps {
  appConfig: AppConfig;
}

export const SessionView = ({
  appConfig,
  ...props
}: React.ComponentProps<'section'> & SessionViewProps) => {
  const session = useSessionContext();
  const { localParticipant } = useLocalParticipant();
  const hasEnabledDevicesRef = useRef(false);

  // Auto-enable camera and microphone when connected
  useEffect(() => {
    if (session.isConnected && localParticipant && !hasEnabledDevicesRef.current) {
      hasEnabledDevicesRef.current = true;

      // Enable microphone
      localParticipant.setMicrophoneEnabled(true).catch((err) => {
        console.error('Failed to enable microphone:', err);
      });

      // Enable camera if supported
      if (appConfig.supportsVideoInput) {
        localParticipant.setCameraEnabled(true).catch((err) => {
          console.error('Failed to enable camera:', err);
        });
      }
    }
  }, [session.isConnected, localParticipant, appConfig.supportsVideoInput]);

  const controls: AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: false,
    camera: appConfig.supportsVideoInput,
    screenShare: appConfig.supportsScreenShare,
  };

  return (
    <section className="relative z-10 h-svh w-svw overflow-hidden" {...props}>
      {/* Tile layout */}
      <TileLayout />
      {/* Start Audio Button - only shows if audio is blocked */}
      <StartAudioButton label="Enable Audio" />
      {/* Bottom */}
      <MotionBottom
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="fixed inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {/* Control Bar */}
        <div className="relative mx-auto max-w-2xl pb-3 md:pb-12">
          <AgentControlBar
            variant="livekit"
            controls={controls}
            isConnected={session.isConnected}
            onDisconnect={session.end}
          />
        </div>
      </MotionBottom>
    </section>
  );
};
