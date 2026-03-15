# Architecture Diagram

## How to Generate PNG

The diagrams below use Mermaid syntax. To generate PNG images:

1. **GitHub** - Just view this file on GitHub, diagrams render automatically
2. **Mermaid Live Editor** - Paste code at https://mermaid.live
3. **VS Code** - Install "Markdown Preview Mermaid Support" extension

---

## System Architecture

```mermaid
flowchart TB
    subgraph User["👤 USER"]
        CAM["🎥 Camera"]
        MIC["🎤 Microphone"]
        SPEAK["🔊 Speaker"]
    end

    subgraph Frontend["🖥️ FRONTEND<br/>(Next.js + React)"]
        UI["Interview UI"]
        TOKEN["Token API<br/>/api/token"]
        SIDEBAR["Sidebar<br/>Timer • Transcript • Confidence"]
    end

    subgraph LK["📡 LIVEKIT SERVER<br/>(WebRTC Infrastructure)"]
        ROOM["Room Manager"]
        MEDIA["Media Router<br/>Audio/Video Streams"]
    end

    subgraph Agent["🤖 VISA INTERVIEW AGENT<br/>(Python + LiveKit Agents SDK)"]
        SESSION["AgentSession<br/>with typed userdata"]

        subgraph Handoffs["Agent Handoffs"]
            GATE["CameraGateAgent<br/>• Requires video<br/>• Waits for camera"]
            INT["VisaInterviewerAgent<br/>• Conducts interview<br/>• Uses tools"]
        end

        ANALYZER["VideoAnalyzer<br/>• Captures frames<br/>• Background analysis"]

        STATE["InterviewSessionData<br/>• stage, decision<br/>• confidence_level<br/>• questions_asked"]

        subgraph Tools["🔧 Agent Tools"]
            T1["flag_concern()"]
            T2["update_assessment()"]
            T3["conclude_interview()"]
        end
    end

    subgraph GCP["☁️ GOOGLE CLOUD"]
        subgraph Gemini["🧠 GEMINI API"]
            LIVE["Gemini 2.5 Flash<br/>Native Audio Preview<br/>• Real-time voice<br/>• Vision understanding<br/>• Interruption handling"]
            VISION["Gemini 2.0 Flash<br/>• Frame analysis<br/>• Body language<br/>• Confidence detection"]
        end
    end

    %% User connections
    CAM --> UI
    MIC --> UI
    UI --> SPEAK

    %% Frontend to LiveKit
    UI <--> |"WebRTC"| ROOM
    TOKEN --> |"JWT Token"| ROOM

    %% LiveKit internal
    ROOM <--> MEDIA

    %% LiveKit to Agent
    MEDIA <--> |"Agent Protocol"| SESSION

    %% Agent internal flow
    SESSION --> GATE
    GATE --> |"Video Enabled"| INT
    INT --> Tools
    INT --> STATE
    ANALYZER --> STATE

    %% Agent to Gemini
    SESSION <--> |"Gemini Live API<br/>(WebSocket)"| LIVE
    ANALYZER --> |"REST API<br/>Image Analysis"| VISION

    %% State to Frontend
    STATE -.-> |"Participant Attributes"| SIDEBAR

    %% Styling
    style GCP fill:#4285f4,color:#fff
    style Gemini fill:#34a853,color:#fff
    style Agent fill:#fbbc04,color:#000
    style LK fill:#ff5722,color:#fff
    style Frontend fill:#9c27b0,color:#fff
    style User fill:#607d8b,color:#fff
```

---

## Data Flow Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 User
    participant F as 🖥️ Frontend
    participant L as 📡 LiveKit
    participant A as 🤖 Agent
    participant G as 🧠 Gemini Live
    participant V as 👁️ Gemini Vision

    rect rgb(240, 240, 255)
        Note over U,F: Setup Phase
        U->>F: Enter name, select visa type
        F->>F: Generate JWT token
        F->>L: Connect to room
        L->>A: Spawn visa-interviewer agent
        A->>G: Connect to Gemini Live API
    end

    rect rgb(255, 240, 240)
        Note over U,A: Camera Gate Phase
        A->>U: "Please enable your camera"
        U->>F: Enable camera
        F->>L: Publish video track
        L->>A: track_subscribed event
        A->>A: Handoff: Gate → Interviewer
    end

    rect rgb(240, 255, 240)
        Note over U,V: Interview Phase
        A->>G: Begin interview prompt
        G->>U: "State your full name..."

        loop Every Question (up to 8 min)
            U->>G: Voice response
            G->>A: Process response
            A->>A: Update state
            A->>G: Generate follow-up
            G->>U: Next question (TTS)
        end

        par Background Analysis
            loop Every 30 seconds
                A->>V: Send video frame
                V->>A: {confidence, impression}
                A->>F: Update sidebar attributes
            end
        end
    end

    rect rgb(255, 255, 240)
        Note over A,U: Conclusion Phase
        A->>A: Call conclude_interview()
        A->>G: Announce decision
        G->>U: "Your visa is APPROVED/DENIED"
        A->>L: Disconnect room
    end
```

---

## Simplified Overview (for slides)

```mermaid
flowchart LR
    subgraph Input
        A[🎥 Camera]
        B[🎤 Voice]
    end

    subgraph Processing
        C[LiveKit<br/>WebRTC]
        D[Python Agent<br/>LiveKit SDK]
        E[Gemini Live API<br/>Real-time AI]
    end

    subgraph Output
        F[🔊 Voice Response]
        G[📊 Live Feedback]
    end

    A --> C
    B --> C
    C <--> D
    D <--> E
    E --> F
    D --> G

    style E fill:#34a853,color:#fff
    style D fill:#fbbc04,color:#000
    style C fill:#ff5722,color:#fff
```

---

## Technologies Used

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS | User interface |
| **Real-time** | LiveKit, WebRTC | Audio/video streaming |
| **Agent** | Python 3.11, LiveKit Agents SDK | Agent runtime |
| **AI** | Gemini 2.5 Flash (Live), Gemini 2.0 Flash | Conversation + Vision |
| **Cloud** | Google Cloud Run (planned) | Production hosting |
