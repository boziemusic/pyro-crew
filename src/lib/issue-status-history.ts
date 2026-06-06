export function getHistoryWriteFailureMessage(errorMessage: string) {
  const guidance =
    "Developer action: add a temporary development RLS policy permitting anon INSERT access to public.issue_status_history. Remove or replace it when authentication is implemented.";

  if (errorMessage.toLowerCase().includes("row-level security")) {
    return `Issue status updated successfully, but status history was not recorded because RLS blocked the insert. ${guidance}`;
  }

  return `Issue status updated successfully, but status history was not recorded: ${errorMessage}. ${guidance}`;
}

export function getHistoryReadFailureMessage(errorMessage: string) {
  return `Issue status history could not be read: ${errorMessage}. Developer action: verify the temporary development RLS SELECT policy for public.issue_status_history.`;
}
