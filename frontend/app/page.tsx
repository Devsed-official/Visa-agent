"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Video } from "lucide-react";
import { Button } from "@/components/custombutton";
import {
  InterviewProvider,
  SessionView,
  type InterviewConnectionState,
} from "@/components/interview";
import type { AppConfig } from "@/app-config";

// Interview app config
const interviewAppConfig: AppConfig = {
  name: "Visa Interview Agent",
  supportsVideoInput: true,
  supportsScreenShare: false,
  startButtonText: "Start Interview",
};

type PageState = "setup" | "connecting" | "interview" | "completed";

interface ConnectionDetails {
  token: string;
  url: string;
  roomName: string;
}

export default function Home() {
  const [pageState, setPageState] = useState<PageState>("setup");
  const [userName, setUserName] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

  const handleStartInterview = useCallback(async () => {
    if (!userName.trim()) return;

    try {
      setIsStarting(true);
      setPageState("connecting");

      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: userName.trim(),
          visaType: "F1 Student Visa",
          countryName: "US",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get token");
      }

      const data = await response.json();
      setConnectionDetails(data);
      setPageState("interview");
    } catch (error) {
      console.error("Failed to start interview:", error);
      setPageState("setup");
    } finally {
      setIsStarting(false);
    }
  }, [userName]);

  const handleConnectionStateChange = useCallback(
    (state: InterviewConnectionState) => {
      if (state === "failed") {
        setPageState("setup");
      }
    },
    []
  );

  const handleDisconnect = useCallback(() => {
    setPageState("completed");
  }, []);

  const handleRestart = useCallback(() => {
    setUserName("");
    setConnectionDetails(null);
    setPageState("setup");
  }, []);

  return (
    <div className="h-screen w-full bg-[#FAFAFA]">
      <AnimatePresence mode="wait">
        {/* Setup View */}
        {pageState === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex h-full items-center justify-center px-4"
          >
            <div className="w-full max-w-md">
              {/* Header */}
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#10A0F0]/10">
                  <Video className="h-8 w-8 text-[#10A0F0]" />
                </div>
                <h1 className="text-xl font-medium tracking-wide text-[#0E1716]">
                  F1 Visa Interview Practice
                </h1>
                <p className="mt-2 text-sm text-[#828283]">
                  Practice your US F1 Student Visa interview with an AI interviewer
                </p>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Name Input */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#525252]">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name as on passport"
                    className="h-12 w-full rounded-xl border border-[#E3E3E3] bg-white px-4 text-sm outline-none transition-all focus:border-[#10A0F0] focus:ring-2 focus:ring-[#10A0F0]/20"
                  />
                </div>

                {/* Fixed Info */}
                <div className="rounded-xl bg-[#F5F5F5] p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#828283]">Country</span>
                    <span className="font-medium text-[#0E1716]">United States</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-[#828283]">Visa Type</span>
                    <span className="font-medium text-[#0E1716]">F1 Student Visa</span>
                  </div>
                </div>

                {/* Info Box */}
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                  <p className="text-sm text-[#9A3412]">
                    <strong>Note:</strong> Make sure your camera and microphone are
                    working. The interviewer will ask you to enable your camera before
                    starting.
                  </p>
                </div>

                {/* Start Button */}
                <Button
                  onClick={handleStartInterview}
                  disabled={!userName.trim()}
                  loading={isStarting}
                  loadingText="Starting..."
                  normalColor="#10A0F0"
                  fullWidth
                  className="mt-6"
                >
                  Start Interview
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Connecting View */}
        {pageState === "connecting" && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full items-center justify-center"
          >
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#10A0F0] border-t-transparent" />
              <p className="mt-4 text-sm text-[#828283]">
                Connecting to interview...
              </p>
            </div>
          </motion.div>
        )}

        {/* Interview View */}
        {pageState === "interview" && connectionDetails && (
          <motion.div
            key="interview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <InterviewProvider
              connectionDetails={{
                url: connectionDetails.url,
                token: connectionDetails.token,
              }}
              roomName={connectionDetails.roomName}
              onConnectionStateChange={handleConnectionStateChange}
              onDisconnected={handleDisconnect}
            >
              <SessionView appConfig={interviewAppConfig} />
            </InterviewProvider>
          </motion.div>
        )}

        {/* Completed View */}
        {pageState === "completed" && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex h-screen w-full items-center justify-center px-4"
          >
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-[#0E1716]">
                Interview Completed
              </h2>
              <p className="mt-2 text-sm text-[#828283]">
                Your practice interview session has ended.
              </p>
              <Button
                onClick={handleRestart}
                normalColor="#10A0F0"
                className="mt-6"
              >
                Start New Interview
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
