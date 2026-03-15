import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    JobContext,
    RunContext,
    UserStateChangedEvent,
    cli,
    function_tool,
    get_job_context,
    room_io,
    voice,
)
from livekit.plugins import google, silero

load_dotenv(dotenv_path=".env.local")

logger = logging.getLogger("visa-interview-agent")
logger.setLevel(logging.INFO)

# Timeout settings
GATE_FIRST_REMINDER_SECONDS = 30
GATE_SECOND_REMINDER_SECONDS = 30

# Interview settings
INTERVIEW_MAX_DURATION_SECONDS = 8 * 60  # 8 minutes
USER_INACTIVITY_INTERVAL_SECONDS = 30  # Consistent 30-second intervals for warnings


@dataclass
class InterviewSessionData:
    """Typed session state for the visa interview."""

    # Video state
    has_video: bool = False
    current_agent_type: Literal["gate", "interviewer"] = "gate"
    saved_context: Any = None  # Preserved chat context when switching
    warning_task: asyncio.Task | None = None
    gate_reminder_task: asyncio.Task | None = None

    # Session config (from participant metadata)
    room_name: str | None = None
    country_name: str | None = None
    visa_type_name: str | None = None
    language_name: str | None = None
    start_time: float | None = None
    interview_started: bool = False

    # Interview progress
    questions_asked: int = 0
    user_last_spoke_at: float | None = None
    inactivity_warning_count: int = 0
    inactivity_task: asyncio.Task | None = None
    interview_timer_task: asyncio.Task | None = None
    is_concluding: bool = False
    decision: Literal["approved", "denied"] | None = None
    stage: Literal["waiting", "gate", "interview", "concluded"] = "waiting"

    # Video analysis results
    current_topic: str = ""
    confidence_level: Literal["low", "neutral", "high"] = "neutral"
    video_impression: str = ""
    tips: list[str] = field(default_factory=list)

    def cancel_all_tasks(self) -> None:
        """Cancel all running async tasks."""
        tasks = [
            self.inactivity_task,
            self.interview_timer_task,
            self.warning_task,
            self.gate_reminder_task,
        ]
        for task in tasks:
            if task and not task.done():
                task.cancel()
        self.inactivity_task = None
        self.interview_timer_task = None
        self.warning_task = None
        self.gate_reminder_task = None


def get_participant_metadata(participant: rtc.RemoteParticipant) -> dict[str, Any] | None:
    """Extract metadata from participant's token."""
    if not participant.metadata:
        return None
    try:
        return json.loads(participant.metadata)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse participant metadata: {participant.metadata}")
        return None


async def publish_interview_attributes(room: rtc.Room, data: InterviewSessionData):
    """Publish interview state as participant attributes for frontend consumption."""
    try:
        attributes = {
            "stage": data.stage,
            "questions_asked": str(data.questions_asked),
            "decision": data.decision or "",
            "is_concluding": str(data.is_concluding).lower(),
            "current_topic": data.current_topic,
            "confidence_level": data.confidence_level,
            "video_impression": data.video_impression,
        }
        await room.local_participant.set_attributes(attributes)
    except Exception as e:
        logger.error(f"Failed to publish attributes: {e}")


