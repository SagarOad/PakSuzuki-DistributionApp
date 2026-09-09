using PakSuzuki.Application.Common.Models;

namespace PakSuzuki.WebApi.Common;

/// <summary>
/// One place for the rules every image upload in the API must follow (registration, profile photo,
/// extra shop photos) so limits and error messages stay identical everywhere.
/// </summary>
public static class ImageUploadRules
{
    public const int MaxFileBytes = 5 * 1024 * 1024;
    public const int MaxBusinessImages = 8;

    private static readonly string[] AllowedExtensions =
        { ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif" };

    /// <summary>Validates one optional profile photo plus a set of shop photos.</summary>
    /// <returns>Field name → messages, empty when everything is acceptable.</returns>
    public static Dictionary<string, string[]> Validate(
        IFormFile? profileImage,
        IReadOnlyCollection<IFormFile>? businessImages,
        bool businessImagesRequired,
        string profileField = "profileImage",
        string businessField = "businessImages")
    {
        var errors = new Dictionary<string, string[]>();

        if (profileImage is not null && Describe(profileImage) is { } profileError)
            errors[profileField] = new[] { profileError };

        var provided = businessImages?.Where(f => f.Length > 0).ToList() ?? new List<IFormFile>();

        if (businessImagesRequired && provided.Count == 0)
        {
            errors[businessField] = new[]
            {
                $"At least one shop / business photo is required (form field: {businessField})."
            };
            return errors;
        }

        if (provided.Count > MaxBusinessImages)
        {
            errors[businessField] = new[] { $"You can upload at most {MaxBusinessImages} photos." };
            return errors;
        }

        var fileErrors = provided.Select(Describe).OfType<string>().Distinct().ToArray();
        if (fileErrors.Length > 0) errors[businessField] = fileErrors;

        return errors;
    }

    /// <summary>Validates a single required image (profile photo, proof, …).</summary>
    public static Dictionary<string, string[]> ValidateSingle(IFormFile? image, string field = "file")
    {
        if (image is null || image.Length == 0)
            return new Dictionary<string, string[]>
            {
                [field] = new[] { $"An image file is required (form field: {field})." }
            };

        return Describe(image) is { } error
            ? new Dictionary<string, string[]> { [field] = new[] { error } }
            : new Dictionary<string, string[]>();
    }

    /// <summary>Reads the uploaded files as Application-layer images (streams stay open for the request).</summary>
    public static UploadedImage? ToUploadedImage(IFormFile? file) =>
        file is { Length: > 0 } ? new UploadedImage(file.FileName, file.OpenReadStream()) : null;

    public static List<UploadedImage> ToUploadedImages(IEnumerable<IFormFile>? files) =>
        (files ?? Enumerable.Empty<IFormFile>())
            .Where(f => f.Length > 0)
            .Select(f => new UploadedImage(f.FileName, f.OpenReadStream()))
            .ToList();

    private static string? Describe(IFormFile file)
    {
        if (file.Length == 0) return $"'{file.FileName}' is empty.";
        if (file.Length > MaxFileBytes)
            return $"'{file.FileName}' is larger than {MaxFileBytes / (1024 * 1024)} MB.";

        var extension = Path.GetExtension(file.FileName);
        var looksLikeImage = file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true;
        var allowedExtension = AllowedExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase);

        return looksLikeImage && allowedExtension
            ? null
            : $"'{file.FileName}' is not a supported image. Use JPG, PNG, WEBP or HEIC.";
    }
}
