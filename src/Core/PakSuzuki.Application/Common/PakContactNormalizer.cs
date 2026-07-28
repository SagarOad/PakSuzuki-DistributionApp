using System.Text.RegularExpressions;

namespace PakSuzuki.Application.Common;

public static class PakContactNormalizer
{
    /// <summary>Accepts 13 digits or 00000-0000000-0 → always stores dashed form.</summary>
    public static string NormalizeCnic(string? raw)
    {
        var digits = DigitsOnly(raw);
        if (digits.Length != 13) return raw?.Trim() ?? string.Empty;
        return $"{digits[..5]}-{digits.Substring(5, 7)}-{digits[^1]}";
    }

    /// <summary>Accepts 03XXXXXXXXX with optional spaces/dashes.</summary>
    public static string NormalizeMobile(string? raw)
    {
        var digits = DigitsOnly(raw);
        if (digits.Length == 10 && digits.StartsWith('3')) return "0" + digits;
        if (digits.Length == 12 && digits.StartsWith("92")) return "0" + digits[2..];
        return digits;
    }

    public static string DigitsOnly(string? raw) =>
        string.IsNullOrWhiteSpace(raw) ? string.Empty : Regex.Replace(raw, @"\D", "");

    public static bool IsValidCnic(string? raw) => DigitsOnly(raw).Length == 13;

    public static bool IsValidPkMobile(string? raw) =>
        Regex.IsMatch(NormalizeMobile(raw), @"^03\d{9}$");
}
