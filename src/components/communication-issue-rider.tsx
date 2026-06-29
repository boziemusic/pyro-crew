import { IssueIdentifiers } from "@/components/issue-identifiers";

export type CommunicationIssueContext = {
  channelNumber: number;
  cueValue: string;
  issueType: string;
  positionName: string | null;
};

export function CommunicationIssueRider({
  issue,
}: {
  issue: CommunicationIssueContext | null;
}) {
  if (!issue) {
    return null;
  }

  return (
    <div className="border-b border-white/10 bg-[#070b18]/90 px-4 py-2">
      <p className="truncate text-xs text-[#cbd5e1]">
        <IssueIdentifiers
          channelNumber={issue.channelNumber}
          cueValue={issue.cueValue}
          issueType={issue.issueType}
        />
        <span className="mx-2 text-[#64748b]">|</span>
        <strong className="font-bold text-white">Location:</strong>{" "}
        <strong className="font-bold text-[#4ade80]">
          {issue.positionName ?? "—"}
        </strong>
      </p>
    </div>
  );
}
