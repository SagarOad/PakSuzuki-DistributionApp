namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Normalizes PO lane codes so Swagger / clients can send slight variants
/// (e.g. C.K.D vs C.K.D.) and still match master data.
/// </summary>
public static class OrderLaneCodes
{
    public static string? NormalizeSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return null;
        var raw = source.Trim();
        var compact = new string(raw.Where(c => c is not ('.' or ' ' or '-' or '_')).ToArray());

        if (compact.Equals("CKD", StringComparison.OrdinalIgnoreCase))
            return "C.K.D.";
        if (compact.Equals("Local", StringComparison.OrdinalIgnoreCase)
            || compact.Equals("LOC", StringComparison.OrdinalIgnoreCase))
            return "Local";
        if (compact.Equals("Inhouse", StringComparison.OrdinalIgnoreCase)
            || compact.Equals("IH", StringComparison.OrdinalIgnoreCase))
            return "In house";

        return raw;
    }

    public static bool SameSource(string? left, string? right) =>
        string.Equals(NormalizeSource(left), NormalizeSource(right), StringComparison.OrdinalIgnoreCase);

    public static bool SameCode(string? left, string? right) =>
        string.Equals(left?.Trim(), right?.Trim(), StringComparison.OrdinalIgnoreCase);
}