def build_interview_instructions(
    country_name: str | None,
    visa_type_name: str | None,
    language_name: str | None
) -> str:
    """Build dynamic interview instructions based on session metadata."""
    country = country_name or "US"
    visa_type = visa_type_name or "visitor"
    language = language_name or "English"

    instructions = f"""You are Officer Martinez, an official {country} visa interview officer at the embassy conducting a {visa_type} visa interview. You have full authority to approve or deny visa applications.

# Output Rules

You are conducting a voice interview. Follow these rules for natural speech:
- Respond in plain text only. Never use markdown, lists, or special formatting.
- Keep responses brief: one to two sentences per turn. Ask one question at a time.
- Speak naturally and conversationally, as a real embassy officer would.
- Do not use emojis, symbols, or complex punctuation.
- Spell out numbers when speaking amounts (e.g., "five thousand dollars").

# Language

Conduct this interview in {language}. Assume the applicant is speaking {language} unless they are clearly using a completely different language.

# Goals

Your goal is to determine if this applicant qualifies for a {visa_type} visa by assessing:
1. Identity verification - Confirm their name and basic details
2. Purpose of visit - Why they are traveling to {country}
3. Ties to home country - Job, family, property that ensures their return
4. Financial capability - Who funds the trip and proof of sufficient funds
5. Travel history - Prior international travel and any visa rejections
6. Visa-specific requirements for {visa_type} category

After gathering sufficient information, make a decisive APPROVED or DENIED decision.

# Interview Approach

- Ask ONE clear question at a time and wait for complete answers
- Use follow-up questions when answers are vague, inconsistent, or rehearsed
- Observe body language through video: eye contact, nervousness, confidence
- Comment on observations when relevant (e.g., "You seem hesitant about this...")
- Be professional but appropriately skeptical
- Probe deeper if something does not add up
- Vary your tone based on applicant responses

# Suspicious Indicators

Watch for these red flags:
- Rehearsed or memorized-sounding answers
- Looking away or reading from something off-screen
- Inconsistencies between answers
- Vague details about employment, finances, or home ties
- Excessive nervousness beyond normal interview anxiety
- Unable to provide specific details when asked

# Decision Criteria

APPROVE if: Answers are consistent, genuine, with strong home ties and clear purpose.
DENY if: Vague answers, weak home ties, inconsistencies, suspicious behavior, or cannot explain finances.

Announce decisions clearly:
- "Your visa has been APPROVED. You may collect your passport with the visa stamp."
- "Your visa application is DENIED because [specific reason]."

# Tools

You have access to these tools to help conduct the interview:
- flag_concern: Use when you observe suspicious behavior, inconsistencies, or red flags. Specify type, description, and severity.
- update_assessment: Use periodically to track your current confidence level and the topic being discussed.
- conclude_interview: Use at the end to announce your final APPROVED or DENIED decision with a reason.

# Guardrails

- This is a real interview. Never say "mock", "practice", "simulation", or "training".
- Stay professional and focused on visa assessment only.
- Do not provide immigration advice or help applicants craft better answers.
- Make clear, decisive judgments. No administrative processing or deferrals."""

    return instructions


def build_gate_instructions(language_name: str | None) -> str:
    """Build camera gate instructions with language enforcement."""
    language = language_name or "English"

    return f"""You are Officer Martinez, a visa interview officer at the embassy. The applicant must enable their camera before the interview can begin.

# Output Rules

You are speaking via voice. Follow these rules:
- Respond in plain text only. No markdown, lists, or formatting.
- Keep responses brief: one to two sentences.
- Speak naturally and professionally.
- No emojis or special symbols.

# Language

Communicate in {language}.

# Goal

Get the applicant to enable their camera. This is mandatory for all visa interviews.

# Approach

- Greet them professionally as an embassy officer
- Explain that camera is required for the visa interview to proceed
- If they say they enabled it, acknowledge and explain you are waiting for the system to detect their video
- Be polite but firm about the camera requirement
- If they have technical issues, offer to wait briefly

# Guardrails

- Do NOT ask any interview questions yet
- Do NOT discuss visa details or requirements
- Focus only on getting the camera enabled
- Stay professional and patient"""


async def end_interview_session(room: rtc.Room, data: InterviewSessionData, reason: str = "completed"):
    """End the interview session and disconnect."""
    logger.info(f"Ending interview session: {reason}, decision: {data.decision}")
    data.is_concluding = True

    # Cancel any pending tasks
    data.cancel_all_tasks()

    # Wait for final speech to complete before disconnecting
    await asyncio.sleep(10)

    # Disconnect from room
    logger.info("Disconnecting from room")
    await room.disconnect()


