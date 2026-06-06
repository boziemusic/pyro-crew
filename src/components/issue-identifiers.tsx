type IssueIdentifiersProps = {
  channelNumber: number | string;
  cueValue: string;
  issueType: string;
  cueLabel?: "Cue" | "Cue(s)";
};

export function formatIssueLabel(value: string) {
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
  const emphasizedClassName = "font-bold text-[#f28b82]";

  return (
    <span>
      CH <strong className={emphasizedClassName}>{channelNumber}</strong>
      <span className="text-[#64748b]"> | </span>
      {cueLabel} <strong className={emphasizedClassName}>{cueValue}</strong>
      <span className="text-[#64748b]"> | </span>
      <strong className={emphasizedClassName}>
        {formatIssueLabel(issueType)}
      </strong>
    </span>
  );
}
