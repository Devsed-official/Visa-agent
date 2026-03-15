import React, { useMemo, useState } from 'react';
import { Track } from 'livekit-client';
import { AnimatePresence, motion } from 'motion/react';
import {
  VideoTrack,
  useLocalParticipant,
  ParticipantName,
} from '@livekit/components-react';
import { Info, X, User } from 'lucide-react';
import { LiveWaveform } from '@/components/ui/live-waveform';
import { cn } from '@/lib/utils';

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
// INFO SIDEBAR
// =============================================

interface InfoSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function InfoSidebar({ isOpen, onClose }: InfoSidebarProps) {
  return (
    <motion.div
      initial={{ width: 0, marginLeft: 0 }}
      animate={{
        width: isOpen ? 320 : 0,
        marginLeft: isOpen ? 12 : 0
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="h-full overflow-hidden"
    >
      <div className="w-80 h-full flex flex-col bg-[#111] rounded-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <motion.h2
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="text-lg font-semibold text-white"
          >
            Interview Info
          </motion.h2>
          <motion.button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5"
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <X className="w-5 h-5 text-white/70" />
          </motion.button>
        </div>

        {/* Content - empty for now */}
        <motion.div
          className="flex-1 p-4 overflow-y-auto"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <p className="text-white/50 text-sm">Features coming soon...</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// =============================================
// TILE LAYOUT
// =============================================

export function TileLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
    <motion.div
      className="fixed inset-0 z-0 flex bg-black"
      animate={{
        padding: isSidebarOpen ? 12 : 0,
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {/* Main video area - takes remaining space */}
      <motion.div
        className="relative flex-1 h-full overflow-hidden"
        animate={{
          borderRadius: isSidebarOpen ? 16 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Full screen user video tile */}
        <div className="absolute inset-0 bg-[#0a0a0a]">
          <AnimatePresence mode="wait">
            {isCameraEnabled && cameraTrackRef ? (
              <motion.div
                key="user-video"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="h-full w-full"
              >
                <VideoTrack
                  trackRef={cameraTrackRef}
                  className="h-full w-full object-cover"
                />
              </motion.div>
            ) : (
              <motion.div
                key="user-avatar"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="flex h-full w-full items-center justify-center"
              >
                <UserAvatar name={participantName} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* You badge - top left */}
        <motion.div
          className="absolute top-4 left-4 z-10 md:top-8 md:left-8"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
        >
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
        </motion.div>

        {/* Info button - top right of video area */}
        <motion.div
          className="absolute top-4 right-4 z-10 md:top-8 md:right-8"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <motion.button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border border-white/10 bg-white/10"
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.2)' }}
            whileTap={{ scale: 0.95 }}
            animate={{
              backgroundColor: isSidebarOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
              rotate: isSidebarOpen ? 180 : 0
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <Info className="w-5 h-5 text-white" />
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Info Sidebar - pushes content */}
      <InfoSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </motion.div>
  );
}
