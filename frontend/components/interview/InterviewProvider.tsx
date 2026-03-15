'use client'

import { useMemo, useCallback, useEffect, useRef } from 'react'
import { TokenSource, ConnectionState, RoomEvent, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client'
import {
  useSession,
  SessionProvider,
  RoomAudioRenderer,
} from '@livekit/components-react'

// =============================================
// TYPES
// =============================================

export interface LiveKitConnectionDetails {
  url: string
  token: string
}

export type InterviewConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export interface InterviewSessionResult {
  decision: 'approved' | 'denied' | null
  questionsAsked: number
  confidenceLevel: 'low' | 'neutral' | 'high'
  durationSeconds: number
}

interface InterviewProviderProps {
  connectionDetails: LiveKitConnectionDetails
  roomName: string
  children: React.ReactNode
  onConnectionStateChange?: (state: InterviewConnectionState) => void
  onDisconnected?: (result: InterviewSessionResult) => void
}

// =============================================
// PROVIDER
// =============================================

export function InterviewProvider({
  connectionDetails,
  roomName,
  children,
  onConnectionStateChange,
  onDisconnected,
}: InterviewProviderProps) {
  const hasConnectedRef = useRef(false)
  const sessionStartTimeRef = useRef<number | null>(null)
  const lastAgentAttributesRef = useRef<Record<string, string>>({})

  // Create token source from our connection details using custom method
  const tokenSource = useMemo(() => {
    return TokenSource.custom(async () => ({
      serverUrl: connectionDetails.url,
      participantToken: connectionDetails.token,
      roomName: roomName,
      participantName: 'user',
    }))
  }, [connectionDetails.url, connectionDetails.token, roomName])

  // Use the session hook from livekit
  const session = useSession(tokenSource)

  // Map session state to our state
  const mapState = useCallback((state: ConnectionState): InterviewConnectionState => {
    switch (state) {
      case ConnectionState.Disconnected:
        return 'disconnected'
      case ConnectionState.Connecting:
        return 'connecting'
      case ConnectionState.Connected:
        return 'connected'
      case ConnectionState.Reconnecting:
        return 'reconnecting'
      default:
        return 'failed'
    }
  }, [])

  // Build session result from captured attributes
  const buildSessionResult = useCallback((): InterviewSessionResult => {
    const attrs = lastAgentAttributesRef.current
    const durationSeconds = sessionStartTimeRef.current
      ? Math.floor((Date.now() - sessionStartTimeRef.current) / 1000)
      : 0

    return {
      decision: (attrs.decision as 'approved' | 'denied') || null,
      questionsAsked: parseInt(attrs.questions_asked || '0', 10),
      confidenceLevel: (attrs.confidence_level as 'low' | 'neutral' | 'high') || 'neutral',
      durationSeconds,
    }
  }, [])

  // Track connection state changes and participant disconnects
  useEffect(() => {
    if (!session.room) return

    const handleStateChange = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        hasConnectedRef.current = true
        sessionStartTimeRef.current = Date.now()
      }

      onConnectionStateChange?.(mapState(state))

      // Only trigger disconnect callback if we were previously connected
      if (state === ConnectionState.Disconnected && hasConnectedRef.current) {
        onDisconnected?.(buildSessionResult())
      }
    }

    // Track agent attribute changes
    const handleAttributesChanged = (changedAttributes: Record<string, string>, participant: RemoteParticipant | LocalParticipant) => {
      // Only track remote participant (agent) attributes, not local
      if (participant !== session.room.localParticipant) {
        lastAgentAttributesRef.current = { ...lastAgentAttributesRef.current, ...changedAttributes }
        console.log('[InterviewProvider] Agent attributes updated:', lastAgentAttributesRef.current)
      }
    }

    // Handle when the agent (interviewer) disconnects from the room
    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      console.log('[InterviewProvider] Participant disconnected:', participant.identity)

      // Capture final attributes from the departing participant
      if (participant.attributes) {
        lastAgentAttributesRef.current = { ...lastAgentAttributesRef.current, ...participant.attributes }
      }

      // If we were connected and the agent left, trigger disconnect
      if (hasConnectedRef.current) {
        const remainingParticipants = session.room.remoteParticipants.size
        console.log('[InterviewProvider] Remaining participants:', remainingParticipants)

        if (remainingParticipants === 0) {
          console.log('[InterviewProvider] Agent disconnected - ending session')
          onDisconnected?.(buildSessionResult())
        }
      }
    }

    session.room.on('connectionStateChanged', handleStateChange)
    session.room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    session.room.on(RoomEvent.ParticipantAttributesChanged, handleAttributesChanged)

    // Report initial state
    onConnectionStateChange?.(mapState(session.room.state))

    return () => {
      session.room.off('connectionStateChanged', handleStateChange)
      session.room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
      session.room.off(RoomEvent.ParticipantAttributesChanged, handleAttributesChanged)
    }
  }, [session.room, onConnectionStateChange, onDisconnected, mapState, buildSessionResult])

  // Auto-connect when session is ready
  useEffect(() => {
    if (session.connectionState === ConnectionState.Disconnected) {
      session.start()
    }
  }, [session])

  return (
    <SessionProvider session={session}>
      {children}
      <RoomAudioRenderer />
    </SessionProvider>
  )
}

export default InterviewProvider
