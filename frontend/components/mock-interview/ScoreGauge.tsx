"use client";

import React from "react";
import { motion } from "motion/react";

interface ScoreGaugeProps {
  score: number; // 0-100
  label?: string;
  size?: number;
}

// Get score status based on value
const getScoreStatus = (score: number): { label: string; color: string } => {
  if (score >= 80) return { label: "Excellent", color: "#03763D" };
  if (score >= 60) return { label: "Good", color: "#10A0F0" };
  if (score >= 40) return { label: "To improve", color: "#B08D23" };
  return { label: "Needs work", color: "#DC2626" };
};

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  label = "Interview Score",
  size = 200,
}) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const status = getScoreStatus(clampedScore);

  // Arc parameters
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const centerX = size / 2;
  const centerY = size / 2;

  // Arc goes from 135° to 405° (270° total sweep)
  const startAngle = 135;
  const endAngle = 405;
  const sweepAngle = endAngle - startAngle; // 270°

  // Calculate the score angle
  const scoreAngle = startAngle + (clampedScore / 100) * sweepAngle;

  // Convert angle to radians
  const toRadians = (angle: number) => (angle * Math.PI) / 180;

  // Calculate arc path
  const describeArc = (startAng: number, endAng: number) => {
    const start = {
      x: centerX + radius * Math.cos(toRadians(startAng)),
      y: centerY + radius * Math.sin(toRadians(startAng)),
    };
    const end = {
      x: centerX + radius * Math.cos(toRadians(endAng)),
      y: centerY + radius * Math.sin(toRadians(endAng)),
    };
    const largeArcFlag = endAng - startAng > 180 ? 1 : 0;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  // Calculate indicator dot position
  const indicatorX = centerX + radius * Math.cos(toRadians(scoreAngle));
  const indicatorY = centerY + radius * Math.sin(toRadians(scoreAngle));

  // Gradient colors for the arc
  const gradientId = `score-gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size * 0.9}
        viewBox={`0 0 ${size} ${size * 0.95}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="33%" stopColor="#F59E0B" />
            <stop offset="66%" stopColor="#10A0F0" />
            <stop offset="100%" stopColor="#03763D" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="#E5E5E5"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Score arc */}
        <motion.path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clampedScore / 100 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Indicator dot */}
        <motion.circle
          cx={indicatorX}
          cy={indicatorY}
          r={6}
          fill={status.color}
          stroke="#F5F5F5"
          strokeWidth={4}
          initial={{ scale: 0 }}
          animate={{ scale: 1.25 }}
          transition={{ delay: 0.8, duration: 0.3 }}
        />

        {/* Score text */}
        <text
          x={centerX}
          y={centerY - 2}
          textAnchor="middle"
          className="font-display text-4xl"
          fill="#0E1716"
        >
          {clampedScore}
        </text>

        {/* Label text */}
        <text
          x={centerX}
          y={centerY + 20}
          textAnchor="middle"
          className="font-inter text-xs"
          fill="#828283"
        >
          {label}
        </text>
      </svg>

      {/* Status badge */}
      <div
        className="mt-2 px-4 py-1.5 rounded-full font-inter text-sm font-medium border"
        style={{
          backgroundColor: `${status.color}10`,
          borderColor: `${status.color}30`,
          color: status.color,
        }}
      >
        {status.label}
      </div>
    </div>
  );
};

export default ScoreGauge;
