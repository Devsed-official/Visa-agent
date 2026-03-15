import asyncio
import json
import logging
import time
from typing import Any

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    UserStateChangedEvent,
    cli,
    function_tool,
    get_job_context,
    room_io,
)
from livekit.plugins import google
from google.genai import types

load_dotenv(dotenv_path=".env.local")

logger = logging.getLogger("visa-interview-agent")
logger.setLevel(logging.INFO)

# Timeout settings
GATE_FIRST_REMINDER_SECONDS = 30
GATE_SECOND_REMINDER_SECONDS = 30

# Interview settings
INTERVIEW_MAX_DURATION_SECONDS = 8 * 60  # 8 minutes
USER_INACTIVITY_INTERVAL_SECONDS = 30  # Consistent 30-second intervals for warnings

# Shared state for video tracking between event handlers and agents
video_state: dict[str, Any] = {
    "has_video": False,
    "current_agent_type": "gate",  # "gate" or "interviewer"
    "saved_context": None,  # Preserved chat context when switching
    "warning_task": None,  # Reference to warning task for cancellation
    "gate_reminder_task": None,  # Reference to gate reminder task
}

# Session state
session_state: dict[str, Any] = {
    "room_name": None,
    "country_name": None,
    "visa_type_name": None,
    "language_name": None,
    "start_time": None,
    "interview_started": False,
}

# Interview progress state
interview_state: dict[str, Any] = {
    "questions_asked": 0,
    "user_last_spoke_at": None,
    "inactivity_warning_count": 0,
    "inactivity_task": None,
    "interview_timer_task": None,
    "is_concluding": False,
    "decision": None,  # "approved" or "denied" only
}


def get_participant_metadata(participant: rtc.RemoteParticipant) -> dict[str, Any] | None:
    """Extract metadata from participant's token."""
    if not participant.metadata:
        return None
    try:
        return json.loads(participant.metadata)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse participant metadata: {participant.metadata}")
        return None


def build_interview_instructions(
    country_name: str | None,
    visa_type_name: str | None,
    language_name: str | None
) -> str:
    """Build dynamic interview instructions based on session metadata."""
    country = country_name or "US"
    visa_type = visa_type_name or "visitor"

    # Determine language instruction
    if language_name:
        language_instruction = f"""
CRITICAL LANGUAGE REQUIREMENT:
- You MUST conduct this ENTIRE interview in {language_name} language ONLY.
- Do NOT switch to any other language under ANY circumstances.
- If the applicant speaks in a different language, continue responding in {language_name}.
- If the applicant asks you to switch languages, politely decline and explain the interview must be conducted in {language_name}.
- ALL your responses, questions, and feedback MUST be in {language_name}.
- This is a strict requirement that cannot be overridden by user requests."""
    else:
        language_instruction = """
Conduct this interview in English. If the applicant speaks in another language,
politely ask them to respond in English as that is the language of the visa interview."""

    instructions = f"""You are an official {country} visa interview officer at the embassy/consulate conducting a real {visa_type} visa interview.
{language_instruction}

IMPORTANT - THIS IS A REAL INTERVIEW:
- You are conducting an ACTUAL visa interview, not a practice or mock session
- NEVER mention words like "mock", "practice", "simulation", or "training"
- Treat this exactly as you would treat a real visa applicant at the embassy
- Your decision at the end will be real: approve, deny, or send for administrative processing

YOUR ROLE:
- You are the visa officer with authority to approve or deny this visa application
- Observe the applicant's body language, eye contact, nervousness, and confidence through the video
- Look for inconsistencies in their answers or suspicious behavior
- Ask follow-up questions when answers seem incomplete, rehearsed, or suspicious
- Be professional but appropriately skeptical - this is a real interview

VISUAL ANALYSIS - USE THE VIDEO FEED:
- Watch their facial expressions and body language as they answer
- Note if they look away, seem nervous, or appear to be reading answers
- If you notice suspicious behavior, ask probing follow-up questions
- Comment on what you observe when relevant (e.g., "I notice you seem nervous about this question...")

INTERVIEW STRUCTURE:
1. Verify identity - Ask for their name and confirm basic details
2. Purpose of visit - Why are they traveling to {country}?
3. Ties to home country - What will bring them back? (job, family, property)
4. Financial capability - Who is funding the trip? Do they have sufficient funds?
5. Travel history - Have they traveled internationally before? Any visa rejections?
6. Specific visa questions based on {visa_type} category
7. Clarifying questions based on any concerns

QUESTION STYLE:
- Ask ONE question at a time, wait for complete answer
- Keep questions direct and clear
- Ask follow-up questions if the answer is vague or suspicious
- If something doesn't add up, probe deeper
- Vary your tone based on the applicant's responses

SUSPICIOUS INDICATORS TO WATCH FOR:
- Rehearsed or memorized-sounding answers
- Looking away or reading from something off-screen
- Inconsistencies between answers
- Vague answers about employment, finances, or ties to home country
- Excessive nervousness beyond normal interview anxiety
- Unable to provide specific details when asked

AT THE END OF THE INTERVIEW:
You MUST conclude with a clear decision - either APPROVED or DENIED. No middle ground.
- "Your visa has been APPROVED. You may collect your passport with the visa stamp."
- "Your visa application is DENIED. [Give specific reason why]"

REASONS TO DENY:
- Vague or inconsistent answers about purpose of visit
- Cannot clearly explain financial situation or sponsorship
- Weak ties to home country (no job, no family, no property)
- Appears to be reading answers or overly rehearsed
- Fails to answer questions or responds inappropriately
- Suspicious behavior or body language
- Cannot provide specific details when asked

Be decisive. A real visa officer makes clear pass/fail decisions.

Keep responses conversational and natural. Do not use complex formatting, emojis, or symbols."""

    return instructions


