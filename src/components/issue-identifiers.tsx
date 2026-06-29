export const CUE_LEVEL_ISSUE_TYPES = [
  "no_continuity",
  "unexpected_continuity",
] as const;

export const CHANNEL_LEVEL_ISSUE_TYPES = [
  "module_offline",
  "low_battery",
  "poor_signal",
] as const;

export type CueLevelIssueType = (typeof CUE_LEVEL_ISSUE_TYPES)[number];
export type ChannelLevelIssueType =
  (typeof CHANNEL_LEVEL_ISSUE_TYPES)[number];
export type ContinuityIssueType = CueLevelIssueType | ChannelLevelIssueType;

type IssueIdentifiersProps = {
  channelNumber: number | string;
  cueValue?: string | null;
  issueType: string;
  cueLabel?: "Cue" | "Cue(s)";
};

export const ISSUE_IDENTIFIER_VALUE_CLASS_NAME =
  "font-bold text-[#f28b82]";

export function isCueLevelIssueType(value: string | null | undefined) {
  return CUE_LEVEL_ISSUE_TYPES.includes(value as CueLevelIssueType);
}

export function isChannelLevelIssueType(value: string | null | undefined) {
  return CHANNEL_LEVEL_ISSUE_TYPES.includes(value as ChannelLevelIssueType);
}

export function issueUsesCue(value: string | null | undefined) {
  return isCueLevelIssueType(value);
}

export function formatIssueLabel(value: string) {
  const labels: Record<string, string> = {
    new: "New / Unassigned",
    assigned: "In Queue",
    in_progress: "Working",
    awaiting_verification: "Awaiting Verification",
    verification_failed: "Not Fixed",
    verified_resolved: "Verified Resolved",
    retrieving_parts: "Retrieving Parts",
    director_assistance_requested: "Director Assistance Req",
    additional_technician_requested:
      "Additional Technician Requested",
    unfixable: "Unfixable",
    closed: "Closed",
    low_battery: "Low Battery",
    poor_signal: "Poor Signal",
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const statusClassNames: Record<string, string> = {
  new: "border-[#8b5cf6]/40 bg-[#1b1235] text-[#d8c8ff]",
  assigned: "border-[#3b82f6]/40 bg-[#0b1b35] text-[#bfdbfe]",
  in_progress: "border-[#3b82f6]/40 bg-[#0b1b35] text-[#bfdbfe]",
  retrieving_parts: "border-[#f59e0b]/40 bg-[#2a1c06] text-[#fde68a]",
  director_assistance_requested:
    "border-[#f59e0b]/40 bg-[#2a1c06] text-[#fde68a]",
  additional_technician_requested:
    "border-[#f59e0b]/40 bg-[#2a1c06] text-[#fde68a]",
  awaiting_verification:
    "border-[#f59e0b]/40 bg-[#2a1c06] text-[#fde68a]",
  verification_failed: "border-[#ef4444]/40 bg-[#2a0b13] text-[#fecaca]",
  verified_resolved: "border-[#22c55e]/40 bg-[#082515] text-[#bbf7d0]",
  root_cause_required: "border-[#8b5cf6]/40 bg-[#1b1235] text-[#d8c8ff]",
  unfixable_recommended:
    "border-[#e8793f]/45 bg-[#2b160c] text-[#fdba8c]",
  unfixable: "border-[#ef4444]/40 bg-[#2a0b13] text-[#fecaca]",
  closed: "border-[#64748b]/35 bg-[#111827] text-[#aab4c3]",
};

export function getIssueStatusClassName(status: string) {
  return (
    statusClassNames[status] ??
    "border-white/10 bg-[#111827] text-[#cbd5e1]"
  );
}

export function IssueIdentifiers({
  channelNumber,
  cueValue,
  issueType,
  cueLabel = "Cue(s)",
}: IssueIdentifiersProps) {
  const shouldShowCue = issueUsesCue(issueType) && Boolean(cueValue?.trim());

  return (
    <span>
      <strong className="font-bold text-white">CH</strong>{" "}
      <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
        {channelNumber}
      </strong>
      {shouldShowCue ? (
        <>
          <span className="text-[#64748b]"> | </span>
          <strong className="font-bold text-white">{cueLabel}</strong>{" "}
          <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
            {cueValue}
          </strong>
        </>
      ) : null}
      <span className="text-[#64748b]"> | </span>
      <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
        {formatIssueLabel(issueType)}
      </strong>
    </span>
  );
}
