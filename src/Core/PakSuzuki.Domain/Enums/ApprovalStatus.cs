namespace PakSuzuki.Domain.Enums;

// Used for both registration approvals (3.1) and order approvals (3.3).
public enum ApprovalStatus
{
    PendingReview = 0,
    SentBackForCorrection = 1,
    Approved = 2,
    Rejected = 3
}
