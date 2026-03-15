import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import { AnimatePresence, motion } from 'motion/react';
import {
  VideoTrack,
  useLocalParticipant,
  ParticipantName,
  useVoiceAssistant,
  useTrackTranscription,
} from '@livekit/components-react';
import { Info, X, User, Clock, MessageSquare, HelpCircle, CheckCircle2, XCircle, Eye, Lightbulb } from 'lucide-react';
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
// TIMER HOOK
// =============================================

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return { seconds, formatted: formatTime(seconds), isRunning, setIsRunning };
}

// =============================================
// TRANSCRIPT MESSAGE
// =============================================

interface TranscriptMessage {
  id: string;
  speaker: 'user' | 'agent';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

// =============================================
// INFO SIDEBAR
// =============================================

interface InfoSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function InfoSidebar({ isOpen, onClose }: InfoSidebarProps) {
  const { state: agentState, agentTranscriptions, agentAttributes } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const timer = useTimer();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);

  // Build track reference for user's microphone transcription
  const micTrackRef = microphoneTrack
    ? {
        participant: localParticipant,
        source: Track.Source.Microphone,
        publication: microphoneTrack,
      }
    : undefined;

  // Get user transcriptions from microphone track
  const { segments: userSegments } = useTrackTranscription(micTrackRef);

  // Parse agent attributes
  const interviewStage = agentAttributes?.stage || 'waiting';
  const questionsAsked = parseInt(agentAttributes?.questions_asked || '0', 10);
  const decision = agentAttributes?.decision || '';
  const isConcluding = agentAttributes?.is_concluding === 'true';
  const currentTopic = agentAttributes?.current_topic || '';
  const confidenceLevel = agentAttributes?.confidence_level || 'neutral';
  const videoImpression = agentAttributes?.video_impression || '';

  const STAGE_LABELS: Record<string, string> = {
    'waiting': 'Waiting',
    'gate': 'Camera Check',
    'interview': 'Interview',
    'concluded': 'Concluded',
  };