class CameraGateAgent(Agent):
    """Agent that handles camera verification with voice interaction."""

    def __init__(self, language_name: str | None = None) -> None:
        super().__init__(
            instructions=build_gate_instructions(language_name),
        )
        self._language_name = language_name

    @property
    def data(self) -> InterviewSessionData:
        """Access typed session userdata."""
        return self.session.userdata

    async def on_enter(self) -> None:
        """Called when the agent starts - ask user to enable camera."""
        logger.info("CameraGateAgent entered - asking for camera")
        self.data.stage = "gate"
        ctx = get_job_context()
        if ctx:
            asyncio.create_task(publish_interview_attributes(ctx.room, self.data))
        await self.session.generate_reply(
            instructions="Greet the applicant professionally as an embassy visa officer. Explain that enabling their camera is mandatory for the visa interview to proceed. Ask them to please enable their camera to begin."
        )


class VisaInterviewerAgent(Agent):
    """Agent that conducts the actual visa interview."""

    def __init__(
        self,
        country_name: str | None = None,
        visa_type_name: str | None = None,
        language_name: str | None = None,
        chat_ctx: ChatContext | None = None,
        is_resuming: bool = False
    ) -> None:
        super().__init__(
            instructions=build_interview_instructions(country_name, visa_type_name, language_name),
            chat_ctx=chat_ctx,
        )
        self._country_name = country_name
        self._visa_type_name = visa_type_name
        self._language_name = language_name
        self._is_resuming = is_resuming

    @property
    def data(self) -> InterviewSessionData:
        """Access typed session userdata."""
        return self.session.userdata

    async def on_enter(self) -> None:
        """Called when the agent starts - begin or resume interview."""
        logger.info(f"VisaInterviewerAgent entered - resuming: {self._is_resuming}")

        # Set stage and reset user activity tracking
        self.data.stage = "interview"
        self.data.user_last_spoke_at = time.time()
        self.data.inactivity_warning_count = 0

        # Publish attributes
        ctx = get_job_context()
        if ctx:
            asyncio.create_task(publish_interview_attributes(ctx.room, self.data))

        if self._is_resuming:
            await self.session.generate_reply(
                instructions="The applicant has re-enabled their camera. Acknowledge you can see them again and continue the interview from where you left off. Do not restart the interview."
            )
        else:
            visa_type = self._visa_type_name or "visitor"
            await self.session.generate_reply(
                instructions=f"You are now beginning the visa interview. Greet the applicant professionally. Note that you can see them through the video. Ask them to state their full name as it appears on their passport, and then ask what is the purpose of their {visa_type} visa application. Be direct and professional like a real embassy interview."
            )
            self.data.questions_asked = 1

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        """Called when user finishes speaking - track activity, inject video context."""
        # Update last spoke time
        self.data.user_last_spoke_at = time.time()
        self.data.inactivity_warning_count = 0

        # Increment question count
        self.data.questions_asked += 1

        # Inject video analysis context if available
        if self.data.video_impression:
            turn_ctx.add_message(
                role="system",
                content=f"[Video observation: {self.data.video_impression}. Confidence level: {self.data.confidence_level}]"
            )

        # Publish updated attributes
        ctx = get_job_context()
        if ctx:
            asyncio.create_task(publish_interview_attributes(ctx.room, self.data))

        logger.info(f"User responded. Questions asked: {self.data.questions_asked}")

    @function_tool
    async def flag_concern(
        self,
        context: RunContext[InterviewSessionData],
        concern_type: str,
        description: str,
        severity: str
    ) -> str:
        """Flag a concern or suspicious behavior observed during the interview.

        Args:
            concern_type: Type of concern (e.g., 'inconsistency', 'evasive', 'rehearsed', 'nervous', 'documentation')
            description: Brief description of what was observed
            severity: Severity level - 'low', 'medium', or 'high'
        """
        if severity not in ["low", "medium", "high"]:
            severity = "medium"

        logger.info(f"Concern flagged: [{severity}] {concern_type} - {description}")

        # Store concern in tips for frontend display
        concern_note = f"[{severity.upper()}] {concern_type}: {description}"
        if concern_note not in self.data.tips:
            self.data.tips.append(concern_note)
            self.data.tips = self.data.tips[-5:]  # Keep last 5

        # Publish updated attributes
        ctx_job = get_job_context()
        if ctx_job:
            asyncio.create_task(publish_interview_attributes(ctx_job.room, self.data))

        return f"Concern noted. Consider asking follow-up questions about this."

    @function_tool
    async def update_assessment(
        self,
        context: RunContext[InterviewSessionData],
        confidence: str,
        topic: str
    ) -> str:
        """Update the current assessment of the applicant.

        Args:
            confidence: Current confidence level in applicant - 'low', 'neutral', or 'high'
            topic: Current topic being discussed (2-4 words)
        """
        if confidence in ["low", "neutral", "high"]:
            self.data.confidence_level = confidence
        self.data.current_topic = topic

        # Publish updated attributes
        ctx_job = get_job_context()
        if ctx_job:
            asyncio.create_task(publish_interview_attributes(ctx_job.room, self.data))

        return f"Assessment updated: {confidence} confidence, discussing {topic}"

    @function_tool
    async def conclude_interview(
        self,
        context: RunContext[InterviewSessionData],
        decision: str,
        reason: str
    ) -> str:
        """Conclude the interview with a final decision. Use this when you are ready to announce your verdict.

        Args:
            decision: The visa decision - must be 'approved' or 'denied'
            reason: Brief explanation for the decision (1-2 sentences)
        """
        if decision not in ["approved", "denied"]:
            return "Invalid decision. Use 'approved' or 'denied' only."

        self.data.decision = decision
        self.data.is_concluding = True
        self.data.stage = "concluded"

        logger.info(f"Interview concluded with decision: {decision}, reason: {reason}")

        # Publish final attributes and schedule session end
        ctx_job = get_job_context()
        if ctx_job:
            asyncio.create_task(publish_interview_attributes(ctx_job.room, self.data))
            asyncio.create_task(end_interview_session(ctx_job.room, self.data, f"decision_{decision}"))

        return f"Interview concluded with {decision}. Session will end shortly."


