import { AccessToken, RoomConfiguration } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const AGENT_NAME = 'visa-interviewer';

export async function POST(req: NextRequest) {
  try {
    const { userName, visaType, countryName } = await req.json();

    if (!userName) {
      return NextResponse.json({ error: 'userName is required' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    // Generate a unique room name
    const roomName = `interview-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userName.replace(/\s+/g, '-').toLowerCase(),
      name: userName,
      metadata: JSON.stringify({
        visaTypeName: visaType || 'F1 Student Visa',
        countryName: countryName || 'US',
        languageName: 'English',
      }),
    });

    // Grant permissions
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // Configure agent dispatch - THIS TELLS LIVEKIT TO SPAWN THE AGENT
    at.roomConfig = new RoomConfiguration({
      agents: [{ agentName: AGENT_NAME }],
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekitUrl,
      roomName,
    });
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
