using PakSuzuki.Application.Common.Exceptions;

namespace PakSuzuki.Application.Common.Images;

/// <summary>
/// Fixed aspect ratios for storefront / promo banners so distributor &amp; retailer apps layout cleanly.
/// </summary>
public static class BannerImageAspect
{
    public const string Header = "Header";
    public const string Category = "Category";
    public const string NewsletterPopUp = "NewsletterPopUp";
    public const string PromotionBanner = "PromotionBanner";

    /// <summary>Width ÷ height targets.</summary>
    private static readonly Dictionary<string, (double Ratio, string Label)> Specs = new(StringComparer.OrdinalIgnoreCase)
    {
        [Header] = (16.0 / 5.0, "16:5 (wide header)"),
        [Category] = (16.0 / 10.0, "16:10 (category card)"),
        [NewsletterPopUp] = (335.0 / 156.0, "335×156 (newsletter)"),
        [PromotionBanner] = (1.0, "1:1 (square promotion)")
    };

    private const double Tolerance = 0.08; // ±8%

    public static string? KindFromFolder(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder)) return null;
        var f = folder.Trim().ToLowerInvariant();
        if (f is "header-banners" or "header") return Header;
        if (f is "category-banners" or "category") return Category;
        return null;
    }

    public static void EnsureValid(Stream stream, string kind)
    {
        if (!Specs.TryGetValue(kind, out var spec))
            throw new ConflictException($"Unknown banner kind '{kind}'.");

        if (!stream.CanSeek)
            throw new ConflictException("Image stream must be seekable for validation.");

        var pos = stream.Position;
        var dims = ImageDimensionReader.TryRead(stream);
        stream.Position = pos;

        if (dims is null)
            throw new ConflictException(
                $"Could not read image size. Upload a JPG or PNG matching {spec.Label}.");

        var (w, h) = dims.Value;
        if (w < 32 || h < 32)
            throw new ConflictException("Image is too small. Use a larger banner image.");

        var actual = (double)w / h;
        var delta = Math.Abs(actual - spec.Ratio) / spec.Ratio;
        if (delta > Tolerance)
            throw new ConflictException(
                $"Image is {w}×{h} (ratio {actual:0.##}). Required aspect for this banner is {spec.Label} (±8%).");
    }
}

/// <summary>Reads width/height from PNG or JPEG without external packages.</summary>
public static class ImageDimensionReader
{
    public static (int Width, int Height)? TryRead(Stream stream)
    {
        if (!stream.CanSeek) return null;
        var start = stream.Position;
        try
        {
            Span<byte> header = stackalloc byte[24];
            var read = stream.Read(header);
            if (read < 10) return null;

            // PNG
            if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
            {
                if (read < 24) return null;
                var w = (header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19];
                var h = (header[20] << 24) | (header[21] << 16) | (header[22] << 8) | header[23];
                return (w, h);
            }

            // JPEG
            if (header[0] == 0xFF && header[1] == 0xD8)
            {
                stream.Position = start + 2;
                return ReadJpeg(stream);
            }

            return null;
        }
        catch
        {
            return null;
        }
        finally
        {
            stream.Position = start;
        }
    }

    private static (int Width, int Height)? ReadJpeg(Stream stream)
    {
        while (stream.Position < stream.Length)
        {
            var b0 = stream.ReadByte();
            if (b0 < 0) return null;
            if (b0 != 0xFF) continue;

            int marker;
            do
            {
                marker = stream.ReadByte();
                if (marker < 0) return null;
            } while (marker == 0xFF);

            // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
            if ((marker >= 0xC0 && marker <= 0xC3)
                || (marker >= 0xC5 && marker <= 0xC7)
                || (marker >= 0xC9 && marker <= 0xCB)
                || (marker >= 0xCD && marker <= 0xCF))
            {
                var lenHi = stream.ReadByte();
                var lenLo = stream.ReadByte();
                if (lenHi < 0 || lenLo < 0) return null;
                _ = stream.ReadByte(); // precision
                var hHi = stream.ReadByte();
                var hLo = stream.ReadByte();
                var wHi = stream.ReadByte();
                var wLo = stream.ReadByte();
                if (hHi < 0 || hLo < 0 || wHi < 0 || wLo < 0) return null;
                return ((wHi << 8) | wLo, (hHi << 8) | hLo);
            }

            if (marker == 0xD9 || marker == 0xDA) return null;

            var lh = stream.ReadByte();
            var ll = stream.ReadByte();
            if (lh < 0 || ll < 0) return null;
            var segLen = (lh << 8) | ll;
            if (segLen < 2) return null;
            stream.Position += segLen - 2;
        }

        return null;
    }
}
