"use client";

import React from "react";
import { motion } from "motion/react";
import { Clock, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/custombutton";
import { ScoreGauge } from "./ScoreGauge";

// Interview result data from the session
export interface InterviewResult {
  decision: "approved" | "denied" | null;
  questionsAsked: number;
  confidenceLevel: "low" | "neutral" | "high";
  durationSeconds: number;
}

interface InterviewResultsViewProps {
  result: InterviewResult;
  onRestart: () => void;
}

// Format duration from seconds
const formatDuration = (seconds: number): string => {
  if (!seconds) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

// Map confidence level to score (0-100)
const confidenceToScore = (level: "low" | "neutral" | "high"): number => {
  switch (level) {
    case "high":
      return 85;
    case "neutral":
      return 60;
    case "low":
      return 35;
    default:
      return 50;
  }
};

// Get feedback based on decision and confidence
const getFeedback = (
  decision: "approved" | "denied" | null,
  confidence: "low" | "neutral" | "high"
): { strengths: string[]; improvements: string[] } => {
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (decision === "approved") {
    strengths.push("Clear and consistent answers");
    strengths.push("Good preparation evident");
    if (confidence === "high") {
      strengths.push("Confident body language");
    }
  } else if (decision === "denied") {
    improvements.push("Review your documentation");
    improvements.push("Practice explaining your purpose clearly");
  }

  if (confidence === "low") {
    improvements.push("Work on maintaining eye contact");
    improvements.push("Practice speaking with more confidence");
  } else if (confidence === "neutral") {
    improvements.push("Try to appear more relaxed");
    strengths.push("Reasonable composure");
  } else if (confidence === "high") {
    strengths.push("Excellent body language");
    strengths.push("Strong presence");
  }

  return { strengths, improvements };
};

export const InterviewResultsView: React.FC<InterviewResultsViewProps> = ({
  result,
  onRestart,
}) => {
  const { decision, questionsAsked, confidenceLevel, durationSeconds } = result;
  const overallScore = confidenceToScore(confidenceLevel);
  const { strengths, improvements } = getFeedback(decision, confidenceLevel);

  // Show error state if interview didn't properly start
  if (questionsAsked === 0 && decision === null) {
    return (
      <div className="min-h-screen overflow-y-auto bg-[#FAFAFA] py-8">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl p-6 text-center bg-yellow-50 border border-yellow-200"
          >
            <div className="flex justify-center mb-3">
              <HelpCircle className="h-12 w-12 text-yellow-500" />
            </div>
            <h1 className="text-2xl font-semibold text-[#0E1716]">
              Session Ended Early
            </h1>
            <p className="mt-2 text-sm text-[#828283]">
              The interview session ended before it could properly start.
              This may be due to a connection issue.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-[#E3E3E3] p-4"
          >
            <h3 className="text-sm font-medium text-[#0E1716] mb-2">Tips:</h3>
            <ul className="space-y-2 text-sm text-[#525252]">
              <li className="flex items-start gap-2">
                <span className="text-[#A0A0A0] mt-1">•</span>
                Make sure your camera is enabled when prompted
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#A0A0A0] mt-1">•</span>
                Check your internet connection
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#A0A0A0] mt-1">•</span>
                Try refreshing the page and starting again
              </li>
            </ul>
          </motion.div>

          <Button onClick={onRestart} normalColor="#10A0F0" fullWidth>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#FAFAFA] py-8">
      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        {/* Decision Banner */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`rounded-2xl p-6 text-center ${
            decision === "approved"
              ? "bg-green-50 border border-green-200"
              : decision === "denied"
              ? "bg-red-50 border border-red-200"
              : "bg-gray-50 border border-gray-200"
          }`}
        >
          <div className="flex justify-center mb-3">
            {decision === "approved" ? (
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            ) : decision === "denied" ? (
              <XCircle className="h-12 w-12 text-red-500" />
            ) : (
              <HelpCircle className="h-12 w-12 text-gray-400" />
            )}
          </div>
          <h1 className="text-2xl font-semibold text-[#0E1716]">
            {decision === "approved"
              ? "Visa Approved!"
              : decision === "denied"
              ? "Visa Denied"
              : "Interview Completed"}
          </h1>
          <p className="mt-2 text-sm text-[#828283]">
            {decision === "approved"
              ? "Congratulations! You did great in the mock interview."
              : decision === "denied"
              ? "Don't worry - this is practice. Review the feedback below."
              : "Your mock interview session has ended."}
          </p>
        </motion.div>

        {/* Score Gauge Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white rounded-3xl border border-[#E3E3E3] p-6 pt-8"
        >
          {/* Title */}
          <div className="text-center mb-4">
            <h2 className="text-lg font-medium tracking-wide text-[#0E1716]">
              Performance Score
            </h2>
          </div>

          {/* Gauge */}
          <div className="flex justify-center py-4">
            <ScoreGauge score={overallScore} label="Confidence Score" />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-6 pt-4 border-t border-[#F0F0F0] mt-4">
            <div className="flex items-center gap-2 text-[#828283]">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{formatDuration(durationSeconds)}</span>
            </div>
            <div className="w-px h-4 bg-[#E3E3E3]" />
            <div className="flex items-center gap-2 text-[#828283]">
              <HelpCircle className="h-4 w-4" />
              <span className="text-sm">{questionsAsked} questions</span>
            </div>
          </div>
        </motion.div>

        {/* Strengths & Improvements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strengths */}
          {strengths.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="bg-white rounded-2xl border border-[#E3E3E3] p-4"
            >
              <h3 className="text-sm font-medium tracking-wide text-[#03763D] mb-3 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-[#03763D]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                Strengths
              </h3>
              <ul className="space-y-2">
                {strengths.map((strength, index) => (
                  <li
                    key={index}
                    className="text-sm text-[#525252] flex items-start gap-2"
                  >
                    <span className="text-[#A0A0A0] mt-1">•</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Improvements */}
          {improvements.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="bg-white rounded-2xl border border-[#E3E3E3] p-4"
            >
              <h3 className="text-sm font-medium tracking-wide text-[#B08D23] mb-3 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#FFFBEB] flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-[#B08D23]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                </div>
                Areas to Improve
              </h3>
              <ul className="space-y-2">
                {improvements.map((improvement, index) => (
                  <li
                    key={index}
                    className="text-sm text-[#525252] flex items-start gap-2"
                  >
                    <span className="text-[#A0A0A0] mt-1">•</span>
                    {improvement}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="pt-2 pb-6"
        >
          <Button onClick={onRestart} normalColor="#10A0F0" fullWidth>
            Start New Interview
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default InterviewResultsView;