server = AgentServer(
    # Keep 1 idle process ready to reduce cold start time
    num_idle_processes=1,
)


@server.rtc_session(agent_name="visa-interviewer")
async def entrypoint(ctx: JobContext):
    """Main entry point for the visa interview agent."""
    ctx.log_context_fields = {"room": ctx.room.name}

    # Create typed session data
    data = InterviewSessionData(room_name=ctx.room.name)

    session: AgentSession[InterviewSessionData] | None = None

    async def handle_user_inactivity():
        """Monitor user inactivity and prompt them to respond."""
        nonlocal session

        while True:
            await asyncio.sleep(5)  # Check every 5 seconds

            if session is None or data.current_agent_type != "interviewer":
                continue

            if data.is_concluding:
                break

            if data.user_last_spoke_at is None:
                continue

            inactive_seconds = time.time() - data.user_last_spoke_at
            warning_count = data.inactivity_warning_count

            # First warning at 30 seconds
            if inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS and warning_count == 0:
                logger.info("User inactive for 30 seconds - first warning")
                data.inactivity_warning_count = 1
                await session.generate_reply(
                    instructions="The applicant has been silent. Prompt them firmly: 'I need you to answer the question. Please respond now.'"
                )

            # Second warning at 60 seconds (30 + 30)
            elif inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS * 2 and warning_count == 1:
                logger.info("User inactive for 60 seconds - final warning")
                data.inactivity_warning_count = 2
                await session.generate_reply(
                    instructions="The applicant is still not responding. Give them a final warning: 'This is your final warning. If you do not respond in the next few seconds, your visa will be denied.'"
                )

            # End interview at 90 seconds (30 + 30 + 30)
            elif inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS * 3 and warning_count >= 2:
                logger.info("User inactive for 90 seconds - denying visa")
                data.decision = "denied"
                await session.generate_reply(
                    instructions="The applicant failed to respond. Deny the visa formally: 'Due to your failure to respond to my questions, your visa application is DENIED. This interview is now concluded.'"
                )
                await end_interview_session(ctx.room, data, "user_inactive")
                break

    async def handle_interview_timer():
        """Enforce the 8-minute interview time limit."""
        nonlocal session

        # Wait for interview to actually start
        while not data.interview_started:
            await asyncio.sleep(1)

        if not data.start_time:
            return

        # Warning at 7 minutes
        await asyncio.sleep(INTERVIEW_MAX_DURATION_SECONDS - 60)

        if data.is_concluding:
            return

        if session and data.current_agent_type == "interviewer":
            logger.info("Interview approaching time limit - 1 minute warning")
            await session.generate_reply(
                instructions="The interview time is almost up. You have about one minute left. If you have any final questions, ask them now. Then prepare to give your final decision."
            )

        # Final timeout at 8 minutes
        await asyncio.sleep(60)

        if data.is_concluding:
            return

        if session and data.current_agent_type == "interviewer":
            logger.info("Interview time limit reached - concluding")
            questions = data.questions_asked

            # Make a decision based on the interview
            await session.generate_reply(
                instructions=f"""The interview time has reached its limit. You must now conclude with your decision.

Based on the {questions} questions you asked and the applicant's responses, body language, and overall impression, make your final decision.

Choose one - no middle ground:
- APPROVED: If the applicant answered well, seemed genuine, and demonstrated strong ties to their home country
- DENIED: If there were concerns, inconsistencies, vague answers, or weak ties to home country

Announce your decision clearly: 'Your visa has been APPROVED' or 'Your visa application is DENIED because [reason]'. Then say the interview is concluded."""
            )

            # Give time for the decision to be spoken
            await asyncio.sleep(10)

            if not data.is_concluding:
                data.decision = "denied"
                await end_interview_session(ctx.room, data, "time_limit")

    async def handle_camera_warning():
        """Warn user about camera off, then switch to gate agent."""
        nonlocal session
        if session is None:
            return

        logger.info("Camera off - sending warning, waiting 10 seconds")
        await session.generate_reply(
            instructions="The applicant's camera has been turned off. Firmly tell them that camera is mandatory for visa interviews and they must re-enable it within 10 seconds or the interview will be paused."
        )

        await asyncio.sleep(10)

        if not data.has_video and data.current_agent_type == "interviewer":
            logger.info("Camera still off - switching to CameraGateAgent")
            # Save context without gate instructions for when we resume
            data.saved_context = session.agent.chat_ctx.copy(exclude_instructions=True)
            data.current_agent_type = "gate"
            session.update_agent(CameraGateAgent(language_name=data.language_name))
            data.gate_reminder_task = asyncio.create_task(handle_gate_reminders())

    async def handle_gate_reminders():
        """Send timed reminders while waiting for camera."""
        nonlocal session
        if session is None:
            return

        await asyncio.sleep(GATE_FIRST_REMINDER_SECONDS)

        if not data.has_video and data.current_agent_type == "gate":
            logger.info("Gate timeout - first reminder")
            await session.generate_reply(
                instructions="Firmly remind them that the camera is absolutely required for a visa interview. This is standard embassy procedure. Ask if they're having technical difficulties."
            )

        await asyncio.sleep(GATE_SECOND_REMINDER_SECONDS)

        if not data.has_video and data.current_agent_type == "gate":
            logger.info("Gate timeout - ending session")
            await session.generate_reply(
                instructions="This is the final notice. Inform them that the interview cannot proceed without camera. The session is ending. They may reschedule when they have working video capability."
            )
            await asyncio.sleep(5)
            await ctx.room.disconnect()

    # Event handlers
    @ctx.room.on("track_subscribed")
    def _on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        nonlocal session
        _ = publication

        if track.kind == rtc.TrackKind.KIND_VIDEO:
            data.has_video = True
            logger.info(f"VIDEO TRACK DETECTED from {participant.identity}")

            # Extract interview config from participant metadata (sent from frontend)
            if data.country_name is None:
                metadata = get_participant_metadata(participant)
                if metadata:
                    data.country_name = metadata.get("countryName", "US")
                    data.visa_type_name = metadata.get("visaTypeName", "visitor")
                    data.language_name = metadata.get("languageName")
                    logger.info(f"Interview config: country={data.country_name}, visa={data.visa_type_name}, language={data.language_name}")

            # Cancel pending tasks
            if data.warning_task and not data.warning_task.done():
                data.warning_task.cancel()
                data.warning_task = None
            if data.gate_reminder_task and not data.gate_reminder_task.done():
                data.gate_reminder_task.cancel()
                data.gate_reminder_task = None

            # Handoff to interviewer
            if session and data.current_agent_type == "gate":
                logger.info("HANDOFF: Gate → Interviewer")
                saved_ctx = data.saved_context
                is_resuming = saved_ctx is not None

                if not data.interview_started:
                    data.interview_started = True
                    data.start_time = time.time()
                    data.user_last_spoke_at = time.time()

                    # Start interview timer
                    data.interview_timer_task = asyncio.create_task(
                        handle_interview_timer()
                    )
                    # Start inactivity monitor
                    data.inactivity_task = asyncio.create_task(
                        handle_user_inactivity()
                    )

                data.current_agent_type = "interviewer"

                session.update_agent(
                    VisaInterviewerAgent(
                        country_name=data.country_name,
                        visa_type_name=data.visa_type_name,
                        language_name=data.language_name,
                        chat_ctx=saved_ctx,
                        is_resuming=is_resuming
                    )
                )

    @ctx.room.on("track_unsubscribed")
    def _on_track_unsubscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        nonlocal session
        _ = publication

        if track.kind == rtc.TrackKind.KIND_VIDEO:
            data.has_video = False
            logger.info(f"VIDEO TRACK LOST from {participant.identity}")

            if session and data.current_agent_type == "interviewer":
                data.warning_task = asyncio.create_task(handle_camera_warning())

    @ctx.room.on("track_muted")
    def _on_track_muted(participant: rtc.Participant, publication: rtc.TrackPublication):
        if publication.kind == rtc.TrackKind.KIND_VIDEO:
            data.has_video = False
            logger.info(f"Video muted by {participant.identity} - treating as camera off")

            # Trigger camera warning flow (same as track unsubscribed)
            if session and data.current_agent_type == "interviewer":
                data.warning_task = asyncio.create_task(handle_camera_warning())

    @ctx.room.on("track_unmuted")
    def _on_track_unmuted(participant: rtc.Participant, publication: rtc.TrackPublication):
        if publication.kind == rtc.TrackKind.KIND_VIDEO:
            data.has_video = True
            logger.info(f"Video unmuted by {participant.identity}")

            # Cancel any pending warning task
            if data.warning_task and not data.warning_task.done():
                data.warning_task.cancel()
                data.warning_task = None

            # Acknowledge if still in interviewer mode
            if session and data.current_agent_type == "interviewer":
                async def ack_video():
                    await session.generate_reply(
                        instructions="The applicant has resumed their video. Briefly acknowledge and continue the interview."
                    )
                asyncio.create_task(ack_video())

    @ctx.room.on("participant_disconnected")
    def _on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info(f"Participant {participant.identity} disconnected")

        # Cancel all tasks
        data.cancel_all_tasks()

        # Log session summary
        if data.interview_started:
            duration_seconds = 0
            if data.start_time:
                duration_seconds = int(time.time() - data.start_time)

            if not data.decision:
                data.decision = "denied"
                logger.info("Participant left without decision - marking as denied")

            logger.info(f"Interview ended - duration: {duration_seconds}s, decision: {data.decision}")

        # Disconnect from room when participant leaves
        asyncio.create_task(ctx.room.disconnect())

    # User state change handler for tracking speech activity
    def setup_user_state_handler(sess: AgentSession[InterviewSessionData]):
        @sess.on("user_state_changed")
        def _on_user_state_changed(ev: UserStateChangedEvent):
            if ev.new_state == "speaking":
                data.user_last_spoke_at = time.time()
                data.inactivity_warning_count = 0
                logger.debug("User started speaking - reset inactivity timer")

    # Connect to room
    await ctx.connect()
    logger.info("Connected to room")

    # Publish initial attributes immediately so frontend has data
    await publish_interview_attributes(ctx.room, data)

    # Check for existing video tracks from remote participants
    # This handles the case where the user already has their camera on when joining
    for participant in ctx.room.remote_participants.values():
        for publication in participant.track_publications.values():
            if publication.track and publication.track.kind == rtc.TrackKind.KIND_VIDEO:
                data.has_video = True
                logger.info(f"Found existing video track from {participant.identity}")

                # Extract interview config from participant metadata
                if data.country_name is None:
                    metadata = get_participant_metadata(participant)
                    if metadata:
                        data.country_name = metadata.get("countryName", "US")
                        data.visa_type_name = metadata.get("visaTypeName", "visitor")
                        data.language_name = metadata.get("languageName")
                        logger.info(f"Interview config: country={data.country_name}, visa={data.visa_type_name}, language={data.language_name}")
                break
        if data.has_video:
            break

    # Create agent session matching official example setup
    logger.info("Creating agent session")
    session = AgentSession[InterviewSessionData](
        userdata=data,
        vad=silero.VAD.load(),
        llm=google.realtime.RealtimeModel(
            model="gemini-live-2.5-flash-native-audio",
            voice="Charon",
            vertexai=True,
            project="visa-interview-2024",
            location="us-central1",
        ),
        # Constant 2fps video for continuous facial expression analysis
        video_sampler=voice.VoiceActivityVideoSampler(speaking_fps=2.0, silent_fps=2.0),
    )

    # Setup user state handler
    setup_user_state_handler(session)

    # Determine initial agent
    if data.has_video:
        logger.info("Camera already enabled - starting with Interviewer")
        data.current_agent_type = "interviewer"
        data.interview_started = True
        data.start_time = time.time()
        data.user_last_spoke_at = time.time()
        initial_agent = VisaInterviewerAgent(
            country_name=data.country_name,
            visa_type_name=data.visa_type_name,
            language_name=data.language_name
        )
    else:
        logger.info("No camera - starting with Gate")
        data.current_agent_type = "gate"
        initial_agent = CameraGateAgent(language_name=data.language_name)

    # Start session with video input (audio handled by VAD automatically)
    await session.start(
        room=ctx.room,
        agent=initial_agent,
        room_options=room_io.RoomOptions(
            video_input=True,
        ),
    )

    logger.info(f"Session started with {data.current_agent_type} agent")

    if data.current_agent_type == "gate":
        data.gate_reminder_task = asyncio.create_task(handle_gate_reminders())
    elif data.current_agent_type == "interviewer":
        # Start interview timer and inactivity monitor
        data.interview_timer_task = asyncio.create_task(handle_interview_timer())
        data.inactivity_task = asyncio.create_task(handle_user_inactivity())


if __name__ == "__main__":
    # Start health check server for Cloud Run
    import os
    if os.environ.get("PORT"):
        from healthcheck import start_health_server
        start_health_server()

    cli.run_app(server)