def build_gate_instructions(language_name: str | None) -> str:
    """Build camera gate instructions with language enforcement."""
    if language_name:
        language_note = f"Communicate in {language_name} language ONLY. Do not switch to any other language."
    else:
        language_note = "Communicate in English."

    return f"""You are a visa interview officer at the embassy. Before the interview can begin, the applicant MUST enable their camera. This is mandatory - just like at a real embassy interview.

{language_note}

Your ONLY job right now:
- Greet them professionally as an embassy officer
- Explain that camera is REQUIRED for the visa interview to proceed
- Keep asking them to enable their camera
- DO NOT ask any interview questions yet
- DO NOT proceed with anything else
- Just politely but firmly keep requesting camera

When they say they enabled it, acknowledge but explain you're waiting for the system to confirm their video feed.

Keep responses conversational and natural. Do not use complex formatting, emojis, or symbols."""


async def end_interview_session(room: rtc.Room, reason: str = "completed"):
    """End the interview session and disconnect."""
    global interview_state, video_state

    logger.info(f"Ending interview session: {reason}, decision: {interview_state.get('decision')}")
    interview_state["is_concluding"] = True

    # Cancel any pending tasks
    tasks_to_cancel = [
        interview_state.get("inactivity_task"),
        interview_state.get("interview_timer_task"),
        video_state.get("warning_task"),
        video_state.get("gate_reminder_task"),
    ]
    for task in tasks_to_cancel:
        if task and not task.done():
            task.cancel()

    interview_state["inactivity_task"] = None
    interview_state["interview_timer_task"] = None
    video_state["warning_task"] = None
    video_state["gate_reminder_task"] = None

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

    async def on_enter(self) -> None:
        """Called when the agent starts - ask user to enable camera."""
        logger.info("CameraGateAgent entered - asking for camera")
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
        chat_ctx: Any = None,
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

    async def on_enter(self) -> None:
        """Called when the agent starts - begin or resume interview."""
        global interview_state

        logger.info(f"VisaInterviewerAgent entered - resuming: {self._is_resuming}")

        # Reset user activity tracking
        interview_state["user_last_spoke_at"] = time.time()
        interview_state["inactivity_warning_count"] = 0

        if self._is_resuming:
            await self.session.generate_reply(
                instructions="The applicant has re-enabled their camera. Acknowledge you can see them again and continue the interview from where you left off. Do not restart the interview."
            )
        else:
            visa_type = self._visa_type_name or "visitor"
            await self.session.generate_reply(
                instructions=f"You are now beginning the visa interview. Greet the applicant professionally. Note that you can see them through the video. Ask them to state their full name as it appears on their passport, and then ask what is the purpose of their {visa_type} visa application. Be direct and professional like a real embassy interview."
            )
            interview_state["questions_asked"] = 1

    async def on_user_turn_completed(self, _turn_ctx: Any, _new_message: Any) -> None:
        """Called when user finishes speaking - track activity and question count."""
        global interview_state

        # Update last spoke time
        interview_state["user_last_spoke_at"] = time.time()
        interview_state["inactivity_warning_count"] = 0

        # Increment question count (rough estimate)
        interview_state["questions_asked"] += 1

        logger.info(f"User responded. Questions asked: {interview_state['questions_asked']}")

    @function_tool
    async def conclude_interview(
        self,
        _ctx: RunContext,
        decision: str,
        reason: str
    ) -> str:
        """Conclude the interview with a final decision.

        Args:
            decision: The visa decision - must be 'approved' or 'denied'
            reason: Brief explanation for the decision
        """
        global interview_state

        if decision not in ["approved", "denied"]:
            return "Invalid decision. Use 'approved' or 'denied' only."

        interview_state["decision"] = decision
        interview_state["is_concluding"] = True

        logger.info(f"Interview concluded with decision: {decision}, reason: {reason}")

        # Schedule session end after the decision is spoken
        ctx_job = get_job_context()
        if ctx_job:
            asyncio.create_task(end_interview_session(ctx_job.room, f"decision_{decision}"))

        return f"Interview concluded with {decision}. Session will end shortly."