  const CONFIDENCE_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
    'low': { color: 'text-red-400 bg-red-500/20', label: 'Needs Work', icon: '😟' },
    'neutral': { color: 'text-yellow-400 bg-yellow-500/20', label: 'Okay', icon: '😐' },
    'high': { color: 'text-green-400 bg-green-500/20', label: 'Good', icon: '😊' },
  };

  // Process both agent and user transcriptions
  // Deduplicate by segment ID and keep only the latest version of each
  useEffect(() => {
    const segmentMap = new Map<string, TranscriptMessage>();

    // Add agent transcriptions (use segment id for deduplication)
    agentTranscriptions.forEach((t) => {
      const key = `agent-${t.id}`;
      // Only update if this is newer or doesn't exist
      const existing = segmentMap.get(key);
      if (!existing || t.lastReceivedTime > existing.timestamp) {
        segmentMap.set(key, {
          id: key,
          speaker: 'agent',
          text: t.text,
          timestamp: t.firstReceivedTime,
          isFinal: t.final,
        });
      }
    });

    // Add user transcriptions
    userSegments.forEach((t) => {
      const key = `user-${t.id}`;
      const existing = segmentMap.get(key);
      if (!existing || t.lastReceivedTime > existing.timestamp) {
        segmentMap.set(key, {
          id: key,
          speaker: 'user',
          text: t.text,
          timestamp: t.firstReceivedTime,
          isFinal: t.final,
        });
      }
    });

    // Convert to array and sort by timestamp
    const allMessages = Array.from(segmentMap.values());
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(allMessages);
  }, [agentTranscriptions, userSegments]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const AGENT_STATE_TEXT: Record<string, string> = {
    'connecting': 'Connecting...',
    'initializing': 'Initializing...',
    'listening': 'Listening',
    'thinking': 'Thinking',
    'speaking': 'Speaking',
    'idle': 'Ready',
  };

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
      <div className="w-80 h-full flex flex-col gap-3 p-3">
        {/* Status Container */}
        <motion.div
          className="bg-[#111] rounded-2xl border border-white/10 overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <h2 className="text-base font-semibold text-white">Interview Info</h2>
            <motion.button
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/5"
              whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.15)' }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-4 h-4 text-white/70" />
            </motion.button>
          </div>

          {/* Timer & Agent State */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/50" />
                <span className="text-white/50 text-sm">Elapsed</span>
              </div>
              <span className="text-xl font-mono font-semibold text-white">
                {timer.formatted}
              </span>
            </div>

            {/* Agent State */}
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-sm">Status</span>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  agentState === 'speaking' && "bg-green-500 animate-pulse",
                  agentState === 'listening' && "bg-blue-500 animate-pulse",
                  agentState === 'thinking' && "bg-yellow-500 animate-pulse",
                  (!agentState || agentState === 'idle') && "bg-white/30"
                )} />
                <span className="text-sm text-white/70">
                  {AGENT_STATE_TEXT[agentState || 'idle'] || 'Ready'}
                </span>
              </div>
            </div>

            {/* Stage */}
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-sm">Stage</span>
              <span className={cn(
                "text-sm font-medium px-2 py-0.5 rounded",
                interviewStage === 'interview' && "bg-accentblue/20 text-accentblue",
                interviewStage === 'gate' && "bg-yellow-500/20 text-yellow-400",
                interviewStage === 'concluded' && "bg-green-500/20 text-green-400",
                interviewStage === 'waiting' && "bg-white/10 text-white/50"
              )}>
                {STAGE_LABELS[interviewStage] || interviewStage}
              </span>
            </div>

            {/* Questions Asked */}
            {interviewStage === 'interview' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-white/50" />
                  <span className="text-white/50 text-sm">Questions</span>
                </div>
                <span className="text-lg font-mono font-semibold text-white">
                  {questionsAsked}
                </span>
              </div>
            )}

            {/* Decision (if concluded) */}
            {(decision || isConcluding) && (
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">Decision</span>
                <div className={cn(
                  "flex items-center gap-1.5 text-sm font-medium px-2 py-0.5 rounded",
                  decision === 'approved' && "bg-green-500/20 text-green-400",
                  decision === 'denied' && "bg-red-500/20 text-red-400",
                  !decision && "bg-white/10 text-white/50"
                )}>
                  {decision === 'approved' && <CheckCircle2 className="w-4 h-4" />}
                  {decision === 'denied' && <XCircle className="w-4 h-4" />}
                  <span>{decision ? decision.toUpperCase() : 'Pending...'}</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Video Impressions Container - Only show during interview */}
        {interviewStage === 'interview' && (videoImpression || currentTopic) && (
          <motion.div
            className="bg-[#111] rounded-2xl border border-white/10 overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.3 }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <Eye className="w-4 h-4 text-white/50" />
              <span className="text-sm font-medium text-white/70">Live Feedback</span>
            </div>

            <div className="p-4 space-y-3">
              {/* Confidence Level */}
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">Confidence</span>
                <span className={cn(
                  "text-sm font-medium px-2 py-0.5 rounded flex items-center gap-1.5",
                  CONFIDENCE_CONFIG[confidenceLevel]?.color || CONFIDENCE_CONFIG.neutral.color
                )}>
                  <span>{CONFIDENCE_CONFIG[confidenceLevel]?.icon || '😐'}</span>
                  <span>{CONFIDENCE_CONFIG[confidenceLevel]?.label || 'Okay'}</span>
                </span>
              </div>

              {/* Current Topic */}
              {currentTopic && (
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">Topic</span>
                  <span className="text-sm text-white/80 font-medium">
                    {currentTopic}
                  </span>
                </div>
              )}

              {/* Video Impression */}
              {videoImpression && (
                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-white/70 leading-relaxed">
                      {videoImpression}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Transcript Container */}
        <motion.div
          className="flex-1 flex flex-col min-h-0 bg-[#111] rounded-2xl border border-white/10 overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <MessageSquare className="w-4 h-4 text-white/50" />
            <span className="text-sm font-medium text-white/70">Transcript</span>
          </div>

          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10"
          >
            {messages.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">
                Conversation will appear here...
              </p>
            ) : (
              messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: msg.isFinal ? 1 : 0.6, y: 0 }}
                  className={cn(
                    "text-sm",
                    msg.speaker === 'agent' ? "text-white/90" : "text-blue-400"
                  )}
                >
                  <span className="font-medium">
                    {msg.speaker === 'agent' ? 'Officer: ' : 'You: '}
                  </span>
                  <span className={cn(!msg.isFinal && "italic")}>
                    {msg.text}
                  </span>
                </motion.div>
              ))
            )}
          </div>
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
