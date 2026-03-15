'use client'

import { useMemo, useCallback, useEffect, useRef } from 'react'
import { TokenSource, ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client'
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

interface InterviewProviderProps {
  connectionDetails: LiveKitConnectionDetails
  roomName: string
  children: React.ReactNode
  onConnectionStateChange?: (state: InterviewConnectionState) => void
  onDisconnected?: () => void
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

  // Track connection state changes and participant disconnects
  useEffect(() => {
    if (!session.room) return

    const handleStateChange = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        hasConnectedRef.current = true
      }

      onConnectionStateChange?.(mapState(state))

      // Only trigger disconnect callback if we were previously connected
      if (state === ConnectionState.Disconnected && hasConnectedRef.current) {
        onDisconnected?.()
      }
    }

    // Handle when the agent (interviewer) disconnects from the room
    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      // Check if this is the agent participant (not another user)
      // Agent identity typically starts with 'agent' or we can check if it's the only remote participant
      console.log('[InterviewProvider] Participant disconnected:', participant.identity)

      // If we were connected and the agent left, trigger disconnect
      if (hasConnectedRef.current) {
        // Check if there are no more remote participants (agent left)
        const remainingParticipants = session.room.remoteParticipants.size
        console.log('[InterviewProvider] Remaining participants:', remainingParticipants)

        if (remainingParticipants === 0) {
          console.log('[InterviewProvider] Agent disconnected - ending session')
          onDisconnected?.()
        }
      }
    }

    session.room.on('connectionStateChanged', handleStateChange)
    session.room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)

    // Report initial state
    onConnectionStateChange?.(mapState(session.room.state))

    return () => {
      session.room.off('connectionStateChanged', handleStateChange)
      session.room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    }
  }, [session.room, onConnectionStateChange, onDisconnected, mapState])

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