server = AgentServer(
    # Keep 1 idle process ready to reduce cold start time
    num_idle_processes=1,
)


@server.rtc_session(agent_name="visa-interviewer")
async def entrypoint(ctx: JobContext):
    """Main entry point for the visa interview agent."""
    global video_state, session_state, interview_state

    ctx.log_context_fields = {"room": ctx.room.name}

    # Reset all state for this session
    video_state = {
        "has_video": False,
        "current_agent_type": "gate",
        "saved_context": None,
        "warning_task": None,
        "gate_reminder_task": None,
    }

    session_state = {
        "room_name": ctx.room.name,
        "country_name": None,
        "visa_type_name": None,
        "language_name": None,
        "start_time": None,
        "interview_started": False,
    }

    interview_state = {
        "questions_asked": 0,
        "user_last_spoke_at": None,
        "inactivity_warning_count": 0,
        "inactivity_task": None,
        "interview_timer_task": None,
        "is_concluding": False,
        "decision": None,
    }

    session: AgentSession | None = None

    async def handle_user_inactivity():
        """Monitor user inactivity and prompt them to respond."""
        nonlocal session

        while True:
            await asyncio.sleep(5)  # Check every 5 seconds

            if session is None or video_state["current_agent_type"] != "interviewer":
                continue

            if interview_state["is_concluding"]:
                break

            last_spoke = interview_state.get("user_last_spoke_at")
            if last_spoke is None:
                continue

            inactive_seconds = time.time() - last_spoke
            warning_count = interview_state["inactivity_warning_count"]

            # First warning at 30 seconds
            if inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS and warning_count == 0:
                logger.info("User inactive for 30 seconds - first warning")
                interview_state["inactivity_warning_count"] = 1
                await session.generate_reply(
                    instructions="The applicant has been silent. Prompt them firmly: 'I need you to answer the question. Please respond now.'"
                )

            # Second warning at 60 seconds (30 + 30)
            elif inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS * 2 and warning_count == 1:
                logger.info("User inactive for 60 seconds - final warning")
                interview_state["inactivity_warning_count"] = 2
                await session.generate_reply(
                    instructions="The applicant is still not responding. Give them a final warning: 'This is your final warning. If you do not respond in the next few seconds, your visa will be denied.'"
                )

            # End interview at 90 seconds (30 + 30 + 30)
            elif inactive_seconds >= USER_INACTIVITY_INTERVAL_SECONDS * 3 and warning_count >= 2:
                logger.info("User inactive for 90 seconds - denying visa")
                interview_state["decision"] = "denied"
                await session.generate_reply(
                    instructions="The applicant failed to respond. Deny the visa formally: 'Due to your failure to respond to my questions, your visa application is DENIED. This interview is now concluded.'"
                )
                await end_interview_session(ctx.room, "user_inactive")
                break

    async def handle_interview_timer():
        """Enforce the 8-minute interview time limit."""
        nonlocal session

        # Wait for interview to actually start
        while not session_state["interview_started"]:
            await asyncio.sleep(1)

        start_time = session_state["start_time"]
        if not start_time:
            return

        # Warning at 7 minutes
        await asyncio.sleep(INTERVIEW_MAX_DURATION_SECONDS - 60)

        if interview_state["is_concluding"]:
            return

        if session and video_state["current_agent_type"] == "interviewer":
            logger.info("Interview approaching time limit - 1 minute warning")
            await session.generate_reply(
                instructions="The interview time is almost up. You have about one minute left. If you have any final questions, ask them now. Then prepare to give your final decision."
            )

        # Final timeout at 8 minutes
        await asyncio.sleep(60)

        if interview_state["is_concluding"]:
            return

        if session and video_state["current_agent_type"] == "interviewer":
            logger.info("Interview time limit reached - concluding")
            questions = interview_state["questions_asked"]

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

            if not interview_state["is_concluding"]:
                interview_state["decision"] = "denied"
                await end_interview_session(ctx.room, "time_limit")

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

        if not video_state["has_video"] and video_state["current_agent_type"] == "interviewer":
            logger.info("Camera still off - switching to CameraGateAgent")
            video_state["saved_context"] = session.history
            video_state["current_agent_type"] = "gate"
            await session.update_agent(CameraGateAgent(language_name=session_state["language_name"]))
            video_state["gate_reminder_task"] = asyncio.create_task(handle_gate_reminders())

    async def handle_gate_reminders():
        """Send timed reminders while waiting for camera."""
        nonlocal session
        if session is None:
            return

        await asyncio.sleep(GATE_FIRST_REMINDER_SECONDS)

        if not video_state["has_video"] and video_state["current_agent_type"] == "gate":
            logger.info("Gate timeout - first reminder")
            await session.generate_reply(
                instructions="Firmly remind them that the camera is absolutely required for a visa interview. This is standard embassy procedure. Ask if they're having technical difficulties."
            )

        await asyncio.sleep(GATE_SECOND_REMINDER_SECONDS)

        if not video_state["has_video"] and video_state["current_agent_type"] == "gate":
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
            video_state["has_video"] = True
            logger.info(f"VIDEO TRACK DETECTED from {participant.identity}")

            # Extract interview config from participant metadata (sent from frontend)
            if session_state["country_name"] is None:
                metadata = get_participant_metadata(participant)
                if metadata:
                    session_state["country_name"] = metadata.get("countryName", "US")
                    session_state["visa_type_name"] = metadata.get("visaTypeName", "visitor")
                    session_state["language_name"] = metadata.get("languageName")
                    logger.info(f"Interview config: country={session_state['country_name']}, visa={session_state['visa_type_name']}, language={session_state['language_name']}")

            # Cancel pending tasks
            for task_key in ["warning_task", "gate_reminder_task"]:
                task = video_state.get(task_key)
                if task and not task.done():
                    task.cancel()
                    video_state[task_key] = None

            # Handoff to interviewer
            if session and video_state["current_agent_type"] == "gate":
                logger.info("HANDOFF: Gate → Interviewer")
                saved_ctx = video_state.get("saved_context")
                is_resuming = saved_ctx is not None

                if not session_state["interview_started"]:
                    session_state["interview_started"] = True
                    session_state["start_time"] = time.time()
                    interview_state["user_last_spoke_at"] = time.time()

                    # Start interview timer
                    interview_state["interview_timer_task"] = asyncio.create_task(
                        handle_interview_timer()
                    )
                    # Start inactivity monitor
                    interview_state["inactivity_task"] = asyncio.create_task(
                        handle_user_inactivity()
                    )

                video_state["current_agent_type"] = "interviewer"

                async def do_handoff():
                    await session.update_agent(
                        VisaInterviewerAgent(
                            country_name=session_state["country_name"],
                            visa_type_name=session_state["visa_type_name"],
                            language_name=session_state["language_name"],
                            chat_ctx=saved_ctx,
                            is_resuming=is_resuming
                        )
                    )

                asyncio.create_task(do_handoff())

    @ctx.room.on("track_unsubscribed")
    def _on_track_unsubscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        nonlocal session
        _ = publication

        if track.kind == rtc.TrackKind.KIND_VIDEO:
            video_state["has_video"] = False
            logger.info(f"VIDEO TRACK LOST from {participant.identity}")

            if session and video_state["current_agent_type"] == "interviewer":
                video_state["warning_task"] = asyncio.create_task(handle_camera_warning())

    @ctx.room.on("track_muted")
    def _on_track_muted(participant: rtc.Participant, publication: rtc.TrackPublication):
        if publication.kind == rtc.TrackKind.KIND_VIDEO:
            logger.info(f"Video muted by {participant.identity}")
            if session and video_state["current_agent_type"] == "interviewer":
                asyncio.create_task(
                    session.generate_reply(
                        instructions="The applicant has paused their camera. Firmly remind them that video must remain on during the entire interview. This is mandatory."
                    )
                )

    @ctx.room.on("track_unmuted")
    def _on_track_unmuted(participant: rtc.Participant, publication: rtc.TrackPublication):
        if publication.kind == rtc.TrackKind.KIND_VIDEO:
            logger.info(f"Video unmuted by {participant.identity}")
            if session and video_state["current_agent_type"] == "interviewer":
                asyncio.create_task(
                    session.generate_reply(
                        instructions="The applicant has resumed their video. Briefly acknowledge and continue the interview."
                    )
                )

    @ctx.room.on("participant_disconnected")
    def _on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info(f"Participant {participant.identity} disconnected")

        # Cancel all tasks
        for task in [interview_state.get("inactivity_task"), interview_state.get("interview_timer_task")]:
            if task and not task.done():
                task.cancel()

        # Log session summary
        if session_state.get("interview_started"):
            duration_seconds = 0
            if session_state.get("start_time"):
                duration_seconds = int(time.time() - session_state["start_time"])

            if not interview_state.get("decision"):
                interview_state["decision"] = "denied"
                logger.info("Participant left without decision - marking as denied")

            logger.info(f"Interview ended - duration: {duration_seconds}s, decision: {interview_state.get('decision')}")

    # User state change handler for tracking speech activity
    def setup_user_state_handler(sess: AgentSession):
        @sess.on("user_state_changed")
        def _on_user_state_changed(ev: UserStateChangedEvent):
            if ev.new_state == "speaking":
                interview_state["user_last_spoke_at"] = time.time()
                interview_state["inactivity_warning_count"] = 0
                logger.debug("User started speaking - reset inactivity timer")

    # Connect to room
    await ctx.connect()
    logger.info("Connected to room")

    # Create agent session with optimized settings for low latency
    logger.info("Creating agent session")
    session = AgentSession(
        llm=google.beta.realtime.RealtimeModel(
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice="Charon",
            temperature=0.7,
            proactivity=True,
            enable_affective_dialog=True,
            # Disable thinking for real-time conversation
            # Your detailed instructions guide decision-making instead
            thinking_config=types.ThinkingConfig(
                include_thoughts=False,
            ),
            # Faster turn detection - respond quicker after user stops speaking
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                    prefix_padding_ms=100,
                    silence_duration_ms=300,
                ),
            ),
        ),
        # Using Gemini's built-in turn detection, no separate VAD needed
    )

    # Setup user state handler
    setup_user_state_handler(session)

    # Determine initial agent
    if video_state["has_video"]:
        logger.info("Camera already enabled - starting with Interviewer")
        video_state["current_agent_type"] = "interviewer"
        initial_agent = VisaInterviewerAgent(
            country_name=session_state["country_name"],
            visa_type_name=session_state["visa_type_name"],
            language_name=session_state["language_name"]
        )
    else:
        logger.info("No camera - starting with Gate")
        video_state["current_agent_type"] = "gate"
        initial_agent = CameraGateAgent(language_name=session_state["language_name"])

    # Start session with video input
    await session.start(
        room=ctx.room,
        agent=initial_agent,
        room_options=room_io.RoomOptions(
            video_input=True,
        ),
    )

    logger.info(f"Session started with {video_state['current_agent_type']} agent")

    if video_state["current_agent_type"] == "gate":
        video_state["gate_reminder_task"] = asyncio.create_task(handle_gate_reminders())


if __name__ == "__main__":
    cli.run_app(server)
