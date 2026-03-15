import React, { useMemo } from 'react';
import { Track } from 'livekit-client';
import { AnimatePresence, motion } from 'motion/react';
import {
  VideoTrack,
  useLocalParticipant,
  ParticipantName,
} from '@livekit/components-react';
import { User } from 'lucide-react';
import { LiveWaveform } from '@/components/ui/live-waveform';
import { cn } from '@/lib/utils';

const MotionContainer = motion.create('div');

// =============================================
// USER AVATAR PLACEHOLDER
// =============================================

interface UserAvatarProps {
  name?: string;
  className?: string;
}

function UserAvatar({ name = 'User', className }: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-accentblue/20 to-accentblue/5 blur-xl" />
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] ring-1 ring-white/10">
          {initials ? (
            <span className="text-4xl font-semibold text-white/90">{initials}</span>
          ) : (
            <User className="h-16 w-16 text-white/60" />
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-white/90">{name}</p>
        <p className="text-sm text-white/50">Camera off</p>
      </div>
    </div>
  );
}

// =============================================
// TILE LAYOUT
// =============================================

export function TileLayout() {
  const { localParticipant, isCameraEnabled, cameraTrack, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();
  const participantName = localParticipant?.name || localParticipant?.identity || 'User';

  // Create MediaStream from LiveKit's microphone track
  // Use microphoneTrack as dependency to properly detect device changes
  const microphoneStream = useMemo(() => {
    const mediaStreamTrack = microphoneTrack?.track?.mediaStreamTrack;
    if (mediaStreamTrack) {
      return new MediaStream([mediaStreamTrack]);
    }
    return null;
  }, [microphoneTrack]);

  // Build track reference for VideoTrack component
  const cameraTrackRef = cameraTrack
    ? {
        participant: localParticipant,
        source: Track.Source.Camera,
        publication: cameraTrack,
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-0">
      {/* Full screen user video tile */}
      <div className="absolute inset-0 bg-[#0a0a0a]">
        <AnimatePresence mode="wait">
          {isCameraEnabled && cameraTrackRef ? (
            <MotionContainer
              key="user-video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full w-full"
            >
              <VideoTrack
                trackRef={cameraTrackRef}
                className="h-full w-full object-cover"
              />
            </MotionContainer>
          ) : (
            <MotionContainer
              key="user-avatar"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex h-full w-full items-center justify-center"
            >
              <UserAvatar name={participantName} />
            </MotionContainer>
          )}
        </AnimatePresence>
      </div>

      {/* You badge - top left */}
      <div className="absolute top-4 left-4 z-10 md:top-8 md:left-8">
        <div className="flex items-center justify-between gap-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-1.5">
          <ParticipantName participant={localParticipant} className="font-inter text-sm font-medium text-white" />
          <LiveWaveform
            key={microphoneTrack?.track?.sid || 'no-mic'}
            active={isMicrophoneEnabled}
            stream={microphoneStream}
            mode="static"
            height={24}
            barWidth={2}
            barGap={1}
            barRadius={2}
            barColor="#ffffff"
            fadeEdges={false}
            sensitivity={1.5}
            historySize={200}
            className="w-16"
          />
        </div>
      </div>
    </div>
  );
}
